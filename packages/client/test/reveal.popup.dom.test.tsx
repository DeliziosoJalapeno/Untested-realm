// When your opponent publicly reveals card(s) (Common Sense, Black Mass…), a close-only popup
// lists them, links each to the detail panel (onHover), and dismisses on Close.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('opponent reveal popup', () => {
  it('shows the revealed cards and closes; a reveal by YOU shows nothing', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const opp = (1 - me) as 0 | 1
    g.flow = { ...(g.flow ?? {}), reveals: [{ by: opp, names: ['Fireball', 'Common Cottagers'], n: 1 }] }

    const h = new GameHarness(g).mount(); active = h
    h.rerender()

    const pop = h.container.querySelector('[data-reveal-pop]') as HTMLElement
    expect(pop, 'the reveal popup rendered').toBeTruthy()
    expect(pop.querySelector('[data-reveal-card="Fireball"]'), 'lists the first card').toBeTruthy()
    expect(pop.querySelector('[data-reveal-card="Common Cottagers"]'), 'lists the second card').toBeTruthy()

    // Close dismisses it
    h.click(pop.querySelector('.reveal-pop-close') as HTMLButtonElement)
    h.rerender()
    expect(h.container.querySelector('[data-reveal-pop]'), 'closed').toBeFalsy()
  })

  it('a reveal BY the viewing player is not popped to them', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    g.flow = { ...(g.flow ?? {}), reveals: [{ by: me, names: ['Fireball'], n: 7 }] }
    const h = new GameHarness(g).mount(); active = h
    h.rerender()
    expect(h.container.querySelector('[data-reveal-pop]'), 'your own reveal is not shown to you').toBeFalsy()
  })
})
