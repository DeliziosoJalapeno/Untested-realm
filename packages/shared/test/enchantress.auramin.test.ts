// Enchantress animates an aura into a minion (unit.counters.animatedAura = aura.id; the minion
// SHARES the aura's cardId). Two rulings:
//   1. Dispelling the aura immediately kills the minion (it has no enchantment left to embody),
//      and the shared card reaches the cemetery exactly once (not twice).
//   2. If an opponent takes control of the minion, they control the AURA it settles back into.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { checkStateBased, makeCtx, getScript } from '../src'

function animatedAura(g: any, controller: 0 | 1 = 0) {
  const cardId = `caura${g.nextId++}`
  g.cards[cardId] = { id: cardId, name: 'Crusade', owner: 0 }
  const auraId = `raura${g.nextId++}`
  g.auras[auraId] = { id: auraId, cardId, name: 'Crusade', controller: 0, squares: [{ x: 2, y: 1 }], enteredTurn: 0 }
  const unitId = `uaura${g.nextId++}`
  g.units[unitId] = {
    id: unitId, cardId, name: 'Crusade', owner: 0, controller, isAvatar: false,
    x: 2, y: 1, region: 'surface', tapped: false, damage: 0, enteredTurn: 0,
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {}, counters: { animatedAura: auraId },
  }
  return { cardId, auraId, unitId }
}

describe('Enchantress animated aura minion', () => {
  it('is killed the moment its aura is dispelled — card to the cemetery exactly once', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 1) // a site so it isn't killed for standing over a void
    const caster = summonCard(g, 0, 'Foot Soldier', 2, 0) // Dispel needs a caster within 2 steps
    const { cardId, auraId, unitId } = animatedAura(g)

    getScript('Dispel')!.onCast!(makeCtx(g, caster.id, 0, [{ square: { x: 2, y: 1, region: 'surface' } }] as any))

    expect(g.units[unitId], 'the animated minion died with its aura').toBeFalsy()
    expect(g.auras[auraId], 'the aura is gone').toBeFalsy()
    expect(g.players[0].cemetery.filter((id: string) => id === cardId).length, 'the shared card lands once').toBe(1)
  })

  it('an opponent who controls the minion controls the aura it settles back into', () => {
    const g: any = newGame(); keepBoth(g)
    const { auraId, unitId } = animatedAura(g, 1) // opponent (seat 1) has taken control of the minion
    g.flow = g.flow ?? {}
    g.flow.auraAnimations = [{ unitId, player: 0, turn: 0 }] // animated by seat 0 on turn 0
    g.turn = 1 // a later turn → the animation ends at seat 0's start of turn

    getScript('Enchantress')!.startOfTurn!(makeCtx(g, unitId, 0, []))

    expect(g.units[unitId], 'the minion settled back into an aura').toBeFalsy()
    expect(g.auras[auraId], 'the aura persists').toBeTruthy()
    expect(g.auras[auraId].controller, 'the opponent now controls it').toBe(1)
  })
})
