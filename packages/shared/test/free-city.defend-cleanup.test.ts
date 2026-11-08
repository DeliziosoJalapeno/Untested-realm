// Free City "may … defend against enemy units here": it fights as a temporary 3/3 garrison standing for the
// site. Once the fight is over that garrison must leave the board — it isn't a card. It used to linger until
// the end of the turn (a phantom "Free City" minion beside the site), and also appeared when merely
// OFFERED as a defender and declined.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer, settlePrompts } from './helpers'
import { type GameState } from '../src'
import '../src/cards/scripts/index'

const garrison = (g: GameState) => Object.values(g.units).filter((u) => u.name === 'Free City')

function cityUnderAttack() {
  const g = newGame() as GameState; keepBoth(g)
  g.activePlayer = 1
  const city = placeSite(g, 0, 'Free City', 2, 2)
  placeSite(g, 1, 'Rustic Village', 2, 1)
  const ally = summonCard(g, 0, 'Conqueror Worm', 2, 2); ally.enteredTurn = -1 // 8/8, survives
  const foe = summonCard(g, 1, 'Bone Jumble', 2, 1); foe.enteredTurn = -1 // 1/1
  act(g, 1, { t: 'moveAttack', unitId: foe.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: ally.id } })
  return { g, city, ally, foe }
}

describe('Free City defending leaves no phantom behind', () => {
  it('after defending, the garrison is gone and the site stands', () => {
    const { g, city } = cityUnderAttack()
    const p = g.prompts.find((q) => q.kind === 'defend')
    const cityDefender = garrison(g)[0]
    expect(p && cityDefender, 'the city is offered as a defender').toBeTruthy()
    answer(g, [cityDefender.id])
    settlePrompts(g)
    expect(garrison(g), 'no Free City unit left on the board').toEqual([])
    expect(g.sites[city.id]).toBeDefined()
  })

  it('once per turn: having defended, the city is not offered again this turn', () => {
    const { g, ally } = cityUnderAttack()
    answer(g, [garrison(g)[0].id])
    settlePrompts(g)
    const foe2 = summonCard(g, 1, 'Bone Jumble', 2, 1); foe2.enteredTurn = -1
    act(g, 1, { t: 'moveAttack', unitId: foe2.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: ally.id } })
    expect(garrison(g), 'no second garrison').toEqual([])
  })

  it('declining keeps it available: a second attack this turn can still be defended by the city', () => {
    const { g, ally } = cityUnderAttack()
    answer(g, [])
    settlePrompts(g)
    const foe2 = summonCard(g, 1, 'Bone Jumble', 2, 1); foe2.enteredTurn = -1
    act(g, 1, { t: 'moveAttack', unitId: foe2.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: ally.id } })
    expect(garrison(g).length).toBe(1)
  })

  it('declining to defend leaves no garrison either', () => {
    const { g } = cityUnderAttack()
    expect(g.prompts.find((q) => q.kind === 'defend')).toBeTruthy()
    answer(g, [])
    settlePrompts(g)
    expect(garrison(g)).toEqual([])
  })
})
