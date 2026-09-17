import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold, answer } from './helpers'

// Ball Lightning (0.3.28 FAQ): it strikes for 4, then the shooter bounces it for 2, then 1, each
// in a chosen cardinal direction. A bounce-back CAN hit the caster and allies (a projectile does
// not discriminate), but no unit may be struck twice in a single chain — the ray passes THROUGH a
// unit it has already hit. Regression guard: the pre-fix version excluded the caster on every
// bounce and tracked nothing, so it both spared the caster and could re-hit the same unit.
describe('Ball Lightning bounce chain', () => {
  it('passes through an already-hit unit and can bounce back onto the caster', () => {
    const g = newGame(42, 0); keepBoth(g); waiveThreshold(g, 0)
    const av = g.units[g.players[0].avatarUnitId]
    av.x = 1; av.y = 1; av.region = 'surface' // board is 5×4 (x:0-4, y:0-3)
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Active Volcano', x, 1) // ray must travel over sites, not void
    const e1 = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); e1.enteredTurn = 0 // 6/6 — survives 4
    const e2 = summonCard(g, 1, 'Escyllion Cyclops', 3, 1); e2.enteredTurn = 0
    const life0 = av.life! // avatars track life, not a damage counter

    castMagic(g, 0, 'Ball Lightning', { extra: { direction: 'e' } }) // 4 → E1 at (2,1)
    answer(g, 'e') // bounce 2 east from (2,1), skipping E1 → E2 at (3,1)
    answer(g, 'w') // bounce 1 west from (3,1): E2 excluded (origin), E1 excluded (already hit) → the caster at (1,1)

    expect(g.units[e1.id]?.damage, 'E1 hit once for 4, NOT re-hit on the westward pass').toBe(4)
    expect(g.units[e2.id]?.damage, 'E2 takes the 2 bounce').toBe(2)
    expect(g.units[av.id]?.life, 'the final bounce comes back and strikes the caster for 1').toBe(life0 - 1)
  })
})
