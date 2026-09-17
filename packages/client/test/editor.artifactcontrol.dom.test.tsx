// Editor: a ground artifact / Monument (Makeshift Barricade) shows a "⇄ control → <player>" button that
// hands it to the other player. Drives the real Editor overlay through the DOM.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { board } from './domaudit'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function openEditor(h: GameHarness) {
  if (h.container.querySelector('.judgepanel')) return
  const btn = [...h.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Editor'))!
  h.click(btn); h.rerender()
}
const byAttr = (h: GameHarness, attr: string, val: string) =>
  [...h.container.querySelectorAll(`[${attr}]`)].find((e) => e.getAttribute(attr) === val) as HTMLElement | undefined

describe('editor: change a monument controller', () => {
  it('flips a ground Makeshift Barricade to the other player', () => {
    const g: any = board()
    const cid = 'cbar'; g.cards[cid] = { id: cid, name: 'Makeshift Barricade', owner: 0 }
    const aid = 'abar'; g.artifacts[aid] = { id: aid, cardId: cid, name: 'Makeshift Barricade', conjuredBy: 0, x: 1, y: 1, region: 'surface', carriedBy: null, tapped: false }
    const h = new GameHarness(g).mount(); active = h

    openEditor(h)
    byAttr(h, 'data-judge-tab', 'modify') && h.click(byAttr(h, 'data-judge-tab', 'modify')!); h.rerender()
    byAttr(h, 'data-judge-modtype', 'artifact') && h.click(byAttr(h, 'data-judge-modtype', 'artifact')!); h.rerender()
    const sel = h.container.querySelector('[data-judge-artsel]') as HTMLSelectElement
    expect(sel, 'the artifact selector renders').toBeTruthy()
    h.type(sel as unknown as HTMLInputElement, aid); h.rerender()

    const ctrl = [...h.container.querySelectorAll('button')].find((b) => b.textContent?.includes('control →'))
    expect(ctrl, 'the control button renders for a ground monument').toBeTruthy()
    h.click(ctrl!); h.rerender()

    expect(g.artifacts[aid].conjuredBy, 'control handed to the other player').toBe(1)
  })
})
