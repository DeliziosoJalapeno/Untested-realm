import { describe, it, expect } from 'vitest'
import { auraStackLayout } from '../src/auraStack'

const W = 52
const H = 74

/** the drawn box of each slot (centred layout: about the lone card's centre at 0,0) */
function boxes(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const s = auraStackLayout(i, count, W, H)
    return { s, x0: s.dx - (W * s.scale) / 2, x1: s.dx + (W * s.scale) / 2, y0: s.dy - (H * s.scale) / 2, y1: s.dy + (H * s.scale) / 2 }
  })
}

describe('auraStackLayout: auras sharing one spot shrink and sit side by side', () => {
  it('a lone aura renders exactly as before (no scale, no shift)', () => {
    expect(auraStackLayout(0, 1, W, H)).toEqual({ scale: 1, dx: 0, dy: 0 })
    expect(auraStackLayout(0, 1, W, H, 'start')).toEqual({ scale: 1, dx: 0, dy: 0 })
  })

  for (const n of [2, 3, 4, 5, 7, 8]) {
    it(`${n} auras: every card is smaller and none overlaps another`, () => {
      const b = boxes(n)
      for (const { s } of b) expect(s.scale).toBeLessThan(1)
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const overlap = b[i].x0 < b[j].x1 - 1e-9 && b[j].x0 < b[i].x1 - 1e-9 && b[i].y0 < b[j].y1 - 1e-9 && b[j].y0 < b[i].y1 - 1e-9
          expect(overlap, `cards ${i} and ${j} overlap`).toBe(false)
        }
    })
  }

  it('the group is centred on the lone card spot', () => {
    const two = [0, 1].map((i) => auraStackLayout(i, 2, W, H))
    expect(two[0].dx + two[1].dx).toBeCloseTo(0)
    expect(two[0].dy).toBe(0)
    expect(two[1].dx).toBeGreaterThan(0)
  })

  it('wraps into a second row past 4', () => {
    expect(auraStackLayout(3, 5, W, H).dy).toBeLessThan(0)
    expect(auraStackLayout(4, 5, W, H).dy).toBeGreaterThan(0)
    expect(auraStackLayout(4, 5, W, H).dx).toBeCloseTo(0) // the short last row is centred
  })

  it("'start' grows right/down from the top-left corner", () => {
    expect(auraStackLayout(0, 3, W, H, 'start')).toMatchObject({ dx: 0, dy: 0 })
    const s1 = auraStackLayout(1, 3, W, H, 'start')
    expect(s1.dx).toBeCloseTo(W * s1.scale)
    expect(s1.dy).toBe(0)
  })
})
