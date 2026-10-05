// Caster-locked cards (Morgana's own 3 spells, an Omphalos's element spells) sit in your hand but only
// their caster may cast them — they're not a free part of your hand. So a generic "discard a card"
// (Troll Bridge's toll, Sisters of Avalon's discard-a-spell, a random discard, …) must never offer them.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx, discardableHandIds, isCasterLocked, type GameState, type Region } from '../src'
import '../src/cards/scripts/index'

/** put a card in a player's hand, locked to `casterId` (as Morgana/Omphalos do). Returns its id. */
function lockInHand(g: GameState, player: 0 | 1, name: string, casterId: string): string {
  const id = `clk${(g as any).nextId++}`
  g.cards[id] = { id, name, owner: player } as any
  g.players[player].hand.push(id)
  g.flow = g.flow ?? {}
  ;(g.flow as any).lockedCards = [...((g.flow as any).lockedCards ?? []), { cardId: id, casterId, casterName: 'Morgana le Fay', grantsCasting: false }]
  return id
}
function plainInHand(g: GameState, player: 0 | 1, name: string): string {
  const id = `cpl${(g as any).nextId++}`
  g.cards[id] = { id, name, owner: player } as any
  g.players[player].hand.push(id)
  return id
}

describe('discard effects skip caster-locked cards', () => {
  it('discardableHandIds / isCasterLocked exclude a locked card', () => {
    const g = newGame() as GameState; keepBoth(g)
    g.players[0].hand = []
    const normal = plainInHand(g, 0, 'Fireball')
    const morgana = summonCard(g, 0, 'Morgana le Fay', 2, 1)
    const locked = lockInHand(g, 0, 'Lightning Bolt', morgana.id)

    expect(isCasterLocked(g, locked)).toBe(true)
    expect(isCasterLocked(g, normal)).toBe(false)
    const pool = discardableHandIds(g, 0)
    expect(pool).toContain(normal)
    expect(pool).not.toContain(locked)
  })

  it("Troll Bridge's toll offers the normal card but never the locked one", () => {
    const g = newGame() as GameState; keepBoth(g)
    g.players[0].hand = []
    plainInHand(g, 0, 'Fireball')
    const morgana = summonCard(g, 0, 'Morgana le Fay', 3, 3)
    lockInHand(g, 0, 'Lightning Bolt', morgana.id)
    const bridge = placeSite(g, 1, 'Troll Bridge', 2, 1) // an ENEMY bridge (controller 1)
    const mover = summonCard(g, 0, 'Common Cottagers', 2, 1) // a lone enemy that just entered the bridge

    getScript('Troll Bridge')!.onUnitEntersSquare!(makeCtx(g, bridge.id, 1, []), mover, { x: 2, y: 0, region: 'surface' as Region })

    const prompt = g.prompts.find((p) => p.kind === 'chooseCards')
    expect(prompt, 'the toll prompt is raised').toBeTruthy()
    expect(prompt!.data!.cards).toContain('Fireball')
    expect(prompt!.data!.cards, "Morgana's locked spell is not a valid toll").not.toContain('Lightning Bolt')
  })

  it("Sisters of Avalon's discard-a-spell never offers a locked spell", () => {
    const g = newGame() as GameState; keepBoth(g)
    g.players[0].hand = []
    plainInHand(g, 0, 'Fireball')
    const sisters = summonCard(g, 0, 'Sisters of Avalon', 2, 1)
    const morgana = summonCard(g, 0, 'Morgana le Fay', 3, 1)
    lockInHand(g, 0, 'Lightning Bolt', morgana.id)

    getScript('Sisters of Avalon')!.genesis!(makeCtx(g, sisters.id, 0, []))

    const prompt = g.prompts.find((p) => p.kind === 'chooseCards')
    expect(prompt, 'the discard prompt is raised').toBeTruthy()
    expect(prompt!.data!.cards).toContain('Fireball')
    expect(prompt!.data!.cards).not.toContain('Lightning Bolt')
  })
})
