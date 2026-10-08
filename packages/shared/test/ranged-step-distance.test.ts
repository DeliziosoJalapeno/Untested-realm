// "Up to two steps away" ranged spells must use step (Manhattan) distance, not chebyshev: from caster
// c2 (2,1) the square d4 (3,3) is dx1+dy2 = 3 steps and out of range (its chebyshev distance is only 2).
// Covers the cards that shared Minor Explosion's chebyshev bug: Mortality, Exorcism, Dispel.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites } from './helpers'
import { makeCtx, getScript, avatarOf, summonToken, type GameState } from '../src'
import '../src/cards/scripts/index'

function g0(): GameState {
  const g = newGame(42, 0) as GameState; keepBoth(g); fillSites(g) // real steps need a site path (no voids → Manhattan)
  const av = avatarOf(g, 0); av.x = 2; av.y = 1 // c2
  return g
}
const cast = (g: GameState, name: string, x: number, y: number) =>
  getScript(name)!.onCast!(makeCtx(g, avatarOf(g, 0).id, 0, [{ square: { x, y, region: 'surface' } }]) as any)

describe('"up to two steps away" uses step distance, not chebyshev', () => {
  it('Mortality: kills a Mortal 2 steps away, spares one 3 steps away', () => {
    const far = g0(); const fm = summonToken(far, 'Foot Soldier', 1, 3, 3)!
    cast(far, 'Mortality', 3, 3)
    expect(!!far.units[fm.id], 'c2→d4 (3 steps) is out of range').toBe(true)
    const near = g0(); const nm = summonToken(near, 'Foot Soldier', 1, 2, 3)!
    cast(near, 'Mortality', 2, 3)
    expect(!!near.units[nm.id], 'c2→c4 (2 steps) is killed').toBe(false)
  })

  it('Exorcism: banishes an Undead 2 steps away, spares one 3 steps away', () => {
    const far = g0(); const fs = summonToken(far, 'Skeleton', 1, 3, 3)!
    cast(far, 'Exorcism', 3, 3)
    expect(!!far.units[fs.id], 'c2→d4 (3 steps) is out of range').toBe(true)
    const near = g0(); const ns = summonToken(near, 'Skeleton', 1, 2, 3)!
    cast(near, 'Exorcism', 2, 3)
    expect(!!near.units[ns.id], 'c2→c4 (2 steps) is banished').toBe(false)
  })

  it('Dispel: destroys an artifact 2 steps away, spares one 3 steps away', () => {
    const mkArt = (g: GameState, x: number, y: number) => {
      g.cards['acT'] = { id: 'acT', name: 'Excalibur', owner: 1 } as any
      g.artifacts['aT'] = { id: 'aT', cardId: 'acT', name: 'Excalibur', conjuredBy: 1, x, y, region: 'surface', carriedBy: null, tapped: false } as any
    }
    const far = g0(); mkArt(far, 3, 3)
    cast(far, 'Dispel', 3, 3)
    expect(!!far.artifacts['aT'], 'c2→d4 (3 steps) is out of range').toBe(true)
    const near = g0(); mkArt(near, 2, 3)
    cast(near, 'Dispel', 2, 3)
    expect(!!near.artifacts['aT'], 'c2→c4 (2 steps) is destroyed').toBe(false)
  })
})
