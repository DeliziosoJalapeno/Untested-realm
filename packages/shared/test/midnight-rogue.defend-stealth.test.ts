// Midnight Rogue (reported: "midnight rogue blocked and didnt lose stealth"). Defending is an
// interaction: a Stealth minion reveals itself by blocking, so its Stealth token is spent even when it
// defends in place (without walking to the fight).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, act, answer } from './helpers'

describe('Midnight Rogue loses Stealth when it defends', () => {
  it('a stealthed minion that blocks in place spends its Stealth', () => {
    const g = newGame(); keepBoth(g); g.turn = 3
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const attacker = summonCard(g, 0, 'Foot Soldier', 2, 2); attacker.enteredTurn = -1
    const target = summonCard(g, 1, 'Foot Soldier', 2, 2); target.enteredTurn = -1
    const rogue = summonCard(g, 1, 'Midnight Rogue', 2, 2); rogue.enteredTurn = -1
    rogue.stealth = true

    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: target.id } })
    answer(g, [rogue.id]) // the Rogue blocks (in place — no movement)

    expect(rogue.stealth, 'blocking revealed the Rogue — Stealth spent').toBeFalsy()
  })
})
