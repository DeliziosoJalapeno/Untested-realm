// Earthquake's final step burrows all minions AND artifacts on the sites in its 2×2 area — exactly like
// Cave-In, but for the whole area (the user's fix: it now buries artifacts too, via a function that lives
// in the card file, not the old m22 module). A loose artifact goes underground; a Burrowing minion survives
// there while a plain one is buried to death (state-based: it can't exist underground) — same as Cave-In.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, answer, waiveThreshold } from './helpers'
import type { GameState } from '../src'

function quakeBoard() {
  const g = newGame(); keepBoth(g)
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) placeSite(g, 0, 'Rustic Village', x, y) // benign land
  // a loose (ground) artifact on one of the sites
  const acid = `catest${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Onyx Core', owner: 0 }
  const aid = `atest${g.nextId++}`
  ;(g.artifacts as any)[aid] = { id: aid, cardId: acid, name: 'Onyx Core', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false }
  return { g: g as GameState, aid }
}

const quake = (g: GameState) => {
  waiveThreshold(g, 0)
  castMagic(g, 0, 'Earthquake')
  answer(g, { x: 1, y: 1 }) // choose the 2×2 area covering (1,1)(2,1)(1,2)(2,2)
  expect(g.prompts[0]?.kind, 'asks for the rearrangement permutation').toBe('sitePermutation')
  answer(g, { placements: [] }) // decline to rearrange (identity) → the burrow step runs
}

describe('Earthquake buries minions and artifacts across its 2×2', () => {
  it('buries a loose artifact', () => {
    const { g, aid } = quakeBoard()
    quake(g)
    expect((g.artifacts as any)[aid]?.region, 'the loose artifact is buried').toBe('underground')
  })

  it('a Burrowing minion survives buried; a plain one is buried to death (like Cave-In)', () => {
    const { g } = quakeBoard()
    const digger = summonCard(g, 0, 'Bone Jumble', 1, 1); digger.enteredTurn = 0
    digger.modifiers.push({ kind: 'keyword', keyword: 'burrowing', duration: 'permanent', turn: g.turn, sourcePlayer: 0 })
    const plain = summonCard(g, 0, 'Bone Jumble', 2, 1); plain.enteredTurn = 0
    quake(g)
    expect(g.units[digger.id]?.region, 'the Burrowing minion is buried and survives').toBe('underground')
    expect(g.units[plain.id], 'the plain minion cannot survive underground — buried to death').toBeUndefined()
  })
})
