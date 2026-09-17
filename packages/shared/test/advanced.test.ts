import { describe, it, expect } from 'vitest'
import { newGame, act, actFail, keepBoth, answer, fetchToHand, giveMana, injectToHand } from './helpers'
import {
  avatarOf,
  siteAt,
  summonToken,
  effKeywords,
  reachableLocations,
  pickUp,
  drop,
  validateSummonAt,
  occupiedSquares,
} from '../src'
import type { GameState } from '../src'

/** small battlefield: p0 owns sites at (2,0) and (3,0) */
function board(): GameState {
  const g = newGame()
  keepBoth(g)
  const v1 = fetchToHand(g, 0, 'Rustic Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
  if (g.prompts.length) answer(g, false)
  avatarOf(g, 0).tapped = false
  const v2 = fetchToHand(g, 0, 'Simple Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v2, x: 3, y: 0 })
  if (g.prompts.length) answer(g, false)
  return g
}

describe('damage splitting', () => {
  it('a striker may divide damage among multiple defenders', () => {
    const g = board()
    // attacker: 3-power token; defenders: two 1/1s that will both defend
    const attacker = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    attacker.enteredTurn = 0
    attacker.modifiers.push({ kind: 'power', amount: 2, duration: 'permanent', turn: 0, sourcePlayer: 0 })
    const d1 = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    const d2 = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    d1.enteredTurn = 0
    d2.enteredTurn = 0
    // attack d1; opponent defends with d2; d1 stays → attacker faces two 1/1s
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: d1.id } })
    expect(g.prompts[0]?.kind).toBe('defend')
    answer(g, [d2.id])
    expect(g.prompts[0]?.kind).toBe('stayInFight')
    answer(g, true)
    // attacker (3 power vs two enemies) must allocate
    expect(g.prompts[0]?.kind).toBe('allocateDamage')
    expect(g.prompts[0].data.power).toBe(3)
    answer(g, { strikerId: attacker.id, allocation: { [d1.id]: 1, [d2.id]: 2 } })
    // both 1/1 defenders die; attacker took 2 (one strike from each)
    expect(g.units[d1.id]).toBeUndefined()
    expect(g.units[d2.id]).toBeUndefined()
    expect(g.units[attacker.id]?.damage).toBe(2)
  })
})

describe('unit carrying', () => {
  function withCarrier(g: GameState, name: string, x = 2, y = 0) {
    giveMana(g, 0, 9)
    const id = fetchToHand(g, 0, name)
    act(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, at: { x, y } })
    return Object.values(g.units).find((u) => u.name === name)!
  }

  it('a carrier picks up an allied minion, moves with it, confers keywords', () => {
    const g = board()
    // Beast of Burden needs fire threshold — use test tokens + direct script instead:
    // Phantom Steed is air; simpler to test with tokens via engine API
    const steed = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    // pretend it's a Phantom Steed by renaming (script lookup is by name)
    steed.name = 'Phantom Steed'
    steed.enteredTurn = 0
    const rider = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    rider.enteredTurn = 0

    const err = pickUp(g, 0, steed.id, [], [rider.id])
    expect(err).toBeNull()
    expect(rider.carriedBy).toBe(steed.id)
    // steed has Voidwalk → carried rider gains it too
    expect(effKeywords(g, rider).voidwalk).toBe(true)
    // move the steed; the rider comes along
    act(g, 0, { t: 'moveAttack', unitId: steed.id, path: [{ x: 3, y: 0, region: 'surface' }] })
    expect(g.units[rider.id].x).toBe(3)
    expect(rider.carriedBy).toBe(steed.id)
  })

  it('horse tower: carrier chains move together and loops are refused', () => {
    const g = board()
    const h1 = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    const h2 = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    const rider = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    h1.name = 'War Horse'
    h2.name = 'War Horse'
    rider.name = 'War Horse' // everyone's a horse — it's towers all the way down
    for (const u of [h1, h2, rider]) u.enteredTurn = 0

    expect(pickUp(g, 0, h2.id, [], [rider.id])).toBeNull()
    h2.usedThisTurn = {}
    expect(pickUp(g, 0, h1.id, [], [h2.id])).toBeNull()
    // loop refused: rider (bottom of tower) cannot pick up h1 (top)
    rider.usedThisTurn = {}
    expect(pickUp(g, 0, rider.id, [], [h1.id])).toMatch(/loop/i)

    // the whole tower moves with h1
    act(g, 0, { t: 'moveAttack', unitId: h1.id, path: [{ x: 3, y: 0, region: 'surface' }] })
    expect(g.units[h2.id].x).toBe(3)
    expect(g.units[rider.id].x).toBe(3)
  })

  it('a carried unit moving on its own dismounts', () => {
    const g = board()
    const horse = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    horse.name = 'War Horse'
    const rider = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    for (const u of [horse, rider]) u.enteredTurn = 0
    expect(pickUp(g, 0, horse.id, [], [rider.id])).toBeNull()
    act(g, 0, { t: 'moveAttack', unitId: rider.id, path: [{ x: 3, y: 0, region: 'surface' }] })
    expect(g.units[rider.id].carriedBy).toBeFalsy()
    expect(g.units[horse.id].carryingUnits).toEqual([])
    expect(g.units[horse.id].x).toBe(2)
  })
})

