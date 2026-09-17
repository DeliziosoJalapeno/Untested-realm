// With Magellan Globe in play, "adjacent"/"nearby" target selection wraps across opposite edges.
// validateTarget is the single arbiter for both engine legality AND the GUI target highlight, so
// fixing it here makes a far-edge site a legal (and highlighted) "adjacent" target.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { validateTarget } from '../src/engine/casting'
import { avatarOf, GRID_W, type GameState } from '../src'
import '../src/cards/scripts/index'

function withGlobe(g: GameState) {
  const cid = `cglobe${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
  const aid = `aglobe${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
}

const spec = { what: 'site', count: 1, targeted: false, where: 'adjacent', label: 'an adjacent site' } as any

describe('Magellan Globe — adjacent/nearby targeting wraps', () => {
  it('a far-edge site is a legal "adjacent" target when the Globe connects the edges', () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 0; av.y = 1; av.region = 'surface'
    const far = placeSite(g, 0, 'Rustic Village', GRID_W - 1, 1) // opposite edge, same row → wrap-adjacent
    withGlobe(g)
    expect(validateTarget(g, spec, { site: far.id }, av, 0), 'far-edge site is adjacent via the wrap').toBeNull()
  })

  it('without the Globe the same far-edge site is NOT adjacent', () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 0; av.y = 1; av.region = 'surface'
    const far = placeSite(g, 0, 'Rustic Village', GRID_W - 1, 1)
    expect(validateTarget(g, spec, { site: far.id }, av, 0), 'no Globe → not adjacent').toMatch(/adjacent/i)
  })
})
