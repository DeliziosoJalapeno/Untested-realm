// Thankless Squire: "Lance, Lance, Lance" — it enters carrying three Lance tokens, however it enters.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, answer, fetchToHand, injectToHand, giveMana, waiveThreshold } from './helpers'
import { effectSummonUnit, type GameState, type UnitState } from '../src'

function board(): GameState {
  const g = newGame(); keepBoth(g)
  const v = fetchToHand(g, 0, 'Rustic Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v, x: 2, y: 0 })
  if (g.prompts.length) answer(g, false)
  return g
}
const lances = (g: GameState, u: UnitState) => u.carrying.filter((id) => g.artifacts[id]?.name === 'Lance').length

describe('Thankless Squire enters with three Lances', () => {
  it('when cast', () => {
    const g = board()
    waiveThreshold(g, 0); giveMana(g, 0, 10)
    const c = injectToHand(g, 0, 'Thankless Squire')
    act(g, 0, { t: 'castSpell', cardId: c, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    const squire = Object.values(g.units).find((u) => u.name === 'Thankless Squire')!
    expect(lances(g, squire)).toBe(3)
  })

  it('when summoned by an effect', () => {
    const g = board()
    const cardId = injectToHand(g, 0, 'Thankless Squire')
    g.players[0].hand = g.players[0].hand.filter((id) => id !== cardId)
    const squire = effectSummonUnit(g, {
      id: 'usq', cardId, name: 'Thankless Squire', owner: 0, controller: 0, isAvatar: false,
      x: 2, y: 0, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
    })!
    expect(lances(g, squire)).toBe(3)
  })
})
