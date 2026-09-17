// The Earthquake panel must show the 2x2 in BOARD orientation for the viewer: columns left→right and
// higher-y rows on top (both reversed for the flipped second seat), so a site sits where it does on
// the board regardless of which seat you are.
import { describe, it, expect } from 'vitest'
import { orderForDisplay } from '../src/components/QuakeArrange'

type Cell = { x: number; y: number; name: string | null; movable: boolean }
const mk = (x: number, y: number): Cell => ({ x, y, name: `s${x}${y}`, movable: true })
const coords = (cs: Cell[]) => cs.map((c) => `${c.x},${c.y}`)

// area anchored at (2,2): squares (2,2) (3,2) (2,3) (3,3), given in a scrambled order
const AREA = [mk(3, 3), mk(2, 2), mk(3, 2), mk(2, 3)]

describe('QuakeArrange orientation', () => {
  it('unflipped (seat 0): TL=(2,3) TR=(3,3) BL=(2,2) BR=(3,2)', () => {
    // top row = higher y (3), bottom row = lower y (2); left col = lower x (2), right = higher x (3)
    expect(coords(orderForDisplay(AREA, false))).toEqual(['2,3', '3,3', '2,2', '3,2'])
  })

  it('flipped (seat 1): the whole 2x2 is rotated 180° so it matches that seat\'s board', () => {
    expect(coords(orderForDisplay(AREA, true))).toEqual(['3,2', '2,2', '3,3', '2,3'])
  })

  it('a Magellan-wrapped area (non-adjacent coords) is left in its given order', () => {
    const wrapped = [mk(0, 0), mk(4, 0), mk(0, 4), mk(4, 4)] // spans the board → not a tidy 2x2
    expect(coords(orderForDisplay(wrapped, false))).toEqual(['0,0', '4,0', '0,4', '4,4'])
  })
})
