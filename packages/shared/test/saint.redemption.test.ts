// Saint of Redemption: "No minion is Evil, but all enter the realm tapped." The Saint's own entry
// precedes his static, so HE enters untapped; minions entering after him arrive tapped.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { effectSummonUnit } from '../src/engine/effects'
import type { GameState, UnitState } from '../src'
import '../src/cards/scripts/index'

function summonReal(g: GameState, name: string, x: number, y: number, owner: 0 | 1 = 0): UnitState | null {
  const cid = `c${g.nextId++}`; g.cards[cid] = { id: cid, name, owner } as any
  const uid = `u${g.nextId++}`
  return effectSummonUnit(g, {
    id: uid, cardId: cid, name, owner, controller: owner, isAvatar: false,
    x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  } as UnitState)
}

describe('Saint of Redemption', () => {
  it('enters UNtapped himself, but later minions enter tapped', () => {
    const g: GameState = newGame(); keepBoth(g)
    const saint = summonReal(g, 'Saint of Redemption', 2, 2)
    expect(saint?.tapped, 'the Saint enters untapped (his static applies after he arrives)').toBeFalsy()
    const later = summonReal(g, 'Bone Jumble', 3, 2)
    expect(later?.tapped, 'a minion entering after the Saint arrives tapped').toBe(true)
  })
})
