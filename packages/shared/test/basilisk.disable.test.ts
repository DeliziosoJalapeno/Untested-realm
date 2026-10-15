import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { isDisabled, checkStateBased, type GameState, type UnitState } from '../src'

function setup(): { g: GameState; bas: UnitState; victim: UnitState } {
  const g = newGame(); keepBoth(g)
  placeSite(g, 0, 'Hamlet', 2, 2)
  const bas = summonCard(g, 0, 'Hillock Basilisk', 2, 2); bas.enteredTurn = -1
  const victim = summonCard(g, 1, 'Foot Soldier', 2, 2); victim.enteredTurn = -1 // co-located = "here"
  checkStateBased(g)
  return { g, bas, victim }
}

describe('Hillock Basilisk disable turns OFF when the Basilisk is disabled/silenced', () => {
  it('baseline: an at-rest co-located minion is disabled', () => {
    const { g, victim } = setup()
    expect(isDisabled(g, victim)).toBe(true)
  })
  it('a DIRECTLY-disabled Basilisk stops disabling', () => {
    const { g, bas, victim } = setup()
    bas.disabled = true; checkStateBased(g)
    expect(isDisabled(g, victim), 'victim freed while Basilisk is disabled').toBe(false)
  })
  it("a 'disabled' modifier on the Basilisk stops it", () => {
    const { g, bas, victim } = setup()
    bas.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'permanent', turn: 0, sourcePlayer: 1 } as any); checkStateBased(g)
    expect(isDisabled(g, victim)).toBe(false)
  })
  it('a SILENCED Basilisk stops disabling', () => {
    const { g, bas, victim } = setup()
    bas.silenced = true; checkStateBased(g)
    expect(isDisabled(g, victim), 'victim freed while Basilisk is silenced').toBe(false)
  })
  it('an AREA-disabled Basilisk (Root Spider burrowed under it) stops disabling a minion IN FRONT', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Hamlet', 2, 2); placeSite(g, 0, 'Hamlet', 2, 3)
    const bas = summonCard(g, 0, 'Hillock Basilisk', 2, 2); bas.enteredTurn = -1
    const victim = summonCard(g, 1, 'Foot Soldier', 2, 3); victim.enteredTurn = -1 // "one step in front"
    checkStateBased(g)
    expect(isDisabled(g, victim), 'baseline: the Basilisk disables the minion in front').toBe(true)
    // a Root Spider burrowed UNDER the Basilisk disables the BASILISK (not the front minion directly)
    const spider = summonCard(g, 1, 'Root Spider', 2, 2, 'underground'); spider.enteredTurn = -1
    checkStateBased(g)
    expect(isDisabled(g, bas), 'the Basilisk is itself disabled by the Root Spider').toBe(true)
    expect(isDisabled(g, victim), 'so it no longer disables the front minion').toBe(false)
  })
})
