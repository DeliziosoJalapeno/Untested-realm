// Order of the White Wing: "If a minion would be summoned nearby and it wasn't cast from hand, banish it."
// FAQ: "Does this prevent minions from being cast from other 'hand' zones (e.g. Morgana le Fay, or an
// Omphalos)? Yes. The Order prevents minions from being summoned from anywhere except directly from a
// player's hand." A card an Omphalos or Morgana holds sits in the engine's hand array under a lock, so a
// plain "was it in the hand" check let it through.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveMana, waiveThreshold, placeSite, summonCard, injectToHand } from './helpers'
import { castSpell, makeCtx, type GameState } from '../src'
import { omphalosEndOfTurn } from '../src/cards/scripts/multi-card-utils/omphalos-end-of-turn'
import '../src/cards/scripts/index'

const onBoard = (g: GameState, name: string) => Object.values(g.units).some((u) => u.name === name)

function board() {
  const g = newGame() as GameState; keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
  placeSite(g, 0, 'Arid Desert', 2, 1)
  placeSite(g, 1, 'Arid Desert', 2, 2)
  summonCard(g, 1, 'Order of the White Wing', 2, 2) // the enemy Order guards (2,1)
  return g
}

describe('Order of the White Wing turns away minions cast from a held "hand"', () => {
  it("an Omphalos's minion cast nearby is banished", () => {
    const g = board()
    const artCard = `co${g.nextId++}`
    g.cards[artCard] = { id: artCard, name: 'Char Omphalos', owner: 0 }
    const artId = `ao${g.nextId++}`
    g.artifacts[artId] = { id: artId, cardId: artCard, name: 'Char Omphalos', conjuredBy: 0, x: 2, y: 1, region: 'surface', tapped: false } as any
    const minion = `cm${g.nextId++}`
    g.cards[minion] = { id: minion, name: 'Hellhounds', owner: 0 }
    g.players[0].spellbook.unshift(minion)
    omphalosEndOfTurn(makeCtx(g, artId, 0, []), 'Char Omphalos')
    expect(castSpell(g, 0, minion, artId, { x: 2, y: 1, region: 'surface' })).toBeNull()
    expect(onBoard(g, 'Hellhounds'), 'turned away').toBe(false)
    expect(g.players[0].banished).toContain(minion)
  })

  it("a minion Morgana le Fay holds, cast nearby, is banished", () => {
    const g = board()
    const morgana = summonCard(g, 0, 'Morgana le Fay', 2, 1); morgana.enteredTurn = -1
    const minion = injectToHand(g, 0, 'Bone Jumble')
    g.flow = g.flow ?? {}
    g.flow.lockedCards = [{ cardId: minion, casterId: morgana.id, casterName: 'Morgana le Fay', grantsCasting: false }]
    expect(castSpell(g, 0, minion, morgana.id, { x: 2, y: 1, region: 'surface' })).toBeNull()
    expect(onBoard(g, 'Bone Jumble')).toBe(false)
    expect(g.players[0].banished).toContain(minion)
  })

  it('control: the same minion cast from your own hand enters', () => {
    const g = board()
    const minion = injectToHand(g, 0, 'Bone Jumble')
    const av = Object.values(g.units).find((u) => u.isAvatar && u.controller === 0)!
    av.x = 2; av.y = 1
    expect(castSpell(g, 0, minion, av.id, { x: 2, y: 1, region: 'surface' })).toBeNull()
    expect(onBoard(g, 'Bone Jumble')).toBe(true)
  })
})
