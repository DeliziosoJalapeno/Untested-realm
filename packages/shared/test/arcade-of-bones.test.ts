import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { reachableLocations } from '../src/engine/movement'
import { isMagicProtected } from '../src'
import type { GameState } from '../src'

// Arcade of Bones (Artifact): "While in this row, Undead move freely and can't be targeted or
// damaged by magic." The row acts like a chain of bridges for Undead — they slide ALONG the row
// (both endpoints in the row) at no step cost, and every Undead in the row is magic-protected.
function board(): { g: GameState; artId: string } {
  const g: GameState = newGame(); keepBoth(g)
  for (const y of [0, 1, 2, 3]) for (const x of [0, 1, 2, 3, 4]) placeSite(g, 0, 'Rustic Village', x, y)
  const cid = 'arcC', artId = 'arcA'
  g.cards[cid] = { id: cid, name: 'Arcade of Bones', owner: 0 } as any
  g.artifacts[artId] = { id: artId, cardId: cid, name: 'Arcade of Bones', conjuredBy: 0, x: 4, y: 1, region: 'surface', carriedBy: null, tapped: false } as any
  return { g, artId }
}

describe('Arcade of Bones', () => {
  it('lets an Undead slide freely along its row, but NOT freely off-row', () => {
    const { g } = board()
    const u = summonCard(g, 0, 'Skeleton', 2, 1); u.enteredTurn = -1 // Undead on the Arcade row (y=1)
    const reach = new Set(reachableLocations(g, u).map((s) => `${s.x},${s.y}`))

    // with just 1 step it reaches the WHOLE row (free glide) plus ONE step off it (y=0 / y=2)…
    for (const x of [0, 1, 3, 4]) expect(reach.has(`${x},1`), `row square ${x},1 is free`).toBe(true)
    expect(reach.has('0,2')).toBe(true) // slide to (0,1) free, then one paid step down
    // …but never TWO rows away (that would be a free off-row glide — the old bug)
    for (const x of [0, 1, 2, 3, 4]) expect(reach.has(`${x},3`), `${x},3 must be unreachable`).toBe(false)
  })

  it('does not grant free movement to a non-Undead on the row', () => {
    const { g } = board()
    const u = summonCard(g, 0, 'Escyllion Cyclops', 2, 1); u.enteredTurn = -1 // not Undead
    const reach = new Set(reachableLocations(g, u).map((s) => `${s.x},${s.y}`))
    // a plain 1-step minion reaches only its 4 orthogonal neighbours — no free row slide to (0,1)/(4,1)
    expect(reach.has('0,1')).toBe(false)
    expect(reach.has('4,1')).toBe(false)
    expect(reach.has('1,1')).toBe(true)
  })

  it('magic-protects every Undead in its row, but not other rows/columns', () => {
    const { g } = board()
    const inRow = summonCard(g, 0, 'Skeleton', 0, 1); inRow.enteredTurn = -1
    const offRow = summonCard(g, 0, 'Skeleton', 4, 0); offRow.enteredTurn = -1 // same column, different row
    expect(isMagicProtected(g, inRow), 'Undead in the row is protected').toBe(true)
    expect(isMagicProtected(g, offRow), 'Undead off the row is not').toBe(false)
  })

  it('does not protect a non-Undead in the row', () => {
    const { g } = board()
    const cyclops = summonCard(g, 0, 'Escyllion Cyclops', 0, 1); cyclops.enteredTurn = -1
    expect(isMagicProtected(g, cyclops)).toBe(false)
  })
})
