import { describe, it, expect } from 'vitest'
import { extractSorceryDeckId, sorceryToDeck, printingsFor } from '../src'

describe('printings manifest includes curios', () => {
  it('a curio-only card offers its default art + a Curio printing', () => {
    const arts = printingsFor('Belfry')
    expect(arts.length, 'Belfry has a choice').toBeGreaterThan(1)
    expect(arts.some((a) => a.default), 'a default art is marked').toBe(true)
    const curio = arts.find((a) => a.set === 'Curio')
    expect(curio, 'a Curio printing is offered').toBeTruthy()
    expect(curio!.slug.startsWith('curio-'), 'curio slug').toBe(true)
  })
})

describe('sorcerytcg import: extractSorceryDeckId', () => {
  it('accepts full links, extra path/query, and bare ids', () => {
    expect(extractSorceryDeckId('https://sorcerytcg.com/decks/cmth77ie200010aklx7dp5y25')).toBe('cmth77ie200010aklx7dp5y25')
    expect(extractSorceryDeckId('https://sorcerytcg.com/decks/cmth77ie200010aklx7dp5y25/a-slug?x=1')).toBe('cmth77ie200010aklx7dp5y25')
    expect(extractSorceryDeckId('  cmth77ie200010aklx7dp5y25  ')).toBe('cmth77ie200010aklx7dp5y25')
  })
  it('does NOT claim curiosa.io links (those route to the legacy importer) or junk', () => {
    expect(extractSorceryDeckId('https://curiosa.io/decks/cmropvdo900h304lb2dgrxvec')).toBeNull()
    expect(extractSorceryDeckId('https://example.com/foo')).toBeNull()
    expect(extractSorceryDeckId('')).toBeNull()
  })
})

describe('sorcerytcg import: sorceryToDeck', () => {
  // shape of api.sorcerytcg.com/api/decks/<id>: pre-bucketed avatar / spellbook / atlas / sideboard,
  // each entry { identifier, name, quantity, metadata:{ type } }
  const raw = {
    name: 'Test Deck',
    visibility: 'Public',
    avatar: [{ identifier: 'interrogator', name: 'Interrogator', quantity: 1, metadata: { type: 'Avatar' } }],
    spellbook: [
      { identifier: 'giant_shark', name: 'Giant Shark', quantity: 3, metadata: { type: 'Minion' } },
      { identifier: 'drown', name: 'Drown', quantity: 2, metadata: { type: 'Magic' } },
    ],
    atlas: [
      { identifier: 'floodplain', name: 'Floodplain', quantity: 4, metadata: { type: 'Site' } },
      { identifier: 'croaking_swamp', name: 'Croaking Swamp', quantity: 3, metadata: { type: 'Site' } },
    ],
    sideboard: [{ identifier: 'anshui_undine', name: 'AnShui Undine', quantity: 1, metadata: { type: 'Minion' } }],
  }

  it('maps avatar/spellbook/atlas/sideboard onto the DeckList', () => {
    const d = sorceryToDeck(raw)
    expect(d.name).toBe('Test Deck')
    expect(d.avatar).toBe('Interrogator')
    expect(d.spellbook).toEqual({ 'Giant Shark': 3, Drown: 2 })
    expect(d.atlas).toEqual({ Floodplain: 4, 'Croaking Swamp': 3 })
    expect(d.collection).toEqual({ 'AnShui Undine': 1 })
  })

  it('re-classifies by card type when metadata is missing, and uses the fallback name', () => {
    // a site that the API happened to place in the spellbook array still lands in the atlas
    const d = sorceryToDeck({ spellbook: [{ name: 'Floodplain', quantity: 1 }] }, 'Fallback')
    expect(d.name).toBe('Fallback')
    expect(d.atlas.Floodplain).toBe(1)
    expect(d.spellbook).toEqual({})
    expect(d.avatar).toBe('')
  })

  it("captures each card's alternative art from its printing src (default art → no override)", () => {
    const cdn = 'https://d27a44hjr9gen3.cloudfront.net/cards'
    const d = sorceryToDeck({
      name: 'Arty',
      spellbook: [
        // Amazon Warriors in its Promo art → recorded as an override
        { name: 'Amazon Warriors', quantity: 1, src: `${cdn}/999-amazon_warriors-ai-f.png` },
        // a card in its DEFAULT (Beta) art → NO override
        { name: 'Giant Shark', quantity: 1, src: `${cdn}/002-giant_shark-b-s.png` },
      ],
    })
    expect(d.art?.['Amazon Warriors']).toBe('999-amazon_warriors-ai-f')
    expect(d.art?.['Giant Shark']).toBeUndefined()
  })
})
