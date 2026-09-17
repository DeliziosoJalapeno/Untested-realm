import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'

// Stygian Archers' onKill ("summon a Skeleton where the victim died") must fire EXACTLY ONCE on a
// ranged kill. Regression: a projectile hit fires its own onKill (resolveProjectileHit) AND was
// recorded in damageCredit with struck=false, so killUnit ALSO fired it → the Skeleton rose twice.
describe('Stygian Archers onKill fires once on a ranged kill', () => {
  it('shooting a Skeleton dead summons exactly ONE replacement token', () => {
    const g: any = newGame(7); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    placeSite(g, 0, 'Rustic Village', 3, 1) // the victim's square (east) — a site so the token can rise here
    const archer = summonCard(g, 0, 'Stygian Archers', 2, 1)
    archer.enteredTurn = -1; archer.tapped = false
    summonCard(g, 1, 'Skeleton', 3, 1) // enemy 1/1 token, dies to the 3-damage shot

    act(g, 0, { t: 'activate', sourceId: archer.id, ability: 'ranged', extra: { direction: 'e' } })
    let guard = 0
    while (g.prompts.length && guard++ < 8) answer(g, g.prompts[0].kind === 'defend' ? [] : null)

    const risen = Object.values(g.units).filter((u: any) => u.name === 'Skeleton' && u.controller === 0)
    expect(risen.length, 'exactly one Skeleton rises (was 2 — the trigger fired twice)').toBe(1)
  })
})
