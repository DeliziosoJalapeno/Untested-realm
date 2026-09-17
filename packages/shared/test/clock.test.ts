import { describe, it, expect } from 'vitest'
import { newGame } from './helpers'
import { runningSeat, settleClock, flagFall, endTurn } from '../src'

function timed(base = 10000, inc = 5000): any {
  const g: any = newGame()
  g.clock = { base, inc, remaining: [base, base] }
  return g
}

describe('chess clock', () => {
  it('endTurn banks the per-turn increment for the ending player only', () => {
    const g = timed(10000, 5000)
    g.phase = 'main'
    g.activePlayer = 0
    endTurn(g)
    expect(g.clock.remaining[0]).toBe(15000) // 10000 + 5000
    expect(g.clock.remaining[1]).toBe(10000) // untouched
  })

  it('flagFall ends the game and awards the win to the opponent', () => {
    const g = timed()
    g.phase = 'main'
    flagFall(g, 0)
    expect(g.phase).toBe('over')
    expect(g.winner).toBe(1)
  })

  it('settleClock deducts elapsed time from the running seat only', () => {
    const g = timed(10000, 0)
    g.phase = 'main'
    g.activePlayer = 0
    g.prompts = []
    settleClock(g, 1000, 4000) // 3000 ms elapsed, seat 0 on the clock
    expect(g.clock.remaining[0]).toBe(7000)
    expect(g.clock.remaining[1]).toBe(10000)
  })

  it('runningSeat follows the decision point (active player, prompt target, or none)', () => {
    const g = timed()
    g.phase = 'mulligan'
    expect(runningSeat(g)).toBeNull() // no clock during setup
    g.phase = 'main'
    g.activePlayer = 1
    g.prompts = []
    expect(runningSeat(g)).toBe(1) // active player's turn
    // a prompt addressed to seat 0 (e.g. defending seat 1's attack) burns seat 0's clock
    g.prompts = [{ id: 'p1', player: 0 } as any]
    expect(runningSeat(g)).toBe(0)
    g.phase = 'over'
    expect(runningSeat(g)).toBeNull() // stopped once the game ends
  })

  it('an untimed game never has a running seat', () => {
    const g: any = newGame()
    g.phase = 'main'
    expect(g.clock).toBeUndefined()
    expect(runningSeat(g)).toBeNull()
    settleClock(g, 0, 9999) // no-op, no throw
  })
})
