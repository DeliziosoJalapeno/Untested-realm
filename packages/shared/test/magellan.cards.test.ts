// Card-level Magellan regressions: the two dominant fixed patterns — a distance-gate target filter
// (Sleep, "up to two steps away") and an adjacency static (The Colour Out of Space, "adjacent to the
// void") — both now honour the joined edges under a Magellan Globe via the shared wrapped helpers.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { getScript, GRID_W, GRID_H, type GameState } from '../src'
import '../src/cards/scripts/index'

function withGlobe(g: GameState) {
  const cid = `cglobe${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
  const aid = `aglobe${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
}

describe('Sleep range wraps under the Globe', () => {
  it('a minion 3 apart (2 via the seam) is only in range with the Globe', () => {
    const g = newGame() as GameState; keepBoth(g)
    const caster = summonCard(g, 0, 'Bone Jumble', 0, 1)
    const foe = summonCard(g, 1, 'Bone Jumble', 3, 1) // Manhattan 3, but 2 the short way round (GRID_W=5)
    const filter = getScript('Sleep')!.targets![0].filter!
    expect(filter(g, foe, caster), 'out of range without a Globe').toBe(false)
    withGlobe(g)
    expect(filter(g, foe, caster), 'in range via the seam').toBe(true)
  })
})

describe('The Colour Out of Space sees void across the seam', () => {
  it('an edge site whose only void neighbour is across the seam provides only under the Globe', () => {
    const g = newGame() as GameState; keepBoth(g)
    // fill the whole board EXCEPT (GRID_W-1, 1), which stays void (siteless)
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) {
      if (x === GRID_W - 1 && y === 1) continue
      placeSite(g, 0, 'Rustic Village', x, y)
    }
    const site = placeSite(g, 0, 'The Colour Out of Space', 0, 1) // its in-bounds neighbours all have sites
    const provides = getScript('The Colour Out of Space')!.siteProvides!
    expect(provides(g, site), 'not adjacent to void without a Globe').toBe(false)
    withGlobe(g)
    expect(provides(g, site), 'the wrapped neighbour (GRID_W-1,1) is void → adjacent to void').toBe(true)
  })
})
