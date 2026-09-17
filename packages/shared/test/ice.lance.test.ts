import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold } from './helpers'

// Ice Lance (and every per-square piercing projectile) is loosed from the caster's SITE:
// the path's FIRST location is the caster's own square, per the rulebook. It used to skip
// that square and start dealing damage from the next one.

describe('Ice Lance starts at the caster\'s site', () => {
  it('deals 3 / 2 / 1 beginning on the caster\'s own square', () => {
    const g = newGame(42, 0); keepBoth(g); waiveThreshold(g, 0)
    const av = g.units[g.players[0].avatarUnitId]
    av.x = 1; av.y = 1; av.region = 'surface'
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Active Volcano', x, 1) // sites along the ray
    const e0 = summonCard(g, 1, 'Escyllion Cyclops', 1, 1); e0.enteredTurn = 0 // shares the caster's site
    const e1 = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); e1.enteredTurn = 0
    const e2 = summonCard(g, 1, 'Escyllion Cyclops', 3, 1); e2.enteredTurn = 0
    castMagic(g, 0, 'Ice Lance', { extra: { direction: 'e' } })
    expect(g.units[e0.id]?.damage, 'the caster\'s-site enemy is the FIRST hit (3)').toBe(3)
    expect(g.units[e1.id]?.damage).toBe(2)
    expect(g.units[e2.id]?.damage).toBe(1)
  })

  it('ignores an ally sharing the caster\'s site (rulebook origin rule)', () => {
    const g = newGame(42, 0); keepBoth(g); waiveThreshold(g, 0)
    const av = g.units[g.players[0].avatarUnitId]
    av.x = 1; av.y = 1; av.region = 'surface'
    for (const x of [1, 2]) placeSite(g, 0, 'Active Volcano', x, 1)
    const ally = summonCard(g, 0, 'Escyllion Cyclops', 1, 1); ally.enteredTurn = 0 // ally on the caster's site
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); foe.enteredTurn = 0
    castMagic(g, 0, 'Ice Lance', { extra: { direction: 'e' } })
    // damage is tied to the LOCATION index (origin=3, +1=2, +2=1): the origin's 3 is wasted
    // on the ignored ally, and the foe one square on takes that location's 2.
    expect(g.units[ally.id]?.damage, 'allies at the origin are spared').toBe(0)
    expect(g.units[foe.id]?.damage, 'the +1 location deals 2').toBe(2)
  })
})
