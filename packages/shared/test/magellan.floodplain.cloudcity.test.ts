// Magellan Globe joins opposite edges of the realm. Two site powers must honour that
// wrap when they reach into an "adjacent"/"nearby" square: Floodplain (flood an adjacent
// site) and Cloud City (fly to a nearby void). Both previously used the un-wrapped
// neighbourhood, so a cross-border target the GUI happily offered was silently refused.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, answer } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

function globe(g: GameState) {
  const cid = `c${g.nextId++}`; (g.cards as any)[cid] = { id: cid, name: 'Magellan Globe', owner: 0 }
  const aid = `a${g.nextId++}`
  ;(g.artifacts as any)[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 1, region: 'surface', carriedBy: null, tapped: false }
}

describe('Magellan Globe — Floodplain floods a cross-border adjacent site', () => {
  it('floods the wrapped neighbour at the opposite edge', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const fp = placeSite(g, 0, 'Floodplain', 0, 1)      // left edge
    const target = placeSite(g, 0, 'Spire', 4, 1)       // right edge — wraps to be adjacent
    globe(g)
    getScript('Floodplain')!.abilities![0].effect(makeCtx(g, fp.id, 0, [{ site: target.id } as any]))
    expect(g.sites[target.id]?.flooded, 'the cross-border site is flooded').toBe(true)
  })

  it('without the Globe the same cross-edge flood is refused', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const fp = placeSite(g, 0, 'Floodplain', 0, 1)
    const target = placeSite(g, 0, 'Spire', 4, 1)
    getScript('Floodplain')!.abilities![0].effect(makeCtx(g, fp.id, 0, [{ site: target.id } as any]))
    expect(g.sites[target.id]?.flooded, 'no wrap → not adjacent → not flooded').toBeFalsy()
  })
})

describe('Magellan Globe — Cloud City flies across the border', () => {
  it('offers and flies to a wrapped-adjacent void', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const city = placeSite(g, 0, 'Cloud City', 0, 1) // left edge; (4,1) is void and wraps adjacent
    globe(g)
    getScript('Cloud City')!.abilities![0].effect(makeCtx(g, city.id, 0, []))
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    expect(p.data.squares.some((s: any) => s.x === 4 && s.y === 1), 'the cross-border void is offered').toBe(true)
    answer(g, { x: 4, y: 1 })
    expect([g.sites[city.id].x, g.sites[city.id].y], 'Cloud City drifted across the seam').toEqual([4, 1])
  })
})