describe('interjection ("wait, I forgot!")', () => {
  it('non-active player interjects with approval, acts with approval, then returns the turn', () => {
    const g = board()
    // advance to turn 2 so player 1 is active and player 0 has had a turn...
    // actually: interject as the NON-active player: on turn 1 (p0 active), p1 has
    // NOT had a turn yet → request must fail
    expect(actFail(g, 1, { t: 'requestInterject' })).toMatch(/turn/i)
    // move to turn 2 (p1 active); p0 (first player) may interject
    act(g, 0, { t: 'endTurn' })
    answer(g, 'atlas') // p1 draw
    expect(g.activePlayer).toBe(1)
    act(g, 0, { t: 'requestInterject' })
    expect(g.prompts[0]?.kind).toBe('yesNo')
    answer(g, true) // p1 allows
    expect(g.interject?.player).toBe(0)
    expect(g.activePlayer).toBe(0)
    // p0 tries to draw a site via avatar — needs approval
    avatarOf(g, 0).tapped = false
    const atlasBefore = g.players[0].hand.length
    act(g, 0, { t: 'avatarSite', mode: 'draw' })
    expect(g.prompts[0]?.player).toBe(1) // approval prompt to the turn owner
    answer(g, true)
    expect(g.players[0].hand.length).toBe(atlasBefore + 1)
    // done: the turn returns to p1
    act(g, 0, { t: 'endInterject' })
    expect(g.activePlayer).toBe(1)
    expect(g.interject).toBeNull()
  })

  it('declined interjection changes nothing', () => {
    const g = board()
    act(g, 0, { t: 'endTurn' })
    answer(g, 'atlas')
    act(g, 0, { t: 'requestInterject' })
    answer(g, false)
    expect(g.interject ?? null).toBeNull()
    expect(g.activePlayer).toBe(1)
  })
})

describe('oversized units', () => {
  function fourSites(): GameState {
    const g = newGame()
    keepBoth(g)
    const names = ['Rustic Village', 'Simple Village', 'Humble Village', 'Holy Ground']
    const spots = [
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]
    for (let i = 0; i < 4; i++) {
      const id = fetchToHand(g, 0, names[i])
      avatarOf(g, 0).tapped = false
      act(g, 0, { t: 'avatarSite', mode: 'play', cardId: id, x: spots[i].x, y: spots[i].y })
      if (g.prompts.length) answer(g, false)
    }
    return g
  }

  it('summons onto a 2x2 area of sites and occupies four squares', () => {
    const g = fourSites()
    expect(validateSummonAt(g, 0, 'Mountain Giant', { x: 2, y: 0 })).toBeNull()
    expect(validateSummonAt(g, 0, 'Mountain Giant', { x: 1, y: 0 })).toMatch(/site/i)
    giveMana(g, 0, 20)
    const id = injectToHand(g, 0, 'Mountain Giant')
    // needs EEEE affinity: villages ×3 + holy ground = 4 earth ✓
    act(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    const giant = Object.values(g.units).find((u) => u.name === 'Mountain Giant')!
    expect(giant.size).toBe('2x2')
    expect(occupiedSquares(giant).length).toBe(4)
    // it can be attacked from any of its four squares
    const foe = summonToken(g, 'Foot Soldier', 1, 3, 1)!
    foe.enteredTurn = 0
    g.activePlayer = 1
    act(g, 1, { t: 'moveAttack', unitId: foe.id, path: [], attack: { unit: giant.id } })
    if (g.prompts.length) answer(g, []) // no defenders
    expect(g.units[foe.id]).toBeUndefined() // 8-power giant strikes back
  })

  it('cannot move where a part would leave the sites', () => {
    const g = fourSites()
    giveMana(g, 0, 20)
    const id = injectToHand(g, 0, 'Mountain Giant')
    act(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    const giant = Object.values(g.units).find((u) => u.name === 'Mountain Giant')!
    giant.enteredTurn = 0
    expect(reachableLocations(g, giant)).toEqual([]) // nowhere legal to go
  })
})
