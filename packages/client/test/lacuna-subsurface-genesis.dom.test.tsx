// A Genesis target can be a subsurface / void unit: Lacuna Entity (cast to the void) drags a BURROWED Root
// Spider from an adjacent site. Those units are drawn as small chips in the site's subsurface strip, and a
// click on one must make the Genesis pick, just like a surface chip.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { board, inject } from './domaudit'
import { usummon } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Genesis targets in the subsurface strip', () => {
  it('Lacuna Entity in the void picks a burrowed Root Spider at an adjacent site', () => {
    const g = board()
    const spider = usummon(g, 1, 'Root Spider', 3, 2)
    g.units[spider].region = 'underground'
    inject(g, 0, 'Lacuna Entity')
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector('[data-card="Lacuna Entity"]')!)
    h.rerender()
    h.click(h.container.querySelector('[data-sq="4,2"]')!) // a void square beside the spider's site
    h.rerender()
    expect(h.container.querySelector('[data-modebanner="genesisTargets"]'), 'genesis pick opened').not.toBeNull()
    h.click(h.container.querySelector(`.subsurface [data-unit="${spider}"]`)!)
    h.rerender()
    expect(h.state.units[spider], 'dragged into the void and banished').toBeUndefined()
    expect(Object.values(h.state.units).some((u) => u.name === 'Lacuna Entity' && u.region === 'void')).toBe(true)
  })
  // the target's chip is small: a click on its site (or anywhere in its square) picks it when it is the
  // only unit there that can be picked
  for (const how of ['site', 'square'] as const) {
    it(`a click on the target's ${how} picks the lone minion standing there`, () => {
      const g = board()
      const soldier = usummon(g, 1, 'Foot Soldier', 3, 2)
      inject(g, 0, 'Lacuna Entity')
      const h = new GameHarness(g).mount(); active = h
      h.click(h.container.querySelector('[data-card="Lacuna Entity"]')!)
      h.rerender()
      h.click(h.container.querySelector('[data-sq="3,1"]')!) // my site next to the soldier's
      h.rerender()
      expect(h.container.querySelector('[data-modebanner="genesisTargets"]'), 'genesis pick opened').not.toBeNull()
      h.click(h.container.querySelector(how === 'site' ? '[data-sq="3,2"] .sitecard' : '[data-sq="3,2"]')!)
      h.rerender()
      expect(h.state.units[soldier]).toMatchObject({ x: 3, y: 1 })
      expect(Object.values(h.state.units).some((u) => u.name === 'Lacuna Entity' && u.x === 3 && u.y === 1)).toBe(true)
    })
  }
})
