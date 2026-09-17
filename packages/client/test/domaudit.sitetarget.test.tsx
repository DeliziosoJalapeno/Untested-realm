// Regression: a site-target spell (Craterize, Cave-In, …) must be castable on an
// OCCUPIED site by clicking anywhere in that site's square — not only by hitting
// the exact unit chip or the site-card image. The board square's own onClick
// (clickSquare) previously had no site-target branch, so a click that landed on
// the bare square area around a unit sitting on the site was a DEAD click, and the
// site looked un-targetable whenever a minion occupied it. clickUnit and clickSite
// already redirect to the site beneath; clickSquare must do the same.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { inject as cinject, sweepBoardBase } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'
import { GSETUPS } from './gsetups'
import type { GameState } from '@sorcery/shared'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

/** drop an enemy Foot Soldier onto (x,y) so the target site is "occupied". */
function occupy(g: GameState, x: number, y: number): string {
  const cardId = `occc${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name: 'Foot Soldier', owner: 1 }
  const id = `occu${g.nextId++}`
  ;(g.units as any)[id] = {
    id, cardId, name: 'Foot Soldier', owner: 1, controller: 1, isAvatar: false,
    x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: -1,
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
  return id
}

describe('site-target spell on an OCCUPIED site — the square is clickable', () => {
  it('Cave-In: clicking the occupied site square burrows the occupant', () => {
    const g = sweepBoardBase()
    GSETUPS['Cave-In'].setup(g) // onlySite(2,1) + enemy Foot Soldier at (2,1)
    cinject(g, 0, 'Cave-In')
    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    h.click(root.querySelector('[data-hand][data-card="Cave-In"]') as HTMLElement); h.rerender()
    const enemyId = Object.values(g.units).find((u) => u.controller === 1 && !u.isAvatar && u.x === 2 && u.y === 1)!.id
    const drift0 = h.drifts.length
    h.click(root.querySelector('[data-sq="2,1"]') as HTMLElement); h.rerender()
    expect(h.drifts.length, 'no engine drift').toBe(drift0)
    expect(!g.units[enemyId] || g.units[enemyId].region === 'underground', 'occupant burrowed').toBe(true)
    expect(root.querySelector('[data-modebanner="magic"]'), 'cast completed (left magic mode)').toBeNull()
  })

  it('Craterize: clicking the occupied target site destroys it', () => {
    const g = sweepBoardBase()
    GSETUPS['Craterize'].setup(g) // discards a site (extra cost) + target site at (2,2)
    occupy(g, 2, 2)
    cinject(g, 0, 'Craterize')
    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    h.click(root.querySelector('[data-hand][data-card="Craterize"]') as HTMLElement); h.rerender()
    const sitesBefore = Object.keys(g.sites).length
    const rubbleBefore = Object.values(g.sites).filter((s) => s.isRubble).length
    const drift0 = h.drifts.length
    h.click(root.querySelector('[data-sq="2,2"]') as HTMLElement); h.rerender()
    // Craterize is a printed-area damage spell → its cast is held behind the
    // area-damage confirmation panel; commit it.
    const cast = root.querySelector('[data-modebanner="areaConfirm"] [data-confirm="1"]') as HTMLElement | null
    if (cast) { h.click(cast); h.rerender() }
    const destroyed =
      Object.keys(g.sites).length < sitesBefore ||
      Object.values(g.sites).filter((s) => s.isRubble).length > rubbleBefore
    expect(h.drifts.length, 'no engine drift').toBe(drift0)
    expect(destroyed, 'target site destroyed').toBe(true)
  })
})
