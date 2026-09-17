import { describe, it, expect } from 'vitest'
import { extractCuriosaDeckId, curiosaToDeck } from '../src'

describe('curiosa import: extractCuriosaDeckId', () => {
  it('accepts full links, bare ids, extra path/query — rejects junk', () => {
    expect(extractCuriosaDeckId('https://curiosa.io/decks/cmropvdo900h304lb2dgrxvec')).toBe('cmropvdo900h304lb2dgrxvec')
    expect(extractCuriosaDeckId('https://curiosa.io/decks/cmropvdo900h304lb2dgrxvec/some-slug?x=1')).toBe('cmropvdo900h304lb2dgrxvec')
    expect(extractCuriosaDeckId('  cmropvdo900h304lb2dgrxvec  ')).toBe('cmropvdo900h304lb2dgrxvec')
    expect(extractCuriosaDeckId('https://example.com/foo')).toBeNull()
    expect(extractCuriosaDeckId('')).toBeNull()
  })
})

describe('curiosa import: curiosaToDeck', () => {
  const raw = {
    name: 'Test Deck',
    avatar: { quantity: 1, card: { name: 'Interrogator', type: 'Avatar' } },
    decklist: [
      { quantity: 3, card: { name: 'Giant Shark', type: 'Minion' } },
      { quantity: 4, card: { name: 'Floodplain', type: 'Site' } },
      { quantity: 2, card: { name: 'Drown', type: 'Magic' } },
      { quantity: 3, card: { name: 'Croaking Swamp', type: 'Site' } },
    ],
    sideboard: [{ quantity: 1, card: { name: 'AnShui Undine', type: 'Minion' } }],
  }

  it('splits sites to atlas and everything else to spellbook, sets avatar, maps sideboard to collection', () => {
    const d = curiosaToDeck(raw)
    expect(d.name).toBe('Test Deck')
    expect(d.avatar).toBe('Interrogator')
    expect(d.spellbook).toEqual({ 'Giant Shark': 3, Drown: 2 })
    expect(d.atlas).toEqual({ Floodplain: 4, 'Croaking Swamp': 3 })
    expect(d.collection).toEqual({ 'AnShui Undine': 1 })
  })

  it('falls back on card type lookup when the payload omits type, and uses fallback name', () => {
    const d = curiosaToDeck({ decklist: [{ quantity: 1, card: { name: 'Floodplain' } }] }, 'Fallback')
    expect(d.name).toBe('Fallback')
    expect(d.atlas.Floodplain).toBe(1) // Floodplain resolved to a Site via findCard
    expect(d.avatar).toBe('')
  })
})
