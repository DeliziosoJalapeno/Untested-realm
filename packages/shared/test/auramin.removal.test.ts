// The animated aura MINION and its aura are ONE object: when the minion leaves the realm by ANY means
// — death, Bury/flood off the surface, banish/exile — the aura must be destroyed WITH it. This is done
// centrally in removeUnitFromRealm, so it fires even when the Enchantress that animated it is NO LONGER
// in play (there is deliberately no Enchantress in these fixtures — that was the case the old
// Enchantress-only onAnyDeath listener silently missed, leaving a ghost aura behind, e.g. a Bury on an
// animated The Great Drowning of Men that "still hasn't flooded anything").
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { checkStateBased, killUnit, banishUnit, removeUnitFromRealm } from '../src/engine/effects'

/** an animated aura minion (Enchantress-style) with NO Enchantress in play. */
function animatedAura(g: any) {
  const cardId = `caura${g.nextId++}`
  g.cards[cardId] = { id: cardId, name: 'The Great Drowning of Men', owner: 0 }
  const auraId = `raura${g.nextId++}`
  g.auras[auraId] = { id: auraId, cardId, name: 'The Great Drowning of Men', controller: 0, squares: [{ x: 2, y: 1 }], enteredTurn: 0 }
  const unitId = `uaura${g.nextId++}`
  g.units[unitId] = {
    id: unitId, cardId, name: 'The Great Drowning of Men', owner: 0, controller: 0, isAvatar: false,
    x: 2, y: 1, region: 'surface', tapped: false, damage: 0, enteredTurn: 0,
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {}, counters: { animatedAura: auraId },
  }
  return { cardId, auraId, unitId }
}

describe('animated aura minion removal drops its aura (no Enchantress needed)', () => {
  it('Bury (taken off the surface) kills the minion AND removes the aura', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const { auraId, unitId } = animatedAura(g)
    g.units[unitId].region = 'underground' // Bury put it below the surface
    checkStateBased(g)
    expect(g.units[unitId], 'the buried aura minion perishes').toBeFalsy()
    expect(g.auras[auraId], 'its aura is gone with it').toBeFalsy()
  })

  it('dying (killUnit) removes the aura', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const { auraId, unitId } = animatedAura(g)
    killUnit(g, unitId)
    expect(g.units[unitId]).toBeFalsy()
    expect(g.auras[auraId], 'the aura died with the minion').toBeFalsy()
  })

  it('banish removes the aura', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const { auraId, unitId } = animatedAura(g)
    banishUnit(g, unitId)
    expect(g.units[unitId]).toBeFalsy()
    expect(g.auras[auraId], 'the aura is banished with the minion').toBeFalsy()
  })

  it('a plain (non-animated) removal never touches auras', () => {
    const g: any = newGame(); keepBoth(g)
    const { auraId } = animatedAura(g)
    // a DIFFERENT unit leaving must not disturb the aura
    const other = `uo${g.nextId++}`
    g.units[other] = { id: other, cardId: `co${g.nextId++}`, name: 'Foot Soldier', owner: 0, controller: 0, isAvatar: false, x: 0, y: 0, region: 'surface', tapped: false, damage: 0, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {}, counters: {} }
    removeUnitFromRealm(g, other)
    expect(g.auras[auraId], 'an unrelated removal leaves the aura alone').toBeTruthy()
  })
})
