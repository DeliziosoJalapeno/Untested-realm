// The Thinking bot is handed the FULL game state, so it must reason only on a fair copy: no deck order
// beyond what its player has seen, none of the opponent's unseen cards (hand, decks, a face-down trap's
// true identity) — but everything it HAS seen kept (cards revealed from hand, known deck tops/bottoms,
// Doomsday Cult's public tops). And the fair copy must still be recognised as the same position as
// reality, or plan replay and tree reuse would never match.
import { describe, it, expect } from 'vitest'
import { createGame, starterDecks, getCard, noteKnownCards, revealHand, cloneState, drawCards, type GameState, type PlayerId } from '@sorcery/shared'
import { fairView, fairSignature } from '../src/bot_search'

const BOT: PlayerId = 1
const FOE: PlayerId = 0

function game(): GameState {
  const g = createGame([starterDecks[4], starterDecks[12]], [starterDecks[4].name, starterDecks[12].name], 7, 0)
  g.phase = 'main'
  return g
}
const nameIn = (s: GameState, id: string) => s.cards[id].name
const isSite = (s: GameState, id: string) => getCard(s.cards[id].name).type === 'Site'

describe('the bot plays on a fair copy of the game', () => {
  it("hides the opponent's hand and decks behind stand-ins that keep the card back", () => {
    const g = game()
    const v = fairView(g, BOT)
    const foe = g.players[FOE]
    expect(foe.hand.length).toBeGreaterThan(0)
    for (const id of [...foe.hand, ...foe.spellbook, ...foe.atlas]) {
      expect(isSite(v, id), `${nameIn(g, id)} keeps its back`).toBe(isSite(g, id))
      expect(['Bosk Troll', 'Spire', 'Valley', 'Wasteland', 'Stream']).toContain(nameIn(v, id))
    }
    // my own hand is mine to see; my decklist is known, only its order is hidden
    for (const id of g.players[BOT].hand) expect(nameIn(v, id)).toBe(nameIn(g, id))
    expect([...v.players[BOT].spellbook].sort()).toEqual([...g.players[BOT].spellbook].sort())
    for (const id of g.players[BOT].spellbook) expect(nameIn(v, id)).toBe(nameIn(g, id))
  })

  it('keeps opponent hand cards that were revealed to it', () => {
    const g = game()
    revealHand(g, FOE, BOT)
    const v = fairView(g, BOT)
    for (const id of g.players[FOE].hand) expect(nameIn(v, id)).toBe(nameIn(g, id))
  })

  it('keeps known deck runs in place and shuffles only the unknown middle', () => {
    const g = game()
    const book = g.players[BOT].spellbook
    const top = book.slice(0, 2)
    const bottom = book.slice(-3)
    noteKnownCards(g, BOT, BOT, 'spellbook', 'top', top)
    noteKnownCards(g, BOT, BOT, 'spellbook', 'bottom', bottom)
    let middleMoved = false
    for (let i = 0; i < 5; i++) {
      const v = fairView(g, BOT)
      expect(v.players[BOT].spellbook.slice(0, 2)).toEqual(top)
      expect(v.players[BOT].spellbook.slice(-3)).toEqual(bottom)
      if (v.players[BOT].spellbook.join() !== book.join()) middleMoved = true
    }
    expect(middleMoved, 'the unseen middle is shuffled').toBe(true)
  })

  it("keeps an opponent's deck top it has seen (named), hides the rest", () => {
    const g = game()
    const seen = g.players[FOE].spellbook[0]
    noteKnownCards(g, 'both', FOE, 'spellbook', 'top', [seen])
    const v = fairView(g, BOT)
    expect(v.players[FOE].spellbook[0]).toBe(seen)
    expect(nameIn(v, seen)).toBe(nameIn(g, seen))
    for (const id of v.players[FOE].spellbook.slice(1)) expect(nameIn(v, id)).toBe('Bosk Troll')
    // the opponent draws it: the bot still knows that card, now in their hand
    drawCards(g, FOE, 'spellbook')
    expect(g.players[FOE].hand).toContain(seen)
    expect(nameIn(fairView(g, BOT), seen)).toBe(nameIn(g, seen))
  })

  it('a face-down trap shows only its disguise and cannot be sprung in the search', () => {
    const g = game()
    const site = Object.values(g.sites)[0] ?? null
    const sid = site?.id ?? 'sTrap'
    g.sites[sid] = { ...(site ?? { id: sid, cardId: g.players[FOE].atlas[0], x: 2, y: 2, tapped: false, isRubble: false }), owner: FOE, controller: FOE, name: 'Valley', trap: { element: 'earth', realName: 'Bottomless Pit', realCardId: g.players[FOE].atlas[1] } } as any
    g.cards[g.sites[sid].cardId] = { ...g.cards[g.sites[sid].cardId], name: 'Bottomless Pit' }
    const v = fairView(g, BOT)
    expect(v.sites[sid].trap).toEqual({ element: 'earth' })
    expect(nameIn(v, g.sites[sid].cardId)).toBe('Valley')
  })

  it("can't foresee random outcomes: the copy gets a fresh RNG seed", () => {
    const g = game()
    const seeds = new Set([0, 1, 2, 3].map(() => fairView(g, BOT).seed))
    expect(seeds.has(g.seed)).toBe(false)
    expect(seeds.size).toBeGreaterThan(1)
  })

  it("drops the opponent's own knowledge records (they can name cards of the bot's deck)", () => {
    const g = game()
    noteKnownCards(g, FOE, BOT, 'spellbook', 'top', [g.players[BOT].spellbook[0]])
    noteKnownCards(g, BOT, BOT, 'atlas', 'top', [g.players[BOT].atlas[0]])
    expect(Object.keys(fairView(g, BOT).flow.knownDeck)).toEqual([`${BOT}:${BOT}:atlas:top`])
  })

  it('a peek mid-turn makes reality a different position (a plan made without it is not replayed)', () => {
    const g = game()
    const before = fairSignature(g, BOT)
    noteKnownCards(g, BOT, BOT, 'spellbook', 'top', [g.players[BOT].spellbook[0]])
    expect(fairSignature(g, BOT)).not.toBe(before)
  })

  it('is recognised as the same position as reality (plan replay / tree reuse still match)', () => {
    const g = game()
    noteKnownCards(g, BOT, BOT, 'atlas', 'top', [g.players[BOT].atlas[0]])
    expect(fairSignature(fairView(g, BOT), BOT)).toBe(fairSignature(g, BOT))
    // …but a real difference the bot CAN see (its own hand) still tells them apart
    const h = cloneState(g)
    h.players[BOT].hand.pop()
    expect(fairSignature(h, BOT)).not.toBe(fairSignature(g, BOT))
  })
})
