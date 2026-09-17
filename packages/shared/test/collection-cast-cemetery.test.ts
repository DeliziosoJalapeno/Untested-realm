// Generic fix: a card cast FOR REAL from a collection/spellbook (Silver Bullet, Toolbox, the Malleus,
// Troubled Town, Doomsday Cult…) is a REAL card, so a Minion/Artifact/Aura that dies must go to the
// CEMETERY — not vanish like a token. Only free copies (Chaoswish) and Magic (consumed after resolving)
// stay tokens. This is enforced in effectCastSpell (isToken iff free || Magic).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, waiveThreshold } from './helpers'
import { effectCastSpell, checkStateBased, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('cards cast for real from a collection/spellbook are real cards', () => {
  it('a paid (non-free) minion cast is a real card that dies to the cemetery', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    g.players[0].mana = 20
    waiveThreshold(g, 0)

    effectCastSpell(g, 0, 'Bone Jumble', { free: false, at: { x: 2, y: 2 } })
    const bj = Object.values(g.units).find((u) => u.name === 'Bone Jumble' && u.controller === 0)!
    expect(bj, 'the minion was cast').toBeTruthy()
    expect(g.cards[bj.cardId]?.isToken ?? false, 'a paid cast is NOT a token').toBe(false)

    const cid = bj.cardId
    bj.damage = 99
    checkStateBased(g)
    expect(g.units[bj.id], 'the minion died').toBeUndefined()
    expect(g.players[0].cemetery.includes(cid), 'it went to the cemetery, not vanished').toBe(true)
  })

  it('a FREE copy stays a token and vanishes on death (Chaoswish semantics)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)

    effectCastSpell(g, 0, 'Bone Jumble', { free: true, at: { x: 2, y: 2 } })
    const bj = Object.values(g.units).find((u) => u.name === 'Bone Jumble' && u.controller === 0)!
    expect(g.cards[bj.cardId]?.isToken, 'a free copy IS a token').toBe(true)

    const cid = bj.cardId
    bj.damage = 99
    checkStateBased(g)
    expect(g.units[bj.id], 'the token minion died').toBeUndefined()
    expect(g.players[0].cemetery.includes(cid), 'a token does NOT land in the cemetery').toBe(false)
  })
})
