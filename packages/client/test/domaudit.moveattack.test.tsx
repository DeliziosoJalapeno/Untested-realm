// Regression: a Burrowing/Submerge unit standing on the SURFACE of an enemy site
// must be able to ATTACK that site. Previously a bare square click found exactly one
// reachable region (the subsurface) and dove the unit underground/underwater instead
// of ever offering the attack. Now the click opens the move/attack chooser, which
// offers ⚔ Attack alongside the dive — and the unit does NOT auto-burrow.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase, usummon } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Burrowing unit on an enemy site can attack it (not just dive)', () => {
  it('clicking the site square offers ⚔ Attack and does not auto-burrow', () => {
    const g = sweepBoardBase()
    // (3,2) is a p1-controlled land site on the sweep board. Stand a p0 Barrow Wight
    // (Burrowing) on its surface, un-sick.
    const wid = usummon(g, 0, 'Barrow Wight', 3, 2)
    g.units[wid].region = 'surface'
    g.units[wid].enteredTurn = g.turn - 2
    const h = new GameHarness(g).mount(); active = h
    const root = h.container

    // select the Wight, then click ITS square (the site beneath it)
    h.click(root.querySelector(`[data-unit="${wid}"]`) as HTMLElement); h.rerender()
    h.click(root.querySelector('[data-sq="3,2"]') as HTMLElement); h.rerender()

    // the move/attack chooser must be up with an ⚔ Attack option — and the Wight must
    // still be on the surface (the old bug dove it underground with no attack offered)
    const banner = root.querySelector('[data-modebanner="moveChoice"]')
    expect(banner, 'move/attack chooser shown').toBeTruthy()
    const labels = [...banner!.querySelectorAll('[data-choice]')].map((b) => b.textContent ?? '')
    expect(labels.some((t) => /Attack/i.test(t)), `an Attack option is offered (got: ${labels.join(' | ')})`).toBe(true)
    expect(g.units[wid].region, 'the unit did NOT auto-burrow').toBe('surface')

    // clicking Attack initiates the strike against the site (no engine drift)
    const attackBtn = [...banner!.querySelectorAll('[data-choice]')].find((b) => /Attack/i.test(b.textContent ?? '')) as HTMLElement
    const drift0 = h.drifts.length
    h.click(attackBtn); h.rerender()
    expect(h.drifts.length, 'no engine drift on the attack').toBe(drift0)
  })
})
