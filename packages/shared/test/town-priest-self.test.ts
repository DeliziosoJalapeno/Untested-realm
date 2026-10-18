// Town Priest: "Genesis → Return target adjacent Evil minion to its owner's hand." Under a Corruptor its
// Mortal type also makes it Undead (Evil), and "adjacent" includes its own square — so it may target ITSELF
// and go back to hand. Genesis targets are picked at cast time, before the minion exists, so "itself" is the
// SELF_TARGET placeholder.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, injectToHand, waiveThreshold } from './helpers'
import { applyAction, avatarOf, SELF_TARGET, genesisSelfTargetOk, type GameState } from '../src'
import '../src/cards/scripts/index'

function board(corruptor: boolean): GameState {
  const g = newGame(42, 0); keepBoth(g)
  for (let x = 0; x <= 4; x++) for (let y = 0; y <= 3; y++) placeSite(g, 0, 'Active Volcano', x, y)
  waiveThreshold(g, 0)
  g.players[0].mana = 10
  if (corruptor) { const av = avatarOf(g, 0); av.name = 'Corruptor'; g.cards[av.cardId].name = 'Corruptor' }
  return g
}
const at = { x: 2, y: 2, region: 'surface' as const }

describe('Town Priest targeting itself', () => {
  it('under a Corruptor it may target itself and returns to its owner\'s hand', () => {
    const g = board(true)
    expect(genesisSelfTargetOk(g, 0, 'Town Priest', at, 0)).toBe(true)
    const id = injectToHand(g, 0, 'Town Priest')
    const r = applyAction(g, 0, { t: 'castSpell', cardId: id, casterId: avatarOf(g, 0).id, at, targets: [SELF_TARGET] } as any)
    expect(r.ok, String(r.error)).toBe(true)
    expect(Object.values(g.units).some((u) => u.name === 'Town Priest'), 'the Priest left the realm').toBe(false)
    expect(g.players[0].hand).toContain(id)
  })

  it('without a Corruptor it is not Evil, so it can\'t pick itself', () => {
    const g = board(false)
    expect(genesisSelfTargetOk(g, 0, 'Town Priest', at, 0)).toBe(false)
    const id = injectToHand(g, 0, 'Town Priest')
    const r = applyAction(g, 0, { t: 'castSpell', cardId: id, casterId: avatarOf(g, 0).id, at, targets: [SELF_TARGET] } as any)
    expect(r.ok).toBe(false)
  })

  it('the placeholder is never a legal target for a magic', () => {
    const g = board(true)
    const id = injectToHand(g, 0, 'Trial by Water')
    const r = applyAction(g, 0, { t: 'castSpell', cardId: id, casterId: avatarOf(g, 0).id, targets: [SELF_TARGET, SELF_TARGET] } as any)
    expect(r.ok).toBe(false)
  })
})
