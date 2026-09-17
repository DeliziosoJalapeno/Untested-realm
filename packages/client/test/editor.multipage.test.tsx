// The Editor is a multi-page menu, and sites / artifacts / auras get the same select-to-modify
// treatment as minions: clicking one on the board (Editor open) opens the Modify page focused on
// it, and every object type has its own tools — including auras, which can now be removed.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function openEditor(h: GameHarness) {
  if (h.container.querySelector('.judgepanel')) return
  const btn = [...h.container.querySelectorAll('button')].find(
    (b) => /Editor/.test(b.textContent || '') && !/asked|🔒/.test(b.textContent || ''),
  )!
  h.click(btn); h.rerender()
}
const destroyBtn = (h: GameHarness) =>
  [...h.container.querySelectorAll('.judgepanel button')].find((b) => /destroy/.test(b.textContent || '')) as HTMLButtonElement

describe('Editor multi-page — select-to-modify for sites and auras', () => {
  it('clicking a site with the Editor open focuses the Modify/Site page on it, and destroy works', () => {
    const g = sweepBoardBase()
    const siteId = Object.keys(g.sites).find((id) => !g.sites[id].isRubble)!
    const h = new GameHarness(g).mount(); active = h
    openEditor(h)

    const siteEl = h.container.querySelector(`[data-site="${siteId}"]`) as HTMLElement
    expect(siteEl, 'the site renders').toBeTruthy()
    h.click(siteEl); h.rerender()

    // the panel auto-switched to the Modify tab, focused on the Site type
    expect((h.container.querySelector('[data-judge-tab="modify"]') as HTMLElement).classList.contains('active'), 'Modify tab active').toBe(true)
    expect((h.container.querySelector('[data-judge-modtype="site"]') as HTMLElement).classList.contains('active'), 'Site sub-tab active').toBe(true)

    const d = destroyBtn(h)
    expect(d, 'a destroy button is offered for the site').toBeTruthy()
    h.click(d); h.rerender()
    const s = h.state.sites[siteId]
    expect(s === undefined || s.isRubble, 'the site was destroyed (rubble or gone)').toBe(true)
  })

  it('the Aura page lists placed auras and removes them', () => {
    const g = sweepBoardBase()
    const anySite = Object.values(g.sites)[0] as any
    const cardId = `ca${g.nextId++}`; (g.cards as any)[cardId] = { id: cardId, name: 'Wildfire', owner: 0 }
    const auraId = `r${g.nextId++}`
    ;(g.auras as any)[auraId] = { id: auraId, cardId, name: 'Wildfire', controller: 0, squares: [{ x: anySite.x, y: anySite.y }] }

    const h = new GameHarness(g).mount(); active = h
    openEditor(h)
    h.click(h.container.querySelector('[data-judge-tab="modify"]') as HTMLElement); h.rerender()
    h.click(h.container.querySelector('[data-judge-modtype="aura"]') as HTMLElement); h.rerender()

    const sel = h.container.querySelector('[data-judge-aurasel]') as HTMLSelectElement
    expect(sel, 'the aura selector renders').toBeTruthy()
    h.type(sel as unknown as HTMLInputElement, auraId); h.rerender()
    const d = destroyBtn(h)
    expect(d, 'a destroy button is offered for the aura').toBeTruthy()
    h.click(d); h.rerender()
    expect(h.state.auras[auraId], 'the aura was removed from the board').toBeUndefined()
  })

  it('create → board still places on a SITED square (editor-select must not swallow the placement click)', () => {
    const g = sweepBoardBase()
    const site = Object.values(g.sites).find((s: any) => !s.isRubble) as any
    const h = new GameHarness(g).mount(); active = h
    openEditor(h)
    // Create tab → a minion owned by player 0
    h.click(h.container.querySelector('[data-judge-tab="create"]') as HTMLElement); h.rerender()
    h.type(h.container.querySelector('[data-judge-name]') as HTMLInputElement, 'Amazon Warriors')
    h.type(h.container.querySelector('[data-judge-owner]') as unknown as HTMLInputElement, '0')
    h.rerender()
    h.click(h.container.querySelector('[data-judge-dest="board"]') as HTMLButtonElement); h.rerender()
    // now in judgePlace — click the SITE card at a sited square (what a real click on that square hits)
    const before = Object.keys(h.state.units).length
    h.click(h.container.querySelector(`[data-site="${site.id}"]`) as HTMLElement); h.rerender()
    expect(Object.keys(h.state.units).length, 'a unit was materialized (not swallowed by editor-select)').toBe(before + 1)
    expect(Object.values(h.state.units).some((u) => u.name === 'Amazon Warriors' && u.x === site.x && u.y === site.y), 'placed on the sited square').toBe(true)
  })

  it('clicking an aura on the board (Editor open) focuses the Modify/Aura page on it', () => {
    const g = sweepBoardBase()
    const anySite = Object.values(g.sites)[0] as any
    const cardId = `ca${g.nextId++}`; (g.cards as any)[cardId] = { id: cardId, name: 'Wildfire', owner: 0 }
    const auraId = `r${g.nextId++}`
    ;(g.auras as any)[auraId] = { id: auraId, cardId, name: 'Wildfire', controller: 0, squares: [{ x: anySite.x, y: anySite.y }] }

    const h = new GameHarness(g).mount(); active = h
    openEditor(h)
    // the hit target is the aura's CARD image, not its whole footprint (so the site beneath and
    // any overlapping auras stay reachable).
    const auraEl = h.container.querySelector(`[data-aura-hit="${auraId}"]`) as HTMLElement
    expect(auraEl, 'the aura card is a clickable hit target on the board').toBeTruthy()
    h.click(auraEl); h.rerender()
    expect((h.container.querySelector('[data-judge-tab="modify"]') as HTMLElement).classList.contains('active'), 'Modify tab active').toBe(true)
    expect((h.container.querySelector('[data-judge-modtype="aura"]') as HTMLElement).classList.contains('active'), 'Aura sub-tab active').toBe(true)
    // the panel is focused on that aura → its destroy tool operates on it
    h.click(destroyBtn(h)); h.rerender()
    expect(h.state.auras[auraId], 'destroyed the board-selected aura').toBeUndefined()
  })
})
