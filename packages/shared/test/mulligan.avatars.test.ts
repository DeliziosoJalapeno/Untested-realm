// Mulligan must always preserve the opening hand size, for EVERY avatar's deck rules.
// The Magician keeps its sites in the spellbook and has no drawable atlas (noAtlasDraw); the old
// mulligan sent a returned site to the atlas and redrew from it — a no-op — shrinking the hand to 6.
import { describe, it, expect } from 'vitest'
import { createGame, starterDecks, applyAction, getCard, type DeckList, type GameState } from '../src'
import '../src/cards/scripts/index'

const deckWith = (avatar: string, spellbook: Record<string, number>, atlas: Record<string, number>): DeckList =>
  ({ avatar, spellbook, atlas } as any)
const siteIdsIn = (g: GameState, p: 0 | 1) => g.players[p].hand.filter((id) => getCard(g.cards[id].name).type === 'Site')
const spellIdsIn = (g: GameState, p: 0 | 1) => g.players[p].hand.filter((id) => getCard(g.cards[id].name).type !== 'Site')

describe('mulligan preserves the opening hand size for every avatar', () => {
  it('Magician: mulliganing a site keeps 7 cards (sites live in the spellbook, no atlas)', () => {
    // an all-Sites spellbook so the opening 7 (all drawn from the spellbook) are sites to mulligan
    const magician = deckWith('Magician', { Spire: 20 }, {})
    const g = createGame([magician, starterDecks[1]], ['Mage', 'Bob'], 42, 0)
    expect(g.players[0].hand.length, 'Magician opens with 7').toBe(7)
    const sites = siteIdsIn(g, 0)
    expect(sites.length, 'all seven are sites').toBe(7)

    expect(applyAction(g, 0, { t: 'mulligan', back: [sites[0]] } as any).ok).toBe(true)
    expect(g.players[0].hand.length, 'still 7 after mulliganing a site').toBe(7)
    // the returned site went back to the SPELLBOOK (not the undrawable atlas)
    expect(g.players[0].atlas.length, 'atlas stays empty').toBe(0)
  })

  it('Magician: mulliganing all three still keeps 7', () => {
    const g = createGame([deckWith('Magician', { Spire: 20 }, {}), starterDecks[1]], ['Mage', 'Bob'], 7, 0)
    const back = g.players[0].hand.slice(0, 3)
    expect(applyAction(g, 0, { t: 'mulligan', back } as any).ok).toBe(true)
    expect(g.players[0].hand.length).toBe(7)
  })

  it('Spellslinger: opens with 7 (3 sites + 4 spells) and mulligan preserves it', () => {
    const deck = deckWith('Spellslinger', { 'Bone Jumble': 20 }, { Spire: 20 })
    const g = createGame([deck, starterDecks[1]], ['Slinger', 'Bob'], 3, 0)
    expect(g.players[0].hand.length, 'Spellslinger opens with 7').toBe(7)
    // mulligan a site and a spell together → still 7
    const back = [siteIdsIn(g, 0)[0], spellIdsIn(g, 0)[0]]
    expect(applyAction(g, 0, { t: 'mulligan', back } as any).ok).toBe(true)
    expect(g.players[0].hand.length, 'still 7').toBe(7)
  })

  it('Duplicator: opens with 4 (2 sites + 2 spells) and mulligan preserves it', () => {
    const deck = deckWith('Duplicator', { 'Bone Jumble': 20 }, { Spire: 20 })
    const g = createGame([deck, starterDecks[1]], ['Dupe', 'Bob'], 5, 0)
    expect(g.players[0].hand.length, 'Duplicator opens with 4').toBe(4)
    const back = [siteIdsIn(g, 0)[0]]
    expect(applyAction(g, 0, { t: 'mulligan', back } as any).ok).toBe(true)
    expect(g.players[0].hand.length, 'still 4').toBe(4)
  })
})
