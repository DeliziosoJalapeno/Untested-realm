import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer } from './helpers'
import { dealDamageToUnit, checkStateBased, type GameState } from '../src'

function barricade(g: GameState, id: string, x: number, y: number) {
  g.cards[id] = { id, name: 'Makeshift Barricade', owner: 0 } as any
  g.artifacts[id] = { id, cardId: id, name: 'Makeshift Barricade', conjuredBy: 0, x, y, region: 'surface', carriedBy: null, tapped: false, counters: {} } as any
}

describe('damage prevention phase (rulebook order)', () => {
  // "A damage of 0 doesn't need to be prevented" → with two Makeshift Barricades sheltering an ally,
  // the first prevents all the damage, so the second never absorbs and only ONE breaks.
  it('two Makeshift Barricades → only one breaks (the second sees 0 damage)', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    barricade(g, 'b1', 2, 2)
    barricade(g, 'b2', 2, 2)
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 2); ally.enteredTurn = -1

    dealDamageToUnit(g, g.units[ally.id], 3, 1, { source: { player: 1, kind: 'effect' } })
    checkStateBased(g)

    expect(g.units[ally.id].damage, 'the ally takes no damage').toBe(0)
    expect(Object.values(g.artifacts).filter((a) => a.name === 'Makeshift Barricade').length,
      'exactly one Barricade broke').toBe(1)
  })

  // Prevention resolves AFTER modification: a ×2 modifier (Doomsday Prophet) applies first, THEN a
  // static reducer (Shield Maidens −1) — so a 2-damage hit near both becomes 2×2=4, then −1 = 3.
  it('modification (×2) resolves before prevention (−1)', () => {
    const g: GameState = newGame(); keepBoth(g)
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 2)
    // Doomsday Prophet (enemy) near the victim doubles the non-strike damage; Shield Maidens (ally) −1
    const prophet = summonCard(g, 1, 'Doomsday Prophet', 1, 2); prophet.enteredTurn = -1
    const maidens = summonCard(g, 0, 'Shield Maidens', 3, 2); maidens.enteredTurn = -1
    const victim = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); victim.enteredTurn = -1 // 6 def, survives

    dealDamageToUnit(g, g.units[victim.id], 2, 1, { source: { player: 1, kind: 'ability' } })
    expect(g.units[victim.id].damage, '2 → ×2 = 4 → −1 = 3').toBe(3)
  })

  // With ≥2 distinct prevention sources (a Ward AND a Makeshift Barricade), the owner is prompted to
  // CHOOSE THE ORDER — and that choice decides WHICH is spent (the other is left untouched at 0 damage).
  function wardedUnderBarricade(order: number[]) {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const av = g.units[g.players[0].avatarUnitId]; av.x = 2; av.y = 2; av.ward = true
    barricade(g, 'b1', 2, 2)
    dealDamageToUnit(g, av, 3, 1, { source: { player: 1, kind: 'effect' } })
    const p = g.prompts[0]
    expect(p?.kind, 'the owner is asked to order their prevention').toBe('orderCards')
    expect(p.player).toBe(0)
    answer(g, order) // mine = [Makeshift Barricade (idx 0), Ward (idx 1)]
    return g
  }

  it('choosing the Barricade first spends it and SAVES the ward', () => {
    const g = wardedUnderBarricade([0, 1])
    expect(g.units[g.players[0].avatarUnitId].ward, 'ward untouched').toBe(true)
    expect(Object.values(g.artifacts).some((a) => a.name === 'Makeshift Barricade'), 'the Barricade broke').toBe(false)
  })

  it('choosing the Ward first breaks it and SAVES the Barricade', () => {
    const g = wardedUnderBarricade([1, 0])
    expect(g.units[g.players[0].avatarUnitId].ward ?? false, 'ward broken').toBe(false)
    expect(Object.values(g.artifacts).some((a) => a.name === 'Makeshift Barricade'), 'the Barricade survived').toBe(true)
  })

  // Prevention only protects its OWNER's units — an ENEMY struck next to your Barricade must NOT pop a
  // (pointless) "order your prevention" prompt for you (the bug: a defender's counterstrike did exactly
  // that, offering the attacker's Barricade + Helmet that can't touch the enemy).
  it('an enemy taking damage does not trigger the owner\'s prevention prompt', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    barricade(g, 'b1', 2, 2) // p0's Barricade
    const enemy = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); enemy.enteredTurn = -1 // p1 unit, survives 1 dmg

    dealDamageToUnit(g, g.units[enemy.id], 1, 0, { source: { player: 0, kind: 'strike', attackerId: 'x' } })

    expect(g.prompts.some((p) => p.kind === 'orderCards'), 'no prevention prompt for the enemy hit').toBe(false)
    expect(g.units[enemy.id].damage, 'the enemy takes its damage (the Barricade cannot shelter it)').toBe(1)
    expect(g.artifacts['b1'], 'the Barricade is untouched').toBeTruthy()
  })
})
