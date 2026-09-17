import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { fightUnits } from '../src/engine/combat'

// "Whenever Stygian Archers kill an enemy, summon a Skeleton token where it died."
// Rulebook: simultaneous triggers resolve — so if the Archers TRADE (die in the same
// fight they scored a kill), the kill trigger still fires. They summon their Skeleton
// even as they fall.

describe('Stygian Archers summon a Skeleton even on a trade', () => {
  it('archer dies in the fight but its kill still summons a Skeleton where the enemy fell', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    const archer = summonCard(g, 0, 'Stygian Archers', 2, 2); archer.enteredTurn = 0
    // A co-located 3/3 that strikes back on defence (unlike Escyllion Cyclops). Silence
    // it so ONLY the archer's kill trigger fires — a clean single-Skeleton assertion.
    const enemy = summonCard(g, 1, 'Stygian Archers', 2, 2); enemy.enteredTurn = 0; enemy.silenced = true

    fightUnits(g, archer, enemy)

    expect(g.units[enemy.id], 'enemy was killed').toBeUndefined()
    expect(g.units[archer.id], 'archer traded and died too').toBeUndefined()
    const skele = Object.values(g.units).find((u) => u.name === 'Skeleton' && u.controller === 0)
    expect(skele, 'a Skeleton is summoned despite the archer dying in the trade').toBeTruthy()
    expect([skele!.x, skele!.y]).toEqual([2, 2])
  })

  it('control: an archer that survives its kill still summons a Skeleton', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    const archer = summonCard(g, 0, 'Stygian Archers', 2, 2); archer.enteredTurn = 0
    // Bone Jumble is a vanilla 1/1: the archer's 3 kills it, and its 1 return-strike
    // can't kill the 3-toughness archer, so the archer survives the kill.
    const prey = summonCard(g, 1, 'Bone Jumble', 2, 2); prey.enteredTurn = 0

    fightUnits(g, archer, prey)

    const skele = Object.values(g.units).find((u) => u.name === 'Skeleton' && u.controller === 0)
    expect(skele, 'Skeleton summoned on a normal (surviving) kill').toBeTruthy()
  })
})
