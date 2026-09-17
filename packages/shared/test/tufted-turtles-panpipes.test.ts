// Tufted Turtles PREVENTS the first hit each turn — a genuine prevention, not a reduction to 0. So a
// nearby Panpipes of Pnom ("damage caused by nearby units is increased to 2") cannot boost the
// prevented hit back up: prevention is final.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { dealDamage, type GameState } from '../src'
import '../src/cards/scripts/index'

function setup() {
  const g = newGame() as GameState; keepBoth(g)
  placeSite(g, 0, 'Rustic Village', 2, 2)
  placeSite(g, 0, 'Rustic Village', 2, 1)
  const turtle = summonCard(g, 0, 'Tufted Turtles', 2, 2); turtle.enteredTurn = -1
  turtle.modifiers.push({ kind: 'power', amount: 5, duration: 'permanent', turn: g.turn, sourcePlayer: 0 }) // +life so 2 damage doesn't kill it
  // a Panpipes of Pnom artifact next to the turtle
  const acid = `cp${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Panpipes of Pnom', owner: 0 }
  const pid = `ap${g.nextId++}`
  ;(g.artifacts as any)[pid] = { id: pid, cardId: acid, name: 'Panpipes of Pnom', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false }
  const attacker = summonCard(g, 1, 'Bone Jumble', 2, 1); attacker.enteredTurn = -1 // nearby enemy striker
  return { g, turtle, attacker }
}
const strikeTurtle = (g: GameState, turtleId: string, attackerId: string, name: string, n: number) =>
  dealDamage(g, { unit: turtleId }, n, 1, { player: 1, kind: 'strike', attackerId, name } as any)

describe('Tufted Turtles shell vs Panpipes of Pnom', () => {
  it('the shell PREVENTS the first hit — Panpipes cannot boost it back to 2', () => {
    const { g, turtle, attacker } = setup()
    strikeTurtle(g, turtle.id, attacker.id, attacker.name, 1)
    expect(g.units[turtle.id]?.damage, 'first hit prevented (0), not boosted to 2').toBe(0)
  })

  it('once the shell is spent, Panpipes DOES boost the next hit to 2', () => {
    const { g, turtle, attacker } = setup()
    strikeTurtle(g, turtle.id, attacker.id, attacker.name, 1) // shell used, prevented
    strikeTurtle(g, turtle.id, attacker.id, attacker.name, 1) // now boosted to 2
    expect(g.units[turtle.id]?.damage, 'second hit boosted to 2 by Panpipes').toBe(2)
  })

  it('even a 0-power strike is boosted FIRST, then prevented by the shell (increase before would-take-damage)', () => {
    const { g, turtle, attacker } = setup()
    strikeTurtle(g, turtle.id, attacker.id, attacker.name, 0) // 0-power strike → Panpipes 0→2 → shell prevents
    expect(g.units[turtle.id]?.damage, 'boosted to 2 then prevented → 0 (and the shell is spent)').toBe(0)
    strikeTurtle(g, turtle.id, attacker.id, attacker.name, 0) // shell spent → the boosted 0-strike now lands as 2
    expect(g.units[turtle.id]?.damage, 'shell gone → boosted 0-strike lands as 2').toBe(2)
  })
})
