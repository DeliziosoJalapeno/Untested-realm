// Minor Explosion: "deal 3 damage to each unit at target location up to two steps away." "Steps" is the
// step/Manhattan distance (def. 1), NOT chebyshev — from caster c2 (2,1) the square d4 (3,3) is dx1+dy2
// = 3 steps away and must be out of range, even though its chebyshev distance is only 2.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { makeCtx, getScript, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

const cast = (g: GameState, x: number, y: number) =>
  getScript('Minor Explosion')!.onCast!(makeCtx(g, avatarOf(g, 0).id, 0, [{ square: { x, y, region: 'surface' } }]) as any)

describe('Minor Explosion uses step (Manhattan) range, not chebyshev', () => {
  it('cannot hit a location 3 steps away (c2 → d4)', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 1 // c2
    const victim = summonCard(g, 1, 'Escyllion Cyclops', 3, 3); victim.enteredTurn = -1 // d4 = 3 steps
    cast(g, 3, 3)
    expect(victim.damage, 'a 3-step target is out of range — no damage').toBe(0)
  })

  it('hits a location exactly 2 steps away', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 1 // c2
    const victim = summonCard(g, 1, 'Escyllion Cyclops', 2, 3); victim.enteredTurn = -1 // c4 = 2 steps
    cast(g, 2, 3)
    expect(victim.damage, 'a 2-step target takes 3 damage').toBe(3)
  })
})
