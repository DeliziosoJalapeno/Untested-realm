// Single-square auras (Wildfire, singleSiteAura) render small in the artifact strip of their square,
// laid out side by side — so several auras on the same square each stay visible without covering each
// other. (Multi-square 2x2 area auras use the big overlay image + a fan; that's covered elsewhere.)
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
