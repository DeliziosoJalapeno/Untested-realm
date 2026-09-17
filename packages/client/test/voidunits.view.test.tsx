// A VOID square (no site) has no surface/subsurface split, so a unit standing in the void there is
// the square's real occupant and must render at the SAME full size as a minion on a site — not
// shrunk into the tiny subsurface-style void strip. Regression: void minions rendered super small.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { board } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('void minions render full-size, like on a site', () => {
  it('a void unit sits in the main units grid (not the small void strip)', () => {
    const g: any = board()
    // guarantee (0,0) is a VOID square: strip any site + any scaffold unit there
    for (const id of Object.keys(g.sites)) if (g.sites[id].x === 0 && g.sites[id].y === 0) delete g.sites[id]
    for (const id of Object.keys(g.units)) if (g.units[id].x === 0 && g.units[id].y === 0) delete g.units[id]
    // a lone unit standing in the void at (0,0)
    g.cards['vd'] = { id: 'vd', name: 'Headless Haunt', owner: 0 }
    g.units['vd'] = { id: 'vd', cardId: 'vd', name: 'Headless Haunt', owner: 0, controller: 0, isAvatar: false,
      x: 0, y: 0, region: 'void', tapped: false, damage: 0, enteredTurn: -1, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} }

    const h = new GameHarness(g).mount(); active = h
    const sq = h.container.querySelector('[data-sq="0,0"]') as HTMLElement
    const chip = sq.querySelector('[data-unit="vd"]') as HTMLElement
    expect(chip, 'the void unit renders').toBeTruthy()
    expect(sq.querySelector('.units [data-unit="vd"]'), 'rendered in the main full-size grid').toBeTruthy()
    expect(chip.classList.contains('small'), 'NOT the tiny subsurface size').toBe(false)
    expect(sq.querySelector('.voidunits'), 'no shrunken void strip on a void square').toBeFalsy()
  })
})
