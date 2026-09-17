// Adept Illusionist "summon nearby" through the REAL GUI: select the illusionist, click its
// mirror ability, then click a nearby SITE to place the copy there. Regression guard for the
// clickSite bug — the ability raises a chooseSquare over NEARBY SITES while the source unit is
// still selected (mode 'unit'), and a site fills its square, so the click must answer the prompt
// (clickSite) rather than fall through to the unit's move/attack logic.
import { describe, it, expect, afterEach } from 'vitest'
import { board, usummon, inject, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

const siteIdAt = (g: GameState, x: number, y: number) =>
  (Object.values(g.sites).find((s: any) => s.x === x && s.y === y && !s.isRubble) as any)?.id as string
const illusionistsAt = (g: GameState, x: number, y: number) =>
  Object.values(g.units).filter((u: any) => u.name === 'Adept Illusionist' && u.x === x && u.y === y)

describe('Adept Illusionist — pick the nearby site in the GUI', () => {
  it('activating mirror prompts for a nearby site; clicking one summons the copy there', () => {
    const g = board() // p0 sites at (2,0),(2,1),(3,1),(1,1); p0's turn
    const id = usummon(g, 0, 'Adept Illusionist', 1, 1)
    g.units[id].enteredTurn = -5; g.units[id].tapped = false
    inject(g, 0, 'Adept Illusionist') // the copy to summon, in hand

    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement) // select it
    h.click(h.container.querySelector(`[data-ability="mirror"][data-source="${id}"]`) as HTMLElement) // Tap → summon nearby

    // nearby sites of (1,1) = (1,1),(2,1),(2,0) → a real choice, so a chooseSquare prompt appears
    expect(h.state.prompts[0]?.kind, 'nearby-site choice raised').toBe('chooseSquare')

    // click the nearby SITE at (2,0) — a site fills its square, so this exercises clickSite
    h.click(h.container.querySelector(`[data-site="${siteIdAt(g, 2, 0)}"]`) as HTMLElement)

    expect(illusionistsAt(g, 2, 0).length, 'copy summoned at the clicked nearby site').toBe(1)
    expect(illusionistsAt(g, 1, 1).length, 'only the caster remains on its own square').toBe(1)
    expect(h.state.prompts.length, 'the prompt was answered').toBe(0)
    expect(h.drifts, 'no engine drift — the click answered the prompt, not a move').toHaveLength(0)
  })
})
