// The floating minion/site/artifact ACTION menu (.actionfloat) must be draggable on PC too,
// just like the prompt banners — it pops up beside the selected unit and can cover a board
// square you need to click. Dragging its background or title (not its buttons) shoves it aside.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
// The desktop game is now uniformly scaled to a 1600×900 design canvas; pin the test
// viewport to that size so uiScale (and thus the 1:1 drag scale) is exactly 1, keeping
// the pixel-exact drag assertions below meaningful.
beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
})
afterEach(() => { active?.unmount(); active = null })

describe('the floating action menu is draggable on desktop', () => {
  it('dragging the menu title moves the whole panel (plain translate offset)', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    // a minion I control (sweepBoardBase places my Foot Soldier at 1,1)
    const mine = Object.values(g.units as any).find(
      (u: any) => u.controller === me && !u.isAvatar,
    ) as any
    expect(mine, 'need a controllable minion').toBeTruthy()

    const h = new GameHarness(g).mount(); active = h // DESKTOP render (mobile=false)

    // select my minion → the .actionfloat menu renders beside it
    h.click(h.container.querySelector(`.unit.mine[data-unit="${mine.id}"]`) as HTMLElement)
    h.rerender()
    const menu = h.container.querySelector('.actionfloat') as HTMLElement
    expect(menu, 'the action menu rendered for the selected minion').toBeTruthy()
    expect(menu.style.transform || '', 'starts un-offset').not.toMatch(/\dpx/)

    // grab the title (a <b>, never a button) and drag it
    const handle = (menu.querySelector('b') as HTMLElement) ?? menu
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 150, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 250, clientY: 200 }))

    // moved by the delta (50, 50); NOT centered → plain translate, no -50% prefix
    expect(menu.style.transform, 'menu moved by the drag delta').toMatch(/translate\(50px, 50px\)/)
    expect(menu.style.transform, 'action menu is not center-anchored').not.toMatch(/-50%/)

    window.dispatchEvent(new MouseEvent('pointerup'))
  })

  it('a pointerdown on an action button does NOT get swallowed by the drag handler', () => {
    const g = sweepBoardBase() as any
    const h = new GameHarness(g).mount(); active = h
    // the avatar's action panel reliably carries buttons (e.g. "Tap: draw site")
    h.click(h.container.querySelector('.unit.mine[data-avatar="1"]') as HTMLElement)
    h.rerender()
    const menu = h.container.querySelector('.actionfloat') as HTMLElement
    expect(menu).toBeTruthy()
    const btn = menu.querySelector('button') as HTMLButtonElement
    expect(btn, 'the avatar menu has at least one action button').toBeTruthy()
    // a pointerdown on the button must NOT start a drag (the guard skips buttons)
    btn.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 150, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 260, clientY: 210 }))
    expect(menu.style.transform || '', 'button interaction did not drag the menu').not.toMatch(/\dpx/)
    window.dispatchEvent(new MouseEvent('pointerup'))
  })

  it('the panel body (not the title) does NOT drag — so a long list can scroll', () => {
    const g = sweepBoardBase() as any
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector('.unit.mine[data-avatar="1"]') as HTMLElement)
    h.rerender()
    const menu = h.container.querySelector('.actionfloat') as HTMLElement
    const body = menu.querySelector('.unitactions') as HTMLElement // the scrollable body, not the <b> title
    expect(body).toBeTruthy()
    body.dispatchEvent(new MouseEvent('pointerdown', { clientX: 200, clientY: 150, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 260, clientY: 210 }))
    expect(menu.style.transform || '', 'dragging the body does not move the panel (only the title does)').not.toMatch(/\dpx/)
    window.dispatchEvent(new MouseEvent('pointerup'))
  })
})
