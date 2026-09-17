// A blanked face-down husk (a double-faced card flipped to a side it lacks — e.g. Vivien copying an
// unflipped Druid's flip and flipping herself). FAQ: "she is no longer a minion, has no card type or
// abilities… she could turn off Pristine Paradise, and would be destroyed by Roots of Yggdrasil."
// So: NOT a unit (never targeted/attacked/hit as one), but STILL occupies its square.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import {
  unitsAt, occupantsAt, isSiteEmpty, isBlanked, validateTarget, beginAttack, getScript, makeCtx,
  type GameState,
} from '../src'
import '../src/cards/scripts/index'

function husk(g: GameState, player: 0 | 1, x: number, y: number) {
  const u = summonCard(g, player, 'Vivien the Enchantress', x, y); u.flipped = true; u.enteredTurn = -1
  return u
}

describe('a blanked husk is not a unit, but still occupies its square', () => {
  it('unitsAt excludes it while occupantsAt (physical presence) includes it', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const real = summonCard(g, 0, 'Bone Jumble', 2, 2); real.enteredTurn = -1
    const h = husk(g, 0, 2, 2)
    expect(isBlanked(h), 'the flipped Vivien is a blanked husk').toBe(true)

    const units = unitsAt(g, 2, 2).map((u) => u.id)
    expect(units, 'the real minion is a unit here').toContain(real.id)
    expect(units, 'the husk is NOT a unit').not.toContain(h.id)
    const occ = occupantsAt(g, 2, 2).map((u) => u.id)
    expect(occ, 'but the husk still physically occupies the square').toEqual(expect.arrayContaining([real.id, h.id]))
    expect(isSiteEmpty(g, 2, 2), 'so the site is not empty').toBe(false)
  })

  it('is not a legal spell target (no card type), but a real minion is', () => {
    const g = newGame() as GameState; keepBoth(g)
    const caster = summonCard(g, 0, 'Bone Jumble', 2, 2); caster.enteredTurn = -1
    const real = summonCard(g, 1, 'Bone Jumble', 2, 2); real.enteredTurn = -1
    const h = husk(g, 1, 2, 2)
    for (const what of ['minion', 'unit'] as const) {
      const spec: any = { what, count: 1, targeted: true }
      expect(validateTarget(g, spec, { unit: h.id }, caster, 0), `${what}: husk rejected`).toBeTruthy()
      expect(validateTarget(g, spec, { unit: real.id }, caster, 0), `${what}: real minion ok`).toBeNull()
    }
  })

  it('cannot be attacked', () => {
    const g = newGame() as GameState; keepBoth(g)
    const attacker = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); attacker.enteredTurn = -1
    const h = husk(g, 1, 2, 2)
    expect(beginAttack(g, attacker, { unit: h.id }), 'attacking a face-down husk is illegal').toBeTruthy()
  })

  it('Lightning Bolt at its location can only hit the real unit, never the husk', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const av = summonCard(g, 0, 'Bone Jumble', 0, 0); av.enteredTurn = -1 // a caster reference
    const victim = summonCard(g, 1, 'Bone Jumble', 2, 2); victim.enteredTurn = -1 // 1/1 dies to 3
    const h = husk(g, 1, 2, 2)

    getScript('Lightning Bolt')!.onCast!(makeCtx(g, av.id, 0, [{ square: { x: 2, y: 2, region: 'surface' } }] as any))
    expect(g.units[victim.id], 'the only real unit at the square is struck dead').toBeUndefined()
    expect(g.units[h.id], 'the husk is untouched — it is not a unit the bolt can pick').toBeTruthy()
  })

  it('a lone husk on a square is not a valid Lightning Bolt victim (bolt finds no unit)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const av = summonCard(g, 0, 'Bone Jumble', 0, 0); av.enteredTurn = -1
    const h = husk(g, 1, 2, 2)
    getScript('Lightning Bolt')!.onCast!(makeCtx(g, av.id, 0, [{ square: { x: 2, y: 2, region: 'surface' } }] as any))
    expect(g.units[h.id], 'the husk takes no damage — nothing to hit').toBeTruthy()
    expect(g.units[h.id]?.damage ?? 0).toBe(0)
  })
})
