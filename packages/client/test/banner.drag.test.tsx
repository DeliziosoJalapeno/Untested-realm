// Popup prompt banners must be draggable on PC too (previously mobile-only) — they can
// cover a board square you need to click, so you can shove them aside by dragging anywhere
// on the banner background. Modals already drag by their header.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
// Desktop is uniformly scaled to a 1600×900 design canvas; pin the test viewport there so
// uiScale (and the drag scale) is exactly 1 and the pixel-exact assertions hold.
beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
})
afterEach(() => { active?.unmount(); active = null })

describe('prompt banners are draggable on desktop', () => {
  it('dragging the banner background moves it (transform offset applied)', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const foe = Object.values(g.units as any).find((u: any) => u.controller !== me && !u.isAvatar) as any
    expect(foe, 'need an enemy unit to target').toBeTruthy()
    g.prompts = [{
      id: 'p1', player: me, kind: 'chooseTargets', title: 'Pick a target',
      data: { candidates: [foe.id], count: 1, kind: 'unit' },
      cont: 'noop', ctx: { sourceId: g.players[me].avatarUnitId, controller: me, targets: [] },
    }]
    const h = new GameHarness(g).mount(); active = h // harness renders DESKTOP (mobile=false)

    const banner = h.container.querySelector('.promptbanner[data-promptbox="chooseTargets"]') as HTMLElement
    expect(banner, 'the chooseTargets banner rendered').toBeTruthy()
    expect(banner.style.transform || '', 'starts un-offset').not.toMatch(/\dpx/)

    // MouseEvent-typed pointer events carry clientX/clientY reliably under jsdom
    banner.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 140 }))

    expect(banner.style.transform, 'the banner moved by the drag delta (60, 40)').toMatch(/60px/)
    expect(banner.style.transform).toMatch(/40px/)

    window.dispatchEvent(new MouseEvent('pointerup'))
  })
})
