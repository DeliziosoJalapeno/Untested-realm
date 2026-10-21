// Bureau of Occult Control: "Players must pay (2) to access a collection or cemetery." FAQ: the (2) is paid
// once and grants the ENTIRE effect access. So (a) a cast from the collection must afford the spell AND
// the toll before paying anything, and (b) an effect whose cost already carried the toll (a cemetery-
// activated ability) is not charged again while it resolves.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, act, settlePrompts } from './helpers'
import { castFromCollection, markZoneTollPaid, payZoneToll, type GameState } from '../src'
import '../src/cards/scripts/index'

function setup(): GameState {
  const g = newGame(); keepBoth(g)
  placeSite(g, 0, 'Bureau of Occult Control', 0, 0)
  placeSite(g, 0, 'Rustic Village', 2, 2)
  return g
}

describe('collection cast + Bureau toll', () => {
  it('with mana for the spell but not the toll, nothing is paid and nothing leaves the collection', () => {
    const g = setup()
    g.players[0].collection = { Shoggoth: 1 }
    g.players[0].mana = 6 // Shoggoth costs 6; the toll would need 8
    g.flow.noThreshold = { 0: g.turn }
    expect(castFromCollection(g, 0, 'Shoggoth', { x: 2, y: 2 })).toBe(false)
    expect(g.players[0].mana).toBe(6)
    expect(g.players[0].collection.Shoggoth).toBe(1)
  })
})

describe('a prepaid toll covers the whole effect', () => {
  it('payZoneToll is free for the player who prepaid, until the action settles', () => {
    const g = setup()
    g.players[0].mana = 5
    markZoneTollPaid(g, 0)
    expect(payZoneToll(g, 0)).toBe(true)
    expect(g.players[0].mana, 'not charged again').toBe(5)
    g.players[1].mana = 5
    expect(payZoneToll(g, 1)).toBe(true)
    expect(g.players[1].mana, 'the other player still pays').toBe(3)
    // any settled action ends the effect → the next access pays again
    act(g, 0, { t: 'endTurn' })
    settlePrompts(g) // the new turn's draw prompt — the mark lasts until nothing is left to resolve
    expect(g.flow.zoneTollPaid).toBeUndefined()
  })
})
