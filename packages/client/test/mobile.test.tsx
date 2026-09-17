// Mobile GUI mode renders the rotated/landscape layout: the `.game.mobile` container,
// a 🂠 Hand toggle that overlays the hand over the board, both player bars (life/mana)
// and the card panel present, and no engine drift from the normal board interactions.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'
import { mobileForced } from '../src/mobile'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('mobile GUI layout', () => {
  it('renders the mobile game container with rail bars, card panel, and a hand toggle', () => {
    const g = sweepBoardBase()
    const h = new GameHarness(g); h.mobile = true; h.mount(); active = h
    const root = h.container

    expect(root.querySelector('.game.mobile'), 'mobile game container').toBeTruthy()
    // left rail: both player bars (life/mana) are present
    expect(root.querySelectorAll('.game.mobile .playerbar').length, 'both player bars').toBe(2)
    // right card panel + log
    expect(root.querySelector('.game.mobile .sidebar .preview')).toBeTruthy()
    // the hand toggle button
    const toggle = root.querySelector('.m-hand-btn') as HTMLButtonElement
    expect(toggle, 'hand toggle button shown on mobile').toBeTruthy()
  })

  it('the 🂠 Hand toggle opens/closes the hand overlay', () => {
    const g = sweepBoardBase()
    const h = new GameHarness(g); h.mobile = true; h.mount(); active = h
    const root = h.container

    expect(root.querySelector('.game.mobile.hand-open'), 'hand starts hidden').toBeNull()
    h.click(root.querySelector('.m-hand-btn') as HTMLElement); h.rerender()
    expect(root.querySelector('.game.mobile.hand-open'), 'hand opens on toggle').toBeTruthy()
    h.click(root.querySelector('.m-hand-btn') as HTMLElement); h.rerender()
    expect(root.querySelector('.game.mobile.hand-open'), 'hand closes on toggle').toBeNull()
  })

  it('desktop mode has no mobile container or hand toggle (no regression)', () => {
    const g = sweepBoardBase()
    const h = new GameHarness(g); h.mount(); active = h // mobile = false
    expect(h.container.querySelector('.game.mobile')).toBeNull()
    expect(h.container.querySelector('.m-hand-btn')).toBeNull()
  })

  it('mobileForced() reads the URL flag', () => {
    // jsdom default location has no ?mobile → forced is false
    expect(mobileForced()).toBe(false)
  })
})
