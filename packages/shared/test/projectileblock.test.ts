import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { fireVolleyProjectiles, firePerSquareProjectile } from '../src'

// Impenetrable Copse: "Projectiles can't enter this site from the outside." The Ranged
// path already honored this; SPELL/effect projectiles (Magic Missile etc.) did NOT — the
// ray passed through the Copse and hit units on/behind it. Fixed in raySquares/projectilePath.

describe('Impenetrable Copse blocks spell projectiles (not just Ranged shots)', () => {
  function laneWithCopse() {
    const g = newGame(); keepBoth(g); g.turn = 5
    // a straight surface lane east from (0,1): sites so the ray can travel
    placeSite(g, 0, 'Spire', 0, 1)
    placeSite(g, 0, 'Spire', 1, 1)
    placeSite(g, 0, 'Impenetrable Copse', 2, 1) // the cover
    placeSite(g, 0, 'Spire', 3, 1)
    const front = summonCard(g, 1, 'Ancient Dragon', 1, 1) // BEFORE the copse
    const behind = summonCard(g, 1, 'Ancient Dragon', 3, 1) // ON/behind the copse
    return { g, front, behind }
  }

  it('a volley hits a unit IN FRONT of the copse but never one behind it', () => {
    const { g, front, behind } = laneWithCopse()
    fireVolleyProjectiles(g, {
      player: 0, ox: 0, oy: 1, region: 'surface', dir: 'e',
      volleys: 3, damage: 1, filter: 'notStealth', srcName: 'Firebolts',
    })
    expect(front.damage, 'the unit before the copse is hit').toBeGreaterThan(0)
    expect(behind.damage, 'the copse blocks the ray — nothing behind it is hit').toBe(0)
  })

  it('with only a unit BEHIND the copse, the ray is fully blocked (no hit)', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Spire', 0, 1)
    placeSite(g, 0, 'Spire', 1, 1)
    placeSite(g, 0, 'Impenetrable Copse', 2, 1)
    placeSite(g, 0, 'Spire', 3, 1)
    const behind = summonCard(g, 1, 'Ancient Dragon', 3, 1)
    firePerSquareProjectile(g, {
      player: 0, ox: 0, oy: 1, region: 'surface', dir: 'e',
      damages: [2, 2, 2, 2], filter: 'notStealth', srcName: 'Ice Lance',
    })
    expect(behind.damage, 'per-square projectile is blocked too').toBe(0)
  })
})
