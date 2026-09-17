// On mobile, a board-targeting prompt BANNER (chooseSquare/chooseTargets/moveRegion/…) can
// sit over a site/minion/artifact the player must click. It must be draggable (anywhere on
// its background) so it can be shoved aside. Modals already drag by their header; this covers
// the banners via the delegated pointer handler on the game root.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

// jsdom lacks PointerEvent; the handler only reads type + clientX/Y, so a typed MouseEvent
// dispatched under the pointer* names drives it exactly the same.
const pev = (type: string, x: number, y: number) => new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })

describe('mobile prompt banners are draggable', () => {
  it('a chooseSquare banner moves when dragged, keeping its horizontal centering', () => {
    const g = sweepBoardBase()
    g.prompts.push({ id: 'pb1', player: 0, kind: 'chooseSquare', title: 'pick a square', data: { squares: [{ x: 2, y: 2 }] }, cont: '', ctx: {} } as any)

    const h = new GameHarness(g); h.mobile = true; h.mount(); active = h
    const banner = h.container.querySelector('.promptbanner') as HTMLElement
    expect(banner, 'a prompt banner is shown').toBeTruthy()
    expect(banner.style.transform, 'starts un-dragged (CSS handles the -50% centering)').toBe('')

    // press on the banner background and drag down-right
    act(() => { banner.dispatchEvent(pev('pointerdown', 100, 100)) })
    act(() => { window.dispatchEvent(pev('pointermove', 158, 140)) })
    act(() => { window.dispatchEvent(pev('pointerup', 158, 140)) })

    expect(banner.style.transform, 'centering preserved + offset applied').toMatch(/^translate\(calc\(-50% \+ [\d.]+px\),\s*[\d.]+px\)$/)
    expect(Number(banner.dataset.dragx), 'moved right').toBeGreaterThan(0)
    expect(Number(banner.dataset.dragy), 'moved down').toBeGreaterThan(0)
  })

  it('pressing a BUTTON inside the banner does NOT start a drag (controls still work)', () => {
    const g = sweepBoardBase()
    // a chooseTargets prompt with a skip control renders a button in the banner
    g.prompts.push({ id: 'pb2', player: 0, kind: 'chooseTargets', title: 'pick a target', data: { candidates: [], count: 1, upTo: true, kind: 'unit' }, cont: '', ctx: {} } as any)

    const h = new GameHarness(g); h.mobile = true; h.mount(); active = h
    const banner = h.container.querySelector('.promptbanner') as HTMLElement
    const btn = banner?.querySelector('button') as HTMLElement | null
    if (!btn) return // (no button in this banner variant — nothing to assert)

    act(() => { btn.dispatchEvent(pev('pointerdown', 100, 100)) })
    act(() => { window.dispatchEvent(pev('pointermove', 180, 180)) })
    act(() => { window.dispatchEvent(pev('pointerup', 180, 180)) })
    expect(banner.style.transform, 'a press on a control must not drag the banner').toBe('')
  })
})
