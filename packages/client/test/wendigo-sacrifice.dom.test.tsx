// Gnarled Wendigo: after choosing its square, the player picks which of their minions there to sacrifice
// (each one 2 less). The bar toggles picks (buttons or the chips themselves) and casts with exactly those.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { board, inject } from './domaudit'
import { usummon, getCard } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function open() {
  const g = board()
  const a = usummon(g, 0, 'Skeleton', 2, 0), b = usummon(g, 0, 'Skeleton', 2, 0)
  inject(g, 0, 'Gnarled Wendigo')
  const h = new GameHarness(g).mount(); active = h
  h.click(h.container.querySelector('[data-card="Gnarled Wendigo"]')!)
  h.rerender()
  h.click(h.container.querySelector('[data-sq="2,0"]')!)
  h.rerender()
  return { h, a, b }
}

describe('Gnarled Wendigo: choose the sacrifices', () => {
  it('offers your minions there; casting sacrifices only the picked one', () => {
    const { h, a, b } = open()
    const bar = h.container.querySelector('[data-modebanner="castSacrifice"]')
    expect(bar, 'the sacrifice bar opened').not.toBeNull()
    expect([...bar!.querySelectorAll('[data-sac]')].map((e) => e.getAttribute('data-sac')).sort()).toEqual([a, b].sort())
    const full = getCard('Gnarled Wendigo').cost ?? 0
    expect(bar!.querySelector('[data-confirm]')!.textContent).toContain(`(${full})`)
    h.click(h.container.querySelector(`.unit[data-unit="${a}"]`)!) // a chip click toggles it too
    h.rerender()
    const confirm = h.container.querySelector('[data-modebanner="castSacrifice"] [data-confirm]')!
    expect(confirm.textContent).toContain(`(${full - 2})`)
    const mana = h.state.players[0].mana
    h.click(confirm)
    h.rerender()
    expect(h.state.units[a], 'picked → sacrificed').toBeUndefined()
    expect(h.state.units[b], 'not picked → stays').toBeDefined()
    expect(h.state.players[0].mana).toBe(mana - (full - 2))
    expect(Object.values(h.state.units).some((u) => u.name === 'Gnarled Wendigo')).toBe(true)
  })
})
