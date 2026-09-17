import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { getScript, makeCtx, avatarOf, type GameState } from '../src'

const clearSites = (g: GameState) => { for (const id of Object.keys(g.sites)) delete g.sites[id] }

describe('Corpse Explosion — 2x2 AREA picker tolerant of void cells', () => {
  it('offers an area2x2 selector, including areas that contain void cells (≥1 site)', () => {
    const g = newGame(); keepBoth(g)
    clearSites(g)
    placeSite(g, 0, 'Spire', 1, 1) // one lone site on an otherwise-void board
    getScript('Corpse Explosion')!.onCast!(makeCtx(g, avatarOf(g, 0).id, 0, []))

    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    expect(p!.data.area2x2).toBe(true)
    const anchors = new Set((p!.data.squares as { x: number; y: number }[]).map((s) => `${s.x},${s.y}`))
    // the 2x2 anchored at (1,1) covers the site + THREE void cells — still offered
    expect(anchors.has('1,1')).toBe(true)
    // a 2x2 with no site at all (far from the lone site) is NOT offered
    expect(anchors.has('3,2')).toBe(false)
  })
})
