// Enchantress FAQ3 compliance: animating an opponent's aura gives the aura minion
// to the OPPONENT (the aura's owner/controller), not to the Enchantress player.
//   FAQ2: timing — animation happens before the spell resolves (not tested here; engine handles timing)
//   FAQ3: "Your opponent still controls the aura minion."
//   FAQ4: aura minion size = aura size, not changed (verified: uses aura.squares / aura.edge / 2x2)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { makeCtx, getScript } from '../src'

function setupOpponentAura(g: any) {
  // An aura belonging to player 1 (the opponent)
  const cardId = `caura${g.nextId++}`
  g.cards[cardId] = { id: cardId, name: 'Crusade', owner: 1 }
  const auraId = `raura${g.nextId++}`
  g.auras[auraId] = {
    id: auraId, cardId, name: 'Crusade', controller: 1,
    squares: [{ x: 2, y: 1 }], enteredTurn: 0,
  }
  return { cardId, auraId }
}

function setupOwnAura(g: any) {
  // An aura belonging to player 0 (the Enchantress player)
  const cardId = `caura${g.nextId++}`
  g.cards[cardId] = { id: cardId, name: 'Crusade', owner: 0 }
  const auraId = `raura${g.nextId++}`
  g.auras[auraId] = {
    id: auraId, cardId, name: 'Crusade', controller: 0,
    squares: [{ x: 2, y: 2 }], enteredTurn: 0,
  }
  return { cardId, auraId }
}

describe('Enchantress FAQ3 — opponent aura minion controller', () => {
  it('animating an opponent aura produces a minion controlled by the opponent (FAQ3)', () => {
    const g: any = newGame(); keepBoth(g)
    const { auraId } = setupOpponentAura(g)

    // Enchantress player (0) animates the opponent's aura
    const ctx = makeCtx(g, g.players[0].avatarUnitId, 0, [])
    getScript('Enchantress')!.conts!.animate(ctx, {}, auraId)

    // A new unit should have been created
    const units = Object.values(g.units as Record<string, any>).filter(
      (u: any) => u.counters?.animatedAura === auraId,
    )
    expect(units.length, 'exactly one animated minion created').toBe(1)
    const minion = units[0] as any
    expect(minion.controller, 'aura minion must be controlled by the aura owner (opponent = 1)').toBe(1)
  })

  it('animating own aura produces a minion controlled by the Enchantress player', () => {
    const g: any = newGame(); keepBoth(g)
    const { auraId } = setupOwnAura(g)

    const ctx = makeCtx(g, g.players[0].avatarUnitId, 0, [])
    getScript('Enchantress')!.conts!.animate(ctx, {}, auraId)

    const units = Object.values(g.units as Record<string, any>).filter(
      (u: any) => u.counters?.animatedAura === auraId,
    )
    expect(units.length).toBe(1)
    const minion = units[0] as any
    expect(minion.controller, 'own aura minion controlled by Enchantress player (0)').toBe(0)
  })

  it('FAQ4: animated minion size matches the aura area (single-square aura stays 1x1)', () => {
    const g: any = newGame(); keepBoth(g)
    const { auraId } = setupOpponentAura(g)

    const ctx = makeCtx(g, g.players[0].avatarUnitId, 0, [])
    getScript('Enchantress')!.conts!.animate(ctx, {}, auraId)

    const minion: any = Object.values(g.units as Record<string, any>).find(
      (u: any) => u.counters?.animatedAura === auraId,
    )
    expect(minion.size, 'single-square aura stays 1x1 (no size property)').toBeUndefined()
    expect(minion.extraSquares, 'no extra squares for single-square aura').toBeUndefined()
    expect(minion.x).toBe(2)
    expect(minion.y).toBe(1)
  })

  it('startOfTurn cleanup: animated opponent aura settles back as opponent-controlled aura', () => {
    const g: any = newGame(); keepBoth(g)
    const { auraId } = setupOpponentAura(g)

    // Pre-create the animated minion as player 1 controller (as the fix now produces)
    const cardId = g.auras[auraId].cardId
    const unitId = `uanim${g.nextId++}`
    g.units[unitId] = {
      id: unitId, cardId, name: 'Crusade', owner: 1, controller: 1,
      isAvatar: false, x: 2, y: 1, region: 'surface', tapped: false, damage: 0,
      enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      counters: { animatedAura: auraId },
    }
    g.flow = g.flow ?? {}
    g.flow.auraAnimations = [{ unitId, player: 0, turn: 0 }]
    g.turn = 1

    getScript('Enchantress')!.startOfTurn!(makeCtx(g, unitId, 0, []))

    expect(g.units[unitId], 'minion settled back').toBeFalsy()
    expect(g.auras[auraId], 'aura persists').toBeTruthy()
    expect(g.auras[auraId].controller, 'aura still under opponent control').toBe(1)
  })
})
