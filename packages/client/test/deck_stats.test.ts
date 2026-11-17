// The numbers behind the deck-building statistics panel.
import { describe, it, expect } from 'vitest'
import { findCard, generateSealedPool, buildSealedDeck } from '@sorcery/shared'
import { deckStats } from '../src/components/DeckStats'

describe('deck statistics', () => {
  it('counts the curve by minion and other, the card types, and thresholds needed against provided', () => {
    const { deck } = buildSealedDeck(generateSealedPool('Beta', 6, 4242))
    const s = deckStats(deck)
    const cards = Object.entries(deck.spellbook).flatMap(([n, c]) => Array(c).fill(findCard(n)!))
    expect(s.spells).toBe(24)
    expect(s.sites).toBe(15)
    expect(s.minions.reduce((a, b) => a + b, 0)).toBe(cards.filter((c) => c.type === 'Minion').length)
    expect(s.minions.reduce((a, b) => a + b, 0) + s.others.reduce((a, b) => a + b, 0)).toBe(24)
    expect(s.types.Minion + s.types.Magic + s.types.Aura + s.types.Artifact).toBe(24)
    expect(s.avgCost).toBeCloseTo(cards.reduce((n, c) => n + (c.cost ?? 0), 0) / 24, 6)
    for (const e of ['air', 'earth', 'fire', 'water'] as const) {
      expect(s.need[e].peak).toBe(Math.max(0, ...cards.map((c) => c.thresholds[e] ?? 0)))
      expect(s.need[e].spells).toBe(cards.filter((c) => (c.thresholds[e] ?? 0) > 0).length)
      expect(s.need[e].by.reduce((a, b) => a + b, 0)).toBe(s.need[e].spells)
      if (s.need[e].spells) expect(s.need[e].sites).toBeGreaterThanOrEqual(s.need[e].peak + 2) // the builder's own rule
    }
  })
  it('counts basic sites as one threshold each and an empty deck as nothing', () => {
    const s = deckStats({ name: 'x', avatar: 'Spellslinger', spellbook: {}, atlas: { Spire: 3, Stream: 2 } })
    expect(s.need.air.sites).toBe(3)
    expect(s.need.water.sites).toBe(2)
    expect(s.spells).toBe(0)
    expect(deckStats({ name: 'x', avatar: '', spellbook: {}, atlas: {} }).sites).toBe(0)
  })
})
