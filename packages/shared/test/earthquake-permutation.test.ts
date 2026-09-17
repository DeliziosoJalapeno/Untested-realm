// Earthquake now takes a single site PERMUTATION (the client authors it; the engine just validates
// and applies it), rather than driving a chain of pairwise swaps. Contents ride along; an identity
// permutation rearranges nothing; an illegal one (moving an immovable site) is rejected wholesale.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, answer, waiveThreshold } from './helpers'
import { siteAt, type GameState } from '../src'
import '../src/cards/scripts/index'

function board() {
  const g = newGame() as GameState; keepBoth(g)
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) placeSite(g, 0, 'Rustic Village', x, y)
  return g
}
function castArea(g: GameState) {
  waiveThreshold(g, 0)
  castMagic(g, 0, 'Earthquake')
  answer(g, { x: 1, y: 1 }) // 2×2 area covering (1,1)(2,1)(1,2)(2,2)
  expect(g.prompts[0]?.kind).toBe('sitePermutation')
}

describe('Earthquake site permutation', () => {
  it('applies a permutation, carrying each site\'s contents along', () => {
    const g = board()
    const idA = siteAt(g, 1, 1)!.id // site A at (1,1)
    const idB = siteAt(g, 2, 1)!.id // site B at (2,1)
    const rider = summonCard(g, 0, 'Bone Jumble', 1, 1); rider.enteredTurn = -1 // stands on site A
    // give it Burrowing so it survives the quake's final burrow step and we can read its new square
    rider.modifiers.push({ kind: 'keyword', keyword: 'burrowing', duration: 'permanent', turn: g.turn, sourcePlayer: 0 })
    castArea(g)
    // swap (1,1)A ↔ (2,1)B; the other two map to themselves
    answer(g, { placements: [
      { x: 1, y: 1, sx: 2, sy: 1 }, // (1,1) receives B
      { x: 2, y: 1, sx: 1, sy: 1 }, // (2,1) receives A (and its rider)
      { x: 1, y: 2, sx: 1, sy: 2 },
      { x: 2, y: 2, sx: 2, sy: 2 },
    ] })
    expect(siteAt(g, 1, 1)?.id, 'B moved to (1,1)').toBe(idB)
    expect(siteAt(g, 2, 1)?.id, 'A moved to (2,1)').toBe(idA)
    expect(g.units[rider.id]?.x, 'the minion rode along with its site').toBe(2)
    expect(g.units[rider.id]?.y).toBe(1)
    expect(g.prompts.length).toBe(0)
  })

  it('identity permutation rearranges nothing (still burrows)', () => {
    const g = board()
    const before = ['1,1', '2,1', '1,2', '2,2'].map((k) => { const [x, y] = k.split(',').map(Number); return siteAt(g, x, y)!.id })
    castArea(g)
    answer(g, { placements: [
      { x: 1, y: 1, sx: 1, sy: 1 }, { x: 2, y: 1, sx: 2, sy: 1 },
      { x: 1, y: 2, sx: 1, sy: 2 }, { x: 2, y: 2, sx: 2, sy: 2 },
    ] })
    const after = ['1,1', '2,1', '1,2', '2,2'].map((k) => { const [x, y] = k.split(',').map(Number); return siteAt(g, x, y)!.id })
    expect(after, 'every site kept its square').toEqual(before)
    expect(g.prompts.length).toBe(0)
  })
})
