import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { applyAction } from '../src'

// Courtesy action: gift time to your OPPONENT's chess clock. Allowed any time, but only to
// the other seat, and only when the game actually has a clock.
describe('addTime — gifting clock time to the opponent', () => {
  it('adds to the opponent, refuses self, requires a clock, and caps a single gift', () => {
    const g = newGame(); keepBoth(g)

    // no clock in this game → refused
    expect(applyAction(g, 0, { t: 'addTime', player: 1, ms: 60_000 }).ok, 'no clock').toBe(false)

    g.clock = { base: 900_000, inc: 30_000, remaining: [900_000, 800_000] }

    // seat 0 gifts seat 1 +60s
    expect(applyAction(g, 0, { t: 'addTime', player: 1, ms: 60_000 }).ok).toBe(true)
    expect(g.clock.remaining[1]).toBe(860_000)

    // can't gift yourself
    expect(applyAction(g, 0, { t: 'addTime', player: 0, ms: 60_000 }).ok, 'no self-gift').toBe(false)
    expect(g.clock.remaining[0]).toBe(900_000)

    // works regardless of whose turn it is, and a single gift is capped at 1h
    expect(applyAction(g, 1, { t: 'addTime', player: 0, ms: 999_999_999 }).ok).toBe(true)
    expect(g.clock.remaining[0]).toBe(900_000 + 3_600_000)
  })
})
