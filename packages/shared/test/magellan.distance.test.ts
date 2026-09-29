// Tier-1 Magellan primitives: wrapped distance (stepDistanceW / chebyshevW), wrapped forced steps,
// and the shared body-of-water flood-fill. Under a Magellan Globe opposite edges are joined, so
// distance/adjacency/contiguity take the short way round the seam; without the Globe they're raw.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { stepDistanceW, forcedStepsToward } from '../src/engine/movement'
import { shootProjectile } from '../src/engine/combat'
import { chebyshevW, GRID_W } from '../src/engine/grid'
import { bodyOfWater } from '../src/cards/scripts/multi-card-utils/body-of-water'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

function withGlobe(g: GameState) {
  const cid = `cglobe${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
  const aid = `aglobe${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
}

describe('Tier 1 — wrapped distance primitives', () => {
  it('stepDistanceW / chebyshevW take the short way round only with the Globe', () => {
    const g = newGame() as GameState; keepBoth(g)
    const a = { x: 0, y: 1 }, b = { x: GRID_W - 1, y: 1 } // opposite x-edges, same row
    expect(stepDistanceW(g, a, b), 'raw Manhattan without Globe').toBe(GRID_W - 1)
    expect(chebyshevW(g, a, b), 'raw Chebyshev without Globe').toBe(GRID_W - 1)
    withGlobe(g)
    expect(stepDistanceW(g, a, b), 'one step via the seam').toBe(1)
    expect(chebyshevW(g, a, b), 'one step via the seam').toBe(1)
  })

  it('forcedStepsToward offers the cross-seam push only with the Globe', () => {
    const g = newGame() as GameState; keepBoth(g)
    for (let x = 0; x < GRID_W; x++) placeSite(g, 0, 'Rustic Village', x, 1)
    const mover = summonCard(g, 1, 'Bone Jumble', 0, 1); mover.enteredTurn = -1
    const ref = { x: GRID_W - 1, y: 1 }
    expect(forcedStepsToward(g, mover, ref, 'closer').some((s) => s.x === GRID_W - 1), 'no Globe → no wrap push').toBe(false)
    withGlobe(g)
    expect(forcedStepsToward(g, mover, ref, 'closer').some((s) => s.x === GRID_W - 1), 'Globe → pushed across the seam').toBe(true)
  })
})

describe('Tier 1 — body of water wraps the seam', () => {
  it('two water sites adjacent only through the joined edge are ONE body under the Globe', () => {
    const g = newGame() as GameState; keepBoth(g)
    const a = placeSite(g, 0, 'Rustic Village', 0, 1); a.flooded = true       // water via flood
    const b = placeSite(g, 0, 'Rustic Village', GRID_W - 1, 1); b.flooded = true
    // no water between them, so they touch ONLY across the x-seam
    expect(bodyOfWater(g, 0, 1).has(`${GRID_W - 1},1`), 'no Globe → separate bodies').toBe(false)
    withGlobe(g)
    const body = bodyOfWater(g, 0, 1)
    expect(body.has(`${GRID_W - 1},1`), 'Globe → same body across the seam').toBe(true)
    expect(body.size).toBe(2)
  })
})

describe('Tier 1 — Ranged shot flies around the seam', () => {
  it('a Ranged unit at the west edge hits an enemy at the east edge only with the Globe', () => {
    for (const globe of [false, true]) {
      const g = newGame() as GameState; keepBoth(g)
      for (let x = 0; x < GRID_W; x++) placeSite(g, 0, 'Rustic Village', x, 1)
      if (globe) withGlobe(g)
      const shooter = summonCard(g, 0, 'Stygian Archers', 0, 1); shooter.enteredTurn = -1 // Ranged
      const foe = summonCard(g, 1, 'Bone Jumble', GRID_W - 1, 1); foe.enteredTurn = -1
      shootProjectile(g, 0, shooter.id, 'w') // west from x=0 wraps to x=GRID_W-1
      expect(!!g.units[foe.id], `globe=${globe}`).toBe(!globe) // killed (gone) only when the shot wrapped
    }
  })
})
