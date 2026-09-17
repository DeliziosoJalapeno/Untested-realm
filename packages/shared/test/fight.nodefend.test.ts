import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { beginAttack, fightUnits } from '../src/engine/combat'

// Rulebook: "Only 'attacks' can be defended; attacks are only caused by the Move and Attack
// basic ability, or very specific card text that uses the word 'attack.'" A "fight" (Pudge
// Butcher's "may fight it", Lord of Lies…) opens NO defend window and isn't an attack — it goes
// straight to the strike exchange via fightUnits; a standard attack (beginAttack) still does.

function board() {
  const g = newGame(42, 0); keepBoth(g)
  for (const [x, y] of [[2, 2], [3, 2]] as const) placeSite(g, 0, 'Active Volcano', x, y)
  const attacker = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); attacker.enteredTurn = 0
  const prey = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); prey.enteredTurn = 0 // co-located enemy
  const defender = summonCard(g, 1, 'Escyllion Cyclops', 3, 2); defender.enteredTurn = 0 // could reach (2,2)
  return { g, attacker, prey, defender }
}

describe('a fight cannot be defended', () => {
  it('a fight opens no defend window and resolves straight to the strike exchange', () => {
    const { g, attacker, prey } = board()
    fightUnits(g, attacker, prey)
    expect(g.prompts.some((p) => p.kind === 'defend'), 'no defend prompt for a fight').toBe(false)
    expect(g.units[prey.id], 'the fight resolved — the prey was struck down').toBeUndefined()
  })

  it('a standard attack DOES open the defend window (control)', () => {
    const { g, attacker, prey } = board()
    beginAttack(g, attacker, { unit: prey.id }) // no isFight → the Move-and-Attack path
    expect(g.prompts.some((p) => p.kind === 'defend'), 'an attack can be defended').toBe(true)
  })
})
