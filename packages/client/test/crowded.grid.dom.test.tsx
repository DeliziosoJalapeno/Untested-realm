// A location with more than 6 minions must lay them out in a progressively smaller,
// NON-overlapping grid that fills the square (2×4 → 3×4 → 3×5 → 3×6 → 4×7), instead
// of spilling card chips over neighbouring squares. Driven by unitsGridCols(n):
// the .units container gains a `grid` class + a `--cols` custom property.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase, usummon } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function boardWithN(n: number) {
  const g = sweepBoardBase() as any
  for (let i = 0; i < n; i++) usummon(g, 0, 'Foot Soldier', 3, 3) // stack n minions at (3,3)
  return g
}
function unitsAt33(h: GameHarness): HTMLElement {
  return h.container.querySelector('[data-sq="3,3"] .units') as HTMLElement
}

describe('a crowded location tiles its minions into a shrinking grid', () => {
  it('6 or fewer minions use the normal free-flow layout (no grid)', () => {
    const h = new GameHarness(boardWithN(6)).mount(); active = h
    const units = unitsAt33(h)
    expect(units).toBeTruthy()
    expect(units.classList.contains('grid'), '≤6 is not gridded').toBe(false)
    expect(units.getAttribute('data-count')).toBe('6')
  })

  const cases: { n: number; cols: string }[] = [
    { n: 8, cols: '4' },  // 2×4
    { n: 12, cols: '4' }, // 3×4
    { n: 15, cols: '5' }, // 3×5
    { n: 18, cols: '6' }, // 3×6
    { n: 28, cols: '7' }, // 4×7
    { n: 40, cols: '7' }, // beyond 28 stays at 7 columns (no point going smaller)
  ]
  for (const { n, cols } of cases) {
    it(`${n} minions → grid with ${cols} columns`, () => {
      const h = new GameHarness(boardWithN(n)).mount(); active = h
      const units = unitsAt33(h)
      expect(units.classList.contains('grid'), `${n} minions is gridded`).toBe(true)
      expect(units.style.getPropertyValue('--cols').trim()).toBe(cols)
      expect(units.getAttribute('data-count')).toBe(String(n))
      // every minion chip is rendered (none dropped) and lives inside the grid
      expect(units.querySelectorAll('.unit').length).toBe(n)
    })
  }
})

// ≤6 minions: a CENTRED tile grid where fewer minions render BIGGER (driven by
// unitsTileCols): 1/2 across, 3 across, 4 as 2×2, 5–6 across 3. Distinct from the
// crowded `grid` (which fills each cell); `tiled` sizes chips per count.
describe('an uncrowded location tiles ≤6 minions so fewer render bigger', () => {
  const tiles: { n: number; cols: string }[] = [
    { n: 1, cols: '1' }, { n: 2, cols: '2' }, { n: 3, cols: '3' },
    { n: 4, cols: '2' }, { n: 5, cols: '3' }, { n: 6, cols: '3' },
  ]
  for (const { n, cols } of tiles) {
    it(`${n} minions → tiled with ${cols} columns (not the crowded grid)`, () => {
      const h = new GameHarness(boardWithN(n)).mount(); active = h
      const units = unitsAt33(h)
      expect(units.classList.contains('tiled'), `${n} minions is tiled`).toBe(true)
      expect(units.classList.contains('grid'), `${n} is not the crowded grid`).toBe(false)
      expect(units.style.getPropertyValue('--cols').trim()).toBe(cols)
      expect(units.querySelectorAll('.unit').length).toBe(n)
    })
  }
})
