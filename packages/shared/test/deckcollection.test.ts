import { describe, it, expect } from 'vitest'
import { deckToText, parseDeckText, createGame, type DeckList } from '../src'

const deck: DeckList = {
  name: 'Toolbox',
  avatar: 'Avatar of Fire',
  spellbook: { 'Foot Soldier': 2, 'Vile Imp': 1 },
  atlas: { 'Spire': 2 },
  collection: { 'Excalibur': 1, 'Onyx Core': 2, 'Pathfinder': 1 }, // avatars allowed in the collection
}

describe("deck collection (the sideboard 'from your collection' fetches)", () => {
  it('round-trips through deckToText → parseDeckText', () => {
    const text = deckToText(deck)
    expect(text).toMatch(/# Collection/)
    const back = parseDeckText(deck.name, text)
    expect(back.collection).toEqual(deck.collection) // incl. the avatar 'Pathfinder'
    expect(back.spellbook).toEqual(deck.spellbook)
    expect(back.atlas).toEqual(deck.atlas)
    expect(back.avatar).toBe('Avatar of Fire') // deck avatar unaffected by a collection avatar
  })

  it('loads the deck collection into player.collection at game start', () => {
    const other: DeckList = { name: 'B', avatar: 'Avatar of Fire', spellbook: { 'Foot Soldier': 60 }, atlas: { 'Spire': 30 } }
    const g = createGame([deck, other], ['A', 'B'], 7, 0)
    expect(g.players[0].collection).toEqual(deck.collection)
  })
})
