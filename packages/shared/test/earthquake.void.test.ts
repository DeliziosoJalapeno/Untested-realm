// Earthquake rearranges SITES, not empty space. A void (siteless) square in the chosen 2×2 is a fixed
// point: it can't be moved, and a site can't slide onto it (that would relocate the void). Sites may
// only permute among the site-occupied squares.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, answer, waiveThreshold } from './helpers'
import { siteAt, type GameState } from '../src'
import '../src/cards/scripts/index'

// three sites + one void at (2,2), inside the 2×2 anchored at (1,1)
function board(): GameState {
  const g = newGame() as GameState; keepBoth(g)
  placeSite(g, 0, 'Rustic Village', 1, 1)
  placeSite(g, 0, 'Rustic Village', 2, 1)
  placeSite(g, 0, 'Rustic Village', 1, 2)
  return g // (2,2) left void
}
function castArea(g: GameState) {
  waiveThreshold(g, 0)
  castMagic(g, 0, 'Earthquake')
  answer(g, { x: 1, y: 1 })
  expect(g.prompts[0]?.kind).toBe('sitePermutation')
}

describe('Earthquake does not move voids', () => {
  it('the void square is not offered as movable', () => {
    const g = board()
    castArea(g)
    const data: any = g.prompts[0]!.data
    expect(data.movable.map((s: any) => `${s.x},${s.y}`).sort()).toEqual(['1,1', '1,2', '2,1'])
    expect(data.movable.some((s: any) => s.x === 2 && s.y === 2), 'the void is not movable').toBe(false)
    const voidCell = data.cells.find((c: any) => c.x === 2 && c.y === 2)
    expect(voidCell.name, 'the void cell has no site').toBeNull()
    expect(voidCell.movable, 'and is a fixed point').toBe(false)
  })

  it('rejects an arrangement that slides a site onto the void (nothing moves)', () => {
    const g = board()
    const idA = siteAt(g, 1, 1)!.id
    castArea(g)
    // illegal: move the site at (1,1) onto the void (2,2), and the void into (1,1)
    answer(g, { placements: [
      { x: 1, y: 1, sx: 2, sy: 2 }, // (1,1) would receive the VOID → illegal
      { x: 2, y: 2, sx: 1, sy: 1 }, // (2,2) would receive site A
      { x: 2, y: 1, sx: 2, sy: 1 },
      { x: 1, y: 2, sx: 1, sy: 2 },
    ] })
    expect(siteAt(g, 1, 1)?.id, 'site A stayed put').toBe(idA)
    expect(siteAt(g, 2, 2), 'the void stayed void — no site slid onto it').toBeFalsy()
    expect(g.prompts.length).toBe(0)
  })

  it('still allows a legal swap among the site squares, leaving the void alone', () => {
    const g = board()
    const idA = siteAt(g, 1, 1)!.id
    const idB = siteAt(g, 2, 1)!.id
    castArea(g)
    answer(g, { placements: [
      { x: 1, y: 1, sx: 2, sy: 1 }, // swap A ↔ B
      { x: 2, y: 1, sx: 1, sy: 1 },
      { x: 1, y: 2, sx: 1, sy: 2 },
      { x: 2, y: 2, sx: 2, sy: 2 }, // void stays itself
    ] })
    expect(siteAt(g, 1, 1)?.id, 'B moved to (1,1)').toBe(idB)
    expect(siteAt(g, 2, 1)?.id, 'A moved to (2,1)').toBe(idA)
    expect(siteAt(g, 2, 2), 'the void is untouched').toBeFalsy()
    expect(g.prompts.length).toBe(0)
  })
})
