// Waveshaper: "Flood a site near your body of water until you do so again." When the wave moves on,
// the old site's flood is re-derived with siteStillFlooded — which knows nothing of PERMANENT floods
// (Atlantean Fate sets `flooded` once). Waving a Fate site and then another one dried the Fate site
// out. A site that was already flooded on its own when the wave hit must stay flooded after it leaves.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { makeCtx, getScript } from '../src'

function wave(g: any, x: number, y: number) {
  getScript('Waveshaper')!.conts!.wave(makeCtx(g, g.players[0].avatarUnitId, 0, []), {}, { x, y })
}

function board() {
  const g: any = newGame(); keepBoth(g)
  placeSite(g, 0, 'Pond', 2, 1) // the body of water…
  const av = g.units[g.players[0].avatarUnitId]; av.x = 2; av.y = 1 // …the avatar stands in
  return g
}

describe('Waveshaper and permanent floods', () => {
  it('leaves a permanently flooded site flooded when the wave moves on', () => {
    const g = board()
    const fated = placeSite(g, 1, 'Hamlet', 2, 2); fated.flooded = true // e.g. Atlantean Fate
    const next = placeSite(g, 0, 'Hamlet', 1, 1)
    wave(g, 2, 2)
    wave(g, 1, 1) // "until you do so again"
    expect(next.flooded).toBe(true)
    expect(fated.flooded, 'the wave dried out a site it did not flood').toBe(true)
  })

  it('still dries a site only the wave flooded', () => {
    const g = board()
    const a = placeSite(g, 0, 'Hamlet', 2, 2)
    placeSite(g, 0, 'Hamlet', 1, 1)
    wave(g, 2, 2)
    wave(g, 1, 1)
    expect(a.flooded).toBe(false)
  })
})
