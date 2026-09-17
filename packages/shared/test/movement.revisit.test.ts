// Rulebook (Moving your Units): "When you declare movement, the only restriction is that you may not
// repeat specific steps." A STEP is an EDGE (from→to), NOT a square — so a multi-step move MAY revisit
// a square as long as it does so via a DIFFERENT edge. The engine must carry such a move through to its
// declared end and only drop an actually-repeated edge.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { resolveMovement, type GameState, type Step } from '../src'

function mover(): { g: GameState; u: any } {
  const g = newGame() as GameState; keepBoth(g)
  for (let x = 0; x < 5; x++) placeSite(g, 0, 'Rustic Village', x, 2) // a row of sites at y=2
  const u = summonCard(g, 0, 'Stygian Archers', 2, 2); u.enteredTurn = -5
  u.modifiers.push({ kind: 'keyword', keyword: 'movement', amount: 4, duration: 'permanent', turn: g.turn, sourcePlayer: 0 } as any)
  return { g, u }
}
const S = (x: number): Step => ({ x, y: 2, region: 'surface' })

describe('multi-step movement may revisit a square (different edges), but not repeat a step', () => {
  it('carries the whole path through even when it passes over a square twice via different edges', () => {
    const { g, u } = mover()
    // 2→3→4→3 : revisits square 3, but the two entries use different edges (2→3 and 4→3) — all legal
    const taken = resolveMovement(g, u, [S(3), S(4), S(3)])
    expect(taken).toBe(3)
    expect([u.x, u.y]).toEqual([3, 2]) // ends where declared, NOT stranded at the first revisit
  })

  it('drops only a genuinely repeated STEP (same edge), per the rulebook', () => {
    const { g, u } = mover()
    // 2→3→2→3 declares the step 2→3 twice — the repeat is illegal, so it is dropped
    const taken = resolveMovement(g, u, [S(3), S(2), S(3)])
    expect(taken).toBe(2)          // only the two legal, distinct steps were taken
    expect([u.x, u.y]).toEqual([2, 2])
  })
})
