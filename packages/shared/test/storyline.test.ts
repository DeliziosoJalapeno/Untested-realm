// Codex, Storyline: "If the resolution of one event triggers a new event, the new event will be inserted
// into the storyline just before the triggering event … Once the new event has been resolved, the story
// continues." Movement: "the entire movement path goes onto the storyline … Each step is resolved one at a
// time." So a trigger that asks a question during a move resolves BEFORE the next step, and whatever an
// answer sets off resolves before the older questions still waiting.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'
import { getScript, makeCtx, pushPrompt, registerCont, applyAction, type GameState } from '../src'
import '../src/cards/scripts/index'

const at = (g: GameState, id: string) => (g.units[id] ? [g.units[id].x, g.units[id].y] : null)

/** P0's Snallygaster (Movement +1, 3/3) two steps from a Troll Bridge's far side. */
function bridgeCrossing() {
  const g = newGame() as GameState; keepBoth(g)
  placeSite(g, 0, 'Rustic Village', 2, 3)
  placeSite(g, 1, 'Troll Bridge', 2, 2)
  placeSite(g, 1, 'Rustic Village', 2, 1)
  const u = summonCard(g, 0, 'Snallygaster', 2, 3); u.enteredTurn = -1
  return { g, u }
}
const crossPath = [{ x: 2, y: 2, region: 'surface' as const }, { x: 2, y: 1, region: 'surface' as const }]

describe('a move stops at each step while its trigger is resolving', () => {
  it('stops on the Troll Bridge until the toll is settled', () => {
    const { g, u } = bridgeCrossing()
    act(g, 0, { t: 'moveAttack', unitId: u.id, path: crossPath })
    expect(at(g, u.id), 'still on the bridge').toEqual([2, 2])
    expect(g.prompts.map((p) => p.cont)).toEqual(['script:Troll Bridge:toll'])
  })

  it('paying the toll lets it take its next step', () => {
    const { g, u } = bridgeCrossing()
    act(g, 0, { t: 'moveAttack', unitId: u.id, path: crossPath })
    answer(g, [0])
    expect(at(g, u.id)).toEqual([2, 1])
    expect(g.units[u.id].damage).toBe(0)
  })

  it('refusing it: the troll strikes on the bridge, and the dead mover never takes the next step', () => {
    const { g, u } = bridgeCrossing()
    act(g, 0, { t: 'moveAttack', unitId: u.id, path: crossPath })
    answer(g, [])
    expect(g.units[u.id], 'killed by the 3 damage').toBeUndefined()
  })

  it('a Move & Attack still attacks at the end of its path once the toll is paid', () => {
    const { g, u } = bridgeCrossing()
    const foe = summonCard(g, 1, 'Wild Boars', 2, 1); foe.enteredTurn = -1
    act(g, 0, { t: 'moveAttack', unitId: u.id, path: crossPath, attack: { unit: foe.id } })
    expect(at(g, u.id)).toEqual([2, 2])
    answer(g, [0])
    expect(at(g, u.id)).toEqual([2, 1])
    for (let i = 0; i < 6 && g.prompts.length; i++) answer(g, g.prompts[0].kind === 'defend' ? [] : null)
    expect(g.units[foe.id], 'the attack happened: the Boars are dead').toBeUndefined()
  })

  it('a move with no trigger on the way is unchanged', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 3); placeSite(g, 0, 'Rustic Village', 2, 2); placeSite(g, 0, 'Rustic Village', 2, 1)
    const u = summonCard(g, 0, 'Snallygaster', 2, 3); u.enteredTurn = -1
    act(g, 0, { t: 'moveAttack', unitId: u.id, path: crossPath })
    expect(at(g, u.id)).toEqual([2, 1])
    expect(g.prompts).toHaveLength(0)
  })
})

describe('scripted rolls stop at each step too', () => {
  function hotwheelOverTwoBridges() {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0); placeSite(g, 1, 'Troll Bridge', 2, 1); placeSite(g, 1, 'Troll Bridge', 2, 2)
    const hw = summonCard(g, 0, 'Hotwheel', 2, 0)
    getScript('Hotwheel')!.genesis!(makeCtx(g, hw.id, 0, []))
    return { g, hw }
  }

  it('Hotwheel waits on the first bridge for its toll, then rolls on to the second', () => {
    const { g, hw } = hotwheelOverTwoBridges()
    expect(at(g, hw.id), 'stopped on bridge 1').toEqual([2, 1])
    expect(g.prompts).toHaveLength(1)
    answer(g, [0])
    expect(at(g, hw.id), 'rolled on to bridge 2').toEqual([2, 2])
    expect(g.prompts.map((p) => p.cont)).toEqual(['script:Troll Bridge:toll'])
  })

  it('refusing the first toll kills the Hotwheel before it rolls any further', () => {
    const { g, hw } = hotwheelOverTwoBridges()
    answer(g, [])
    expect(g.units[hw.id]).toBeUndefined()
    expect(g.prompts, 'never reached the second bridge').toHaveLength(0)
  })
})

describe('what an answer sets off resolves before older questions', () => {
  it("a continuation's follow-up question goes in front of a question already waiting", () => {
    const g = newGame() as GameState; keepBoth(g)
    const order: string[] = []
    registerCont('test:first', (state) => {
      order.push('first')
      pushPrompt(state, { player: 0, kind: 'yesNo', title: 'follow-up', data: {}, cont: 'test:followup', ctx: {} })
    })
    registerCont('test:followup', () => void order.push('followup'))
    registerCont('test:older', () => void order.push('older'))
    pushPrompt(g, { player: 0, kind: 'yesNo', title: 'first', data: {}, cont: 'test:first', ctx: {} })
    pushPrompt(g, { player: 0, kind: 'yesNo', title: 'older', data: {}, cont: 'test:older', ctx: {} })
    for (let i = 0; i < 3 && g.prompts.length; i++) expect(applyAction(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: true }).ok).toBe(true)
    expect(order).toEqual(['first', 'followup', 'older'])
  })
})

describe('an event whose source has left the realm is ignored', () => {
  it('a toll from a Troll Bridge destroyed before it is paid is not asked', () => {
    const { g, u } = bridgeCrossing()
    act(g, 0, { t: 'moveAttack', unitId: u.id, path: crossPath })
    const bridge = Object.values(g.sites).find((s) => s.name === 'Troll Bridge')!
    const hand = g.players[0].hand.length
    makeCtx(g, bridge.id, 1, []).destroySite(bridge.id)
    if (g.prompts.length) answer(g, [0]) // still on screen? paying it anyway must do nothing
    expect(g.players[0].hand.length, 'nothing discarded').toBe(hand)
    expect(g.units[u.id]?.damage, 'and no strike').toBe(0)
  })
})
