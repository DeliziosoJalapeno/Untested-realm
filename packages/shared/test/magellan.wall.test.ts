// A wall (Wall of Fire/Ice/Air/Brambles) is conjured on the BORDER of a site. An edge site's outer
// border is the seam between opposite edges — which exists ONLY when a Magellan Globe joins them.
// So that seam border is a legal wall spot with the Globe and no spot at all without it.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { getScript, makeCtx, GRID_H, type GameState } from '../src'
import '../src/cards/scripts/index'

function withGlobe(g: GameState) {
  const cid = `cglobe${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
  const aid = `aglobe${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
}

function wallAura(g: GameState, name: string, x: number, y: number): string {
  const cid = `cwall${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: 0 } as any
  const aid = `awall${g.nextId++}`
  g.auras[aid] = { id: aid, cardId: cid, name, controller: 0, squares: [{ x, y }] } as any
  return aid
}

describe('conjuring a wall on the seam border requires the Globe', () => {
  it('a top-edge site raises a wall on its outer (north/seam) border only under the Globe', () => {
    for (const globe of [false, true]) {
      const g = newGame() as GameState; keepBoth(g)
      placeSite(g, 0, 'Rustic Village', 2, GRID_H - 1) // top-row site (its north side runs off-board)
      if (globe) withGlobe(g)
      const aid = wallAura(g, 'Wall of Fire', 2, GRID_H - 1)
      // 'north' of a top-row site is off-board — a real (seam) border only when the Globe joins the edges
      getScript('Wall of Fire')!.genesis!(makeCtx(g, aid, 0, [], { x: 2, y: GRID_H - 1 }, { wallSide: 'north' }))
      const aura = g.auras[aid]
      if (globe) {
        expect(aura?.edge, 'wall spans the wrapped seam').toEqual({ a: { x: 2, y: GRID_H - 1 }, b: { x: 2, y: 0 } })
        expect(g.prompts.length, 'resolved directly, no prompt').toBe(0)
      } else {
        expect(aura?.edge, 'no seam border to raise on without a Globe').toBeUndefined()
      }
    }
  })
})
