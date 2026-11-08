// Single-square auras (Wildfire, singleSiteAura) render small in the artifact strip of their square,
// laid out side by side — so several auras on the same square each stay visible without covering each
// other. 2x2 auras on one intersection and walls on one border share that spot: their cards shrink
// and sit side by side (auraStackLayout) — see the second describe below.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function addAura(g: any, id: string, name: string, x: number, y: number) {
  const me = hotseatViewpoint(g)
  g.cards[`c${id}`] = { id: `c${id}`, name, owner: me }
  g.auras[id] = { id, cardId: `c${id}`, name, controller: me, squares: [{ x, y }] }
}

describe('overlapping single-square auras each stay visible in the strip', () => {
  it('two auras on the same square both render as separate strip thumbnails', () => {
    const g = sweepBoardBase() as any
    addAura(g, 'a1', 'Wildfire', 2, 2)
    addAura(g, 'a2', 'Eclipse', 2, 2) // same square — laid side by side, not stacked on top
    const h = new GameHarness(g).mount(); active = h

    const auras = [...h.container.querySelectorAll('.site-aura')] as HTMLElement[]
    expect(auras.length, 'both single-square auras render in the strip').toBe(2)
    expect(auras.map((a) => a.getAttribute('data-aura')).sort(), 'both auras present by id').toEqual(['a1', 'a2'])
  })

  it('a lone aura renders', () => {
    const g = sweepBoardBase() as any
    addAura(g, 'solo', 'Wildfire', 1, 1)
    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('.site-aura[data-aura="solo"]'), 'the aura renders').toBeTruthy()
  })
})

function add2x2(g: any, id: string, name: string, x: number, y: number) {
  const me = hotseatViewpoint(g)
  g.cards[`c${id}`] = { id: `c${id}`, name, owner: me }
  g.auras[id] = { id, cardId: `c${id}`, name, controller: me, anchor: { x, y }, squares: [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }] }
}
function addWall(g: any, id: string, name: string, a: { x: number; y: number }, b: { x: number; y: number }) {
  const me = hotseatViewpoint(g)
  g.cards[`c${id}`] = { id: `c${id}`, name, owner: me }
  g.auras[id] = { id, cardId: `c${id}`, name, controller: me, edge: { a, b }, squares: [a] }
}
const cardOf = (h: GameHarness, id: string, sel: string) => h.container.querySelector(`[data-aura="${id}"] ${sel}`) as HTMLElement

describe('auras drawn at the same spot share it, smaller and side by side', () => {
  it('two 2x2 auras on the same intersection: both cards shrink and are offset apart', () => {
    const g = sweepBoardBase() as any
    add2x2(g, 'b1', 'Blizzard', 1, 1)
    add2x2(g, 'b2', 'Eclipse', 1, 1)
    const h = new GameHarness(g).mount(); active = h
    const t1 = cardOf(h, 'b1', '.auraimg-wrap').style.transform
    const t2 = cardOf(h, 'b2', '.auraimg-wrap').style.transform
    expect(t1).toMatch(/scale\(0\.8\)/)
    expect(t2).toMatch(/scale\(0\.8\)/)
    expect(t1, 'the two cards sit at different spots').not.toBe(t2)
  })

  it('a lone 2x2 aura, and one on a different intersection, render exactly as before', () => {
    const g = sweepBoardBase() as any
    add2x2(g, 'b1', 'Blizzard', 0, 0)
    add2x2(g, 'b2', 'Eclipse', 2, 1)
    const h = new GameHarness(g).mount(); active = h
    expect(cardOf(h, 'b1', '.auraimg-wrap').style.transform).toBe('')
    expect(cardOf(h, 'b2', '.auraimg-wrap').style.transform).toBe('')
  })

  it('two walls on the same border: both cards shrink and are offset apart', () => {
    const g = sweepBoardBase() as any
    addWall(g, 'w1', 'Wall of Fire', { x: 1, y: 1 }, { x: 2, y: 1 })
    addWall(g, 'w2', 'Wall of Air', { x: 1, y: 1 }, { x: 2, y: 1 })
    addWall(g, 'w3', 'Wall of Brambles', { x: 3, y: 2 }, { x: 3, y: 3 })
    const h = new GameHarness(g).mount(); active = h
    const t1 = cardOf(h, 'w1', 'span').style.transform
    const t2 = cardOf(h, 'w2', 'span').style.transform
    expect(t1).toMatch(/scale\(0\.8\)/)
    expect(t1, 'the two cards sit at different spots').not.toBe(t2)
    expect(cardOf(h, 'w3', 'span').style.transform, 'a lone wall is unchanged').toBe('')
  })
})
