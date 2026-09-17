// The direction-picker conveyor lane (directionReach — drives the belt animation AND Snowball's
// roll) wraps around opposite edges under Magellan Globe, so the arrows/roll continue off one edge
// onto the other (FAQ 4).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { directionReach } from '../src/engine/effects'
import { GRID_W, type GameState } from '../src'
import '../src/cards/scripts/index'

function withGlobe(g: GameState) {
  const cid = `cglobe${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
  const aid = `aglobe${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
}

describe('Magellan Globe — direction lane wraps (belt / Snowball / projectiles)', () => {
  it('the westward lane continues off the west edge onto the east edge, once around', () => {
    const g = newGame(); keepBoth(g)
    for (let x = 0; x < GRID_W; x++) placeSite(g, 0, 'Rustic Village', x, 1)
    withGlobe(g)
    const reach = directionReach(g, 0, 1)
    expect(reach.w).toContainEqual({ x: 0, y: 1 })           // start square
    expect(reach.w).toContainEqual({ x: GRID_W - 1, y: 1 })  // the WRAPPED far-edge square
    expect(reach.w.length, 'the whole row once — no infinite loop').toBe(GRID_W)
  })

  it('without the Globe the westward lane stops at the edge', () => {
    const g = newGame(); keepBoth(g)
    for (let x = 0; x < GRID_W; x++) placeSite(g, 0, 'Rustic Village', x, 1)
    const reach = directionReach(g, 0, 1)
    expect(reach.w).toEqual([{ x: 0, y: 1 }])
  })
})
