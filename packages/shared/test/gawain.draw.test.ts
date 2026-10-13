// Sir Gawain: "takes damage for other adjacent allies. If he dies from damage taken this way, draw a
// card." FAQ (Oct 2026): he still draws when he dies from normal AND redirected damage simultaneously —
// so the draw keys off LETHALITY (deaths in a simultaneous event are deferred), not immediate removal.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { dealDamageToUnit, checkStateBased } from '../src'

describe('Sir Gawain draws when he dies shielding', () => {
  it('redirects an adjacent ally\'s damage, dies, and draws a card', () => {
    const g = newGame(); keepBoth(g)
    const gawain = summonCard(g, 0, 'Sir Gawain', 2, 2)
    const ally = summonCard(g, 0, 'Foot Soldier', 3, 2) // orthogonally adjacent
    const handBefore = g.players[0].hand.length

    dealDamageToUnit(g, ally, 10, 1, { source: { player: 1, kind: 'magic' } })
    checkStateBased(g)

    expect(g.units[gawain.id], 'Gawain died shielding his companion').toBeUndefined()
    expect(g.units[ally.id], 'the ally was spared the blow').toBeTruthy()
    expect(g.players[0].hand.length, 'his tale inspires — drew a card').toBe(handBefore + 1)
  })
})
