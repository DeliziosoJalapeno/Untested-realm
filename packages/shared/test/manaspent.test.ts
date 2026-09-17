// The remaining/total mana widget needs the engine to record mana SPENT this turn
// (total = remaining + spent). bumpManaSpent accumulates it, viewFor exposes it per
// player, and finishBeginTurn resets it each turn.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, waiveThreshold, castMagic } from './helpers'
import { viewFor, bumpManaSpent } from '../src'

describe('mana spent this turn (remaining/total widget)', () => {
  it('bumpManaSpent accumulates and viewFor exposes it (total = remaining + spent)', () => {
    const g = newGame(); keepBoth(g)
    g.players[0].mana = 3
    bumpManaSpent(g, 0, 2)
    bumpManaSpent(g, 0, 1)
    bumpManaSpent(g, 0, 0) // no-ops
    bumpManaSpent(g, 0, -5) // no-ops
    expect(g.flow!.manaSpent[0]).toBe(3)
    const v = viewFor(g, 0)
    expect((v.players[0] as any).manaSpent, 'view carries manaSpent').toBe(3)
    expect(v.players[0].mana + (v.players[0] as any).manaSpent, 'total this turn').toBe(6)
    expect((v.players[1] as any).manaSpent, 'other player untouched').toBe(0)
  })

  it('actually casting a spell records the mana it cost', () => {
    const g = newGame(); keepBoth(g)
    waiveThreshold(g, 0) // any element castable
    g.flow!.manaSpent = { 0: 0, 1: 0 }
    // Onslaught is a cheap, targetless combat magic in the starter pool
    castMagic(g, 0, 'Onslaught')
    expect(g.flow!.manaSpent[0], 'the cast recorded a positive spend').toBeGreaterThan(0)
  })
})
