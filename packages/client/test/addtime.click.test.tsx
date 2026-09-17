// Clicking the OPPONENT's chess clock opens a chooser to gift them extra time.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('gift time by clicking the opponent clock', () => {
  it('opens the chooser and adds the picked amount to the opponent clock only', () => {
    const g = sweepBoardBase() as any
    g.clock = { base: 900_000, inc: 30_000, remaining: [900_000, 800_000] }
    const me = hotseatViewpoint(g)
    const opp = (1 - me) as 0 | 1

    const h = new GameHarness(g).mount(); active = h
    const clock = h.container.querySelector('.playerbar.opp .clock.giftable') as HTMLElement
    expect(clock, "the opponent's clock is clickable (giftable)").toBeTruthy()
    expect(h.container.querySelector('.playerbar.me .clock.giftable'), 'your OWN clock is not giftable').toBeFalsy()

    const before = [...g.clock.remaining] as [number, number]
    h.click(clock)
    const plus1 = [...h.container.querySelectorAll('.confirm-actions button')].find((b) => b.textContent === '+1 min') as HTMLElement
    expect(plus1, 'the +1 min preset is offered').toBeTruthy()
    h.click(plus1)

    expect(g.clock.remaining[opp], 'opponent gained exactly 60s').toBe(before[opp] + 60_000)
    expect(g.clock.remaining[me], 'your own clock is untouched').toBe(before[me])
    expect(h.drifts, 'the gift was accepted (no drift)').toHaveLength(0)
    expect(h.container.querySelector('.confirm-actions'), 'the chooser closed after picking').toBeFalsy()
  })
})
