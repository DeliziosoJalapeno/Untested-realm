// Wildfire occupies ONE site — a 1×1 aura. It carries `singleSiteAura`, so casting it picks a single
// square (like a normal targeted card) rather than the 2×2 intersection markers a normal aura uses, and
// the placed aura covers exactly the chosen square (not a 2×2 block).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, waiveThreshold } from './helpers'
import { getScript } from '../src/cards/scripts/registry'
import { siteAt, type GameState } from '../src'

describe('Wildfire is a single-square (1×1) aura', () => {
  it('is flagged singleSiteAura so the client offers square selection', () => {
    expect(getScript('Wildfire')?.singleSiteAura, 'Wildfire must be a single-site aura').toBe(true)
  })

  it('is placed on exactly the chosen square, not a 2×2 block', () => {
    const g = newGame() as GameState
    keepBoth(g)
    const avatar = Object.values(g.units).find((u) => u.isAvatar && u.controller === 0)!
    // a site adjacent to the avatar (Wildfire must start nearby, atop a site)
    const x = avatar.x + 1, y = avatar.y
    placeSite(g, 0, 'Rustic Village', x, y)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Wildfire', { at: { x, y } })

    const aura = Object.values(g.auras).find((a) => a.name === 'Wildfire')!
    expect(aura, 'Wildfire aura exists').toBeTruthy()
    expect(aura.squares.length, 'covers a single square').toBe(1)
    expect(aura.squares[0], 'that square is the chosen one').toEqual({ x, y })
    expect((aura as any).anchor, 'no 2×2 anchor for a single-site aura').toBeUndefined()
    // Wildfire anchors to the SITE (by id), not the coordinate, so it follows a moved site.
    const site = siteAt(g, x, y)!
    expect(aura.onSiteId, 'the aura is anchored to the site it was conjured atop').toBe(site.id)
    expect((aura.counters as any)?.[`s:${site.id}`], 'the starting site is marked visited by id').toBe(1)
  })
})
