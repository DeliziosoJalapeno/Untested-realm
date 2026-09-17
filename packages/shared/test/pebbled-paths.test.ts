// Pebbled Paths: "Minions atop nearby sites lose Charge." A Charge minion summoned nearby is then
// summoning-sick on its first turn (can't tap → can't move/attack) just like a chargeless minion.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { canTap, isSummoningSick, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

const giveCharge = (u: UnitState, turn: number) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'charge', duration: 'permanent', turn, sourcePlayer: 0 })

describe('Pebbled Paths denies Charge to nearby minions', () => {
  it('a Charge minion summoned NEXT TO Pebbled Paths is summoning-sick', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Pebbled Paths', 1, 1)
    placeSite(g, 0, 'Rustic Village', 2, 1) // adjacent to Pebbled Paths
    const m = summonCard(g, 0, 'Bone Jumble', 2, 1); m.enteredTurn = g.turn // entered THIS turn
    giveCharge(m, g.turn)
    expect(isSummoningSick(g, m), 'nearby Pebbled Paths strips its Charge → sick').toBe(true)
    expect(canTap(g, m), 'so it cannot tap (move/attack) the turn it entered').toBe(false)
  })

  it('a Charge minion summoned ATOP the Pebbled Paths itself also loses Charge (nearby includes its own square)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Pebbled Paths', 1, 1)
    const m = summonCard(g, 0, 'Bone Jumble', 1, 1); m.enteredTurn = g.turn // standing ON the Pebbled Paths
    giveCharge(m, g.turn)
    expect(isSummoningSick(g, m), 'atop the Pebbled Paths → Charge stripped → sick').toBe(true)
    expect(canTap(g, m)).toBe(false)
  })

  it('the same Charge minion summoned AWAY from Pebbled Paths can act immediately', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Pebbled Paths', 1, 1)
    placeSite(g, 0, 'Rustic Village', 4, 3) // far from Pebbled Paths
    const m = summonCard(g, 0, 'Bone Jumble', 4, 3); m.enteredTurn = g.turn
    giveCharge(m, g.turn)
    expect(isSummoningSick(g, m), 'Charge lets it act the turn it entered').toBe(false)
    expect(canTap(g, m)).toBe(true)
  })
})
