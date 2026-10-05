import { describe, it, expect } from 'vitest'
import { fmtCoord, relabelCoords } from '../src/coords'

describe('board coordinate systems', () => {
  it('chess: column letter + row number (a1–e4)', () => {
    expect(fmtCoord(0, 0, 'chess')).toBe('a1')
    expect(fmtCoord(2, 1, 'chess')).toBe('c2')
    expect(fmtCoord(4, 3, 'chess')).toBe('e4')
  })

  it('standard: 1–20, row-major (1 2 3 4 5 / 6 … / … 20)', () => {
    expect(fmtCoord(0, 0, 'standard')).toBe('1')
    expect(fmtCoord(4, 0, 'standard')).toBe('5')
    expect(fmtCoord(0, 1, 'standard')).toBe('6')
    expect(fmtCoord(2, 1, 'standard')).toBe('8')
    expect(fmtCoord(4, 3, 'standard')).toBe('20')
  })

  it('cartesian: 1-indexed (column,row) from the top-left', () => {
    expect(fmtCoord(0, 0, 'cartesian')).toBe('(1,1)')
    expect(fmtCoord(2, 1, 'cartesian')).toBe('(3,2)')
    expect(fmtCoord(4, 3, 'cartesian')).toBe('(5,4)')
  })

  it('relabelCoords rewrites engine chess tokens for display (same cell, every system)', () => {
    expect(relabelCoords('lands at c2', 'standard')).toBe('lands at 8')
    expect(relabelCoords('Corpse for a1? (skip to stop)', 'cartesian')).toBe('Corpse for (1,1)? (skip to stop)')
    expect(relabelCoords('links a1 and e4 this turn', 'standard')).toBe('links 1 and 20 this turn')
    // chess is the native format → no-op
    expect(relabelCoords('lands at c2', 'chess')).toBe('lands at c2')
  })

  it('relabelCoords leaves non-coordinate text alone', () => {
    // "1/1" has no column letter; capitalised words aren't lowercase a–e tokens
    expect(relabelCoords('A 1/1 Beast arrives at e4', 'standard')).toBe('A 1/1 Beast arrives at 20')
    expect(relabelCoords('Archangel Gabriel smites', 'standard')).toBe('Archangel Gabriel smites')
  })
})
