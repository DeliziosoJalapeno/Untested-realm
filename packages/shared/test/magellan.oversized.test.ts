// FAQ 1: with Magellan Globe in play, an oversized (2x2) minion may be cast on the edge of the
// realm — its footprint wraps to the opposite edge. Without the Globe the edge anchor is rejected.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { validateSummonAt } from '../src/engine/casting'
import { occupiedSquares, GRID_W, GRID_H } from '../src/engine/grid'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

function withGlobe(g: GameState) {
  const cid = `cglobe${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
  const aid = `aglobe${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
}
function fullBoard(g: GameState) {
  for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) placeSite(g, 0, 'Rustic Village', x, y)
}

describe('Magellan Globe — oversized at the edge (FAQ 1)', () => {
  it('an edge anchor is a legal summon under the Globe', () => {
    const g = newGame(); keepBoth(g); fullBoard(g); withGlobe(g)
    expect(validateSummonAt(g, 0, 'Mountain Giant', { x: GRID_W - 1, y: 1 }), 'legal, wraps the footprint').toBeNull()
  })

  it('without the Globe the same edge anchor is rejected', () => {
    const g = newGame(); keepBoth(g); fullBoard(g)
    expect(validateSummonAt(g, 0, 'Mountain Giant', { x: GRID_W - 1, y: 1 }), 'must fit inside the realm').toMatch(/fit inside/i)
  })

  it('occupiedSquares wraps the footprint of an edge-anchored 2x2 unit', () => {
    const g = newGame(); keepBoth(g)
    const u = summonCard(g, 0, 'Mountain Giant', GRID_W - 1, 1); (u as any).size = '2x2'
    const sq = occupiedSquares(u)
    expect(sq.length, 'four squares').toBe(4)
    expect(sq).toContainEqual({ x: GRID_W - 1, y: 1 })
    expect(sq).toContainEqual({ x: 0, y: 1 }) // east column +1 wraps to the west column
    expect(sq).toContainEqual({ x: GRID_W - 1, y: 2 })
    expect(sq).toContainEqual({ x: 0, y: 2 })
  })
})
