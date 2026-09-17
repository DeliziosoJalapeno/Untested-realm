// Focused DOM regression for the spell-vs-site hand-selection class fix.
//
// Wizard's Den text: "Genesis → Draw a spell. Discard a spell when this site is
// first attacked successfully." A player's hand holds both spells AND sites; the
// raid must offer ONLY spells (rulebook: any hand card that is not a site is a
// spell), and resolving must discard the chosen SPELL by id — never a site.
//
// This drives the real Game component: the Den (a p0 site) is damaged by p1
// through the engine's damage path (exactly as a successful attack does — see
// effects.ts dealDamage 'site' branch → emitEvent onSiteDamaged), the resulting
// chooseCards prompt is rendered by the REAL UI, and we assert the panel shows
// ONLY the two spell names, then click one and confirm and check the cemetery.
//
// NEGATIVE CONTROL (documented): on the pre-fix engine the panel rendered all
// four hand cards (2 spells + 2 sites) and confirming index 0 discarded a site;
// this test's "only two spell tiles" assertion and the "site still in hand"
// assertion both go red there. See faq.test.ts for the engine-level red→green.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { board, inject, place } from './domaudit'
import { dealDamage, type GameState } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => {
  active?.unmount()
  active = null
})

function must(root: HTMLElement, sel: string, why: string): HTMLElement {
  const el = root.querySelector(sel) as HTMLElement | null
  if (!el) throw new Error(`[${why}] expected element ${sel} not found`)
  return el
}

/** the Den's live site id (place() mints an fzs… id) */
function denId(g: GameState): string {
  const den = Object.values(g.sites).find((s) => s.name === "Wizard's Den")
  if (!den) throw new Error("Wizard's Den not on the board")
  return den.id
}

describe("DOM: Wizard's Den raid offers only spells, discards a spell by id", () => {
  it('renders exactly the two spell tiles; clicking one puts that spell in the cemetery', () => {
    const g = board()
    // control p0's hand exactly: 2 spells + 2 sites
    g.players[0].hand = []
    const fireball = inject(g, 0, 'Fireball')
    const drown = inject(g, 0, 'Drown')
    const flood = inject(g, 0, 'Floodplain')
    const rustic = inject(g, 0, 'Rustic Village')
    place(g, 0, "Wizard's Den", 4, 0) // p0's site, out of the way

    const h = new GameHarness(g)
    active = h
    h.mount()

    // p1 damages the Den successfully → onSiteDamaged fires the raid, pushing
    // the chooseCards prompt for p0 (the site's controller).
    dealDamage(g, { site: denId(g) }, 1, 1)
    h.rerender()

    const panel = must(h.container, '[data-promptbox="chooseCards"]', 'raid panel')
    const tiles = panel.querySelectorAll('[data-choice]')
    expect(tiles.length, 'only the two spells are offered').toBe(2)

    // the rendered card images name only spells — no site names
    const imgAlts = Array.from(panel.querySelectorAll('img')).map((im) => (im as HTMLImageElement).alt)
    for (const alt of imgAlts) {
      expect(['Floodplain', 'Rustic Village']).not.toContain(alt)
    }

    // click the tile whose engine candidate is Drown, then confirm
    const cards: string[] = (h.state.prompts[0] as any).data.cards
    const drownIdx = cards.indexOf('Drown')
    h.click(must(panel, `[data-choice="${drownIdx}"]`, 'Drown tile'))
    h.click(must(h.container, '[data-promptbox="chooseCards"] [data-confirm="1"]', 'confirm'))
    h.rerender()

    expect(h.state.players[0].cemetery).toContain(drown) // the chosen spell, by id
    expect(h.state.players[0].hand).toContain(fireball) // the other spell stays
    expect(h.state.players[0].hand).toContain(flood) // sites never eligible
    expect(h.state.players[0].hand).toContain(rustic)
    expect(h.drifts, 'no engine drift').toEqual([])
  })
})
