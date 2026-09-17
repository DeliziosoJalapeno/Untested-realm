import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, waiveThreshold, castMagic } from './helpers'

// Corpse Explosion targets a 2x2 area; VOID cells inside are fine (they just receive no
// corpse). The picker must OFFER every 2x2 anchor that covers at least one site, even if
// 1-3 of its cells are void.

describe('Corpse Explosion — 2x2 areas containing voids are offered', () => {
  it('offers every 2x2 anchor that covers a site, including mostly-void ones', () => {
    const g = newGame(); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Spire', 2, 2) // the ONLY site — every offered 2x2 has ≥3 void cells
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Corpse Explosion')

    const pr = g.prompts[0]
    expect(pr?.kind).toBe('chooseSquare')
    expect(pr?.data?.area2x2, 'rendered as a 2x2 area picker').toBe(true)
    const anchors = (pr!.data!.squares as { x: number; y: number }[]).map((s) => `${s.x},${s.y}`)
    // all four 2x2 anchors that include (2,2) — each has 3 void cells — must be offered
    for (const a of ['1,1', '2,1', '1,2', '2,2']) {
      expect(anchors, `2x2 anchor ${a} (covers the site + voids) is offered`).toContain(a)
    }
  })
})
