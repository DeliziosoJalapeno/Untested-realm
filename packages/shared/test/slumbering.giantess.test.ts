// Slumbering Giantess: "Genesis → Fall asleep. Disabled until hurt." If she enters ALREADY disabled
// by another source, her fall-asleep genesis must NOT fire — so lifting the outside condition makes
// her a fully active minion even though she never took damage.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { effectSummonUnit } from '../src/engine/effects'
import { isDisabled } from '../src/engine/statics'
import type { GameState, UnitState } from '../src'
import '../src/cards/scripts/index'

function summonGiantess(g: GameState, x: number, y: number): UnitState | null {
  const cid = `c${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Slumbering Giantess', owner: 0 } as any
  const uid = `u${g.nextId++}`
  return effectSummonUnit(g, {
    id: uid, cardId: cid, name: 'Slumbering Giantess', owner: 0, controller: 0, isAvatar: false,
    x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  } as UnitState)
}

describe('Slumbering Giantess entering already disabled', () => {
  it('does NOT fall asleep, and lifting the outside disable makes her active without damage', () => {
    const g: GameState = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2)
    g.flow = g.flow ?? {}
    ;(g.flow as any).areaDisables = [{ siteId: site.id }] // an outside source disables units here

    const giantess = summonGiantess(g, 2, 2)!
    expect(giantess, 'she entered').toBeDefined()
    expect(giantess.counters?.asleep, 'her fall-asleep genesis did NOT fire').toBeFalsy()
    expect(giantess.disabled, 'no self-inflicted disabled flag').toBeFalsy()
    expect(isDisabled(g, giantess), 'she is disabled only by the outside source').toBe(true)

    ;(g.flow as any).areaDisables = [] // lift the outside condition
    expect(isDisabled(g, giantess), 'now fully active — no damage required').toBe(false)
    expect(giantess.damage, 'and she never took damage').toBe(0)
  })

  it('control: entering NORMALLY she falls asleep (disabled until hurt)', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const giantess = summonGiantess(g, 2, 2)!
    expect(giantess.counters?.asleep, 'she fell asleep').toBe(1)
    expect(isDisabled(g, giantess), 'and is disabled').toBe(true)
  })
})
