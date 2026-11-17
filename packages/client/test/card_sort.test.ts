// Sorting the card pool by mana cost and by element.
import { describe, it, expect } from 'vitest'
import { findCard, generateSealedPool, type CardDef } from '@sorcery/shared'
import { compareCards, elementRank } from '../src/cardSort'

const pool = (): CardDef[] => [...Object.keys(generateSealedPool('Beta', 6, 99)), 'Spellslinger', 'Spire'].map((n) => findCard(n)!)

describe('card sorting', () => {
  it('by mana cost: cheapest spell first, sites and Avatars after every spell', () => {
    const s = pool().sort(compareCards('cost'))
    const spells = s.filter((c) => c.type !== 'Site' && c.type !== 'Avatar')
    expect(s.slice(0, spells.length)).toEqual(spells)
    const costs = spells.map((c) => c.cost ?? 99)
    expect(costs).toEqual([...costs].sort((a, b) => a - b))
    expect(s[s.length - 1].type).toBe('Avatar')
  })
  it('by element: Air, Earth, Fire, Water, then mixed, then none; and by cost inside each', () => {
    const s = pool().sort(compareCards('element-cost'))
    const ranks = s.map(elementRank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    for (let r = 0; r <= 5; r++) {
      const costs = s.filter((c) => elementRank(c) === r && c.type !== 'Site' && c.type !== 'Avatar').map((c) => c.cost ?? 99)
      expect(costs).toEqual([...costs].sort((a, b) => a - b))
    }
    expect(pool().sort(compareCards('element')).map(elementRank)).toEqual(ranks)
  })
  it('by name is alphabetical', () => {
    const names = pool().sort(compareCards('name')).map((c) => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})
