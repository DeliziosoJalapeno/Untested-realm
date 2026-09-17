import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, giveMana, waiveThreshold } from './helpers'
import { avatarOf, areaDamagePreview } from '../src'

// The preview must return the exact ABSOLUTE squares (and printed damage) that the
// cast would hit for the chosen parameters — the same pattern applyGrid uses, just
// computed without applying anything. These assertions pin the printed patterns.

/** sort cells into a stable order for comparison */
function sortCells(cells: { x: number; y: number; dmg: number }[]) {
  return [...cells].sort((a, b) => a.y - b.y || a.x - b.x || a.dmg - b.dmg)
}

describe('areaDamagePreview', () => {
  it('Lava Flow: the caster-site column (5/4/2) in the chosen direction, sites only', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    for (const x of [0, 1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 0)
    const prev = areaDamagePreview(g, 'Lava Flow', av.id, { direction: 'e' })
    expect(prev).not.toBeNull()
    expect(prev!.element).toBe('fire')
    // caster's own site (0,0)=5, one ahead (1,0)=4, two ahead (2,0)=2; (3,0) is out of range
    expect(sortCells(prev!.cells)).toEqual(sortCells([
      { x: 0, y: 0, dmg: 5 }, { x: 1, y: 0, dmg: 4 }, { x: 2, y: 0, dmg: 2 },
    ]))
  })

  it('Lava Flow: only cells that actually have a site are lit (atopSitesOnly)', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    // place sites only at (0,0) and (2,0): the (1,0) gap must be dropped from the preview
    placeSite(g, 0, 'Rustic Village', 0, 0)
    placeSite(g, 0, 'Rustic Village', 2, 0)
    const prev = areaDamagePreview(g, 'Lava Flow', av.id, { direction: 'e' })
    expect(sortCells(prev!.cells)).toEqual(sortCells([
      { x: 0, y: 0, dmg: 5 }, { x: 2, y: 0, dmg: 2 },
    ]))
  })

  it('Lava Flow: returns null before a direction is chosen', () => {
    const g: any = newGame(); keepBoth(g)
    const av = avatarOf(g, 0)
    expect(areaDamagePreview(g, 'Lava Flow', av.id, {})).toBeNull()
  })

  it('Major Explosion: a 3x3 cross (3/5/7) centred on the target square', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    const prev = areaDamagePreview(g, 'Major Explosion', av.id, { at: { x: 2, y: 2 } })
    expect(prev).not.toBeNull()
    expect(sortCells(prev!.cells)).toEqual(sortCells([
      { x: 2, y: 2, dmg: 7 },
      { x: 3, y: 2, dmg: 5 }, { x: 1, y: 2, dmg: 5 }, { x: 2, y: 3, dmg: 5 }, { x: 2, y: 1, dmg: 5 },
      { x: 3, y: 3, dmg: 3 }, { x: 1, y: 3, dmg: 3 }, { x: 3, y: 1, dmg: 3 }, { x: 1, y: 1, dmg: 3 },
    ]))
  })

  it('Major Explosion: null when the target is more than two steps from the caster', () => {
    const g: any = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    expect(areaDamagePreview(g, 'Major Explosion', av.id, { at: { x: 4, y: 0 } })).toBeNull()
  })

  it('Craterize: a 5x5 diamond (10/7/4/2/1) on sited squares around ground zero', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    // sites on every in-bounds square (the 5x4 realm) so the whole in-bounds diamond lights up
    for (let x = 0; x <= 4; x++) for (let y = 0; y <= 3; y++) placeSite(g, 0, 'Rustic Village', x, y)
    const gz = Object.values(g.sites).find((s: any) => s.x === 2 && s.y === 2) as any
    const prev = areaDamagePreview(g, 'Craterize', av.id, { sites: [gz.id] })
    expect(prev).not.toBeNull()
    expect(prev!.element).toBe('earth')
    // spot-check the ring values around ground zero — damage indexed by Manhattan
    // distance: [10,7,4,2,1] for dist 0..4. Out-of-bounds cells (y=4) are dropped.
    const at = (x: number, y: number) => prev!.cells.find((c) => c.x === x && c.y === y)?.dmg
    expect(at(2, 2)).toBe(10)          // centre (dist 0)
    expect(at(3, 2)).toBe(7)           // dist 1
    expect(at(2, 0)).toBe(4)           // dist 2 (two straight up)
    expect(at(3, 3)).toBe(4)           // dist 2 (diagonal)
    expect(at(4, 3)).toBe(2)           // dist 3
    expect(at(0, 0)).toBe(1)           // dist 4 (corner)
    expect(prev!.cells.length).toBe(20) // every in-bounds square of the 5x4 realm
  })
})
