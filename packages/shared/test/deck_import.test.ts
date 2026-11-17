// Importing a deck from text: the plain format, and lists pasted from a chat (tables, bold headings,
// set and rarity after the name, several decks in one paste).
import { describe, it, expect } from 'vitest'
import { parseDeckText, deckToText, validateDeck, featuredDecks } from '../src'

describe('deck import', () => {
  it('round-trips the plain export format', () => {
    for (const d of featuredDecks.slice(0, 4)) {
      const back = parseDeckText(d.name, deckToText(d))
      expect(back.avatar).toBe(d.avatar)
      expect(back.spellbook).toEqual(d.spellbook)
      expect(back.atlas).toEqual(d.atlas)
      expect(back.collection ?? {}).toEqual(d.collection ?? {})
    }
  })

  it('reads a list pasted from a chat: tables with set and rarity, bold headings, an Avatar line', () => {
    const text = `## Lavamancer Earth

Avatar: Lavamancer. 60 spells, 30 sites. "FvL" marks cards from the new release.

**Minions (5)**
| Qty | Card | Set | Rarity |
|---|---|---|---|
| 4 | Bosk Troll | Alpha/Beta | Ordinary |
| 1 | Sister Stefánia | Gothic | Unique |

**Magic (10) and Artifacts (4)**
| Qty | Card | Set | Rarity |
|---|---|---|---|
| 2 | Earthquake | Alpha/Beta/FvL | Elite |
| 3 | Toolbox | Gothic/FvL | Exceptional |

**Atlas (30)**
| Qty | Site | Set | Rarity |
|---|---|---|---|
| 4 | Spike Trap | FvL (new) | Ordinary |
| 2 | Trapper's Rest | FvL (new) | Exceptional |

**Collection (10, for Toolbox)**
| Qty | Card | Set | Rarity |
|---|---|---|---|
| 1 | Hamlet's Ablaze! | Arthurian/FvL | Ordinary |
| 2 | Hellhounds | Gothic/FvL | Ordinary |`
    const d = parseDeckText('x', text)
    expect(d.avatar).toBe('Lavamancer')
    expect(d.spellbook).toEqual({ 'Bosk Troll': 4, 'Sister Stefánia': 1, Earthquake: 2, Toolbox: 3 })
    expect(d.atlas).toEqual({ 'Spike Trap': 4, "Trapper's Rest": 2 })
    expect(d.collection).toEqual({ "Hamlet's Ablaze!": 1, Hellhounds: 2 })
  })

  it('reads other common shapes: "3x Name", "Name (Set, Rarity)", "Name - Rarity", tab-separated', () => {
    const d = parseDeckText('x', ['Avatar', 'Frost Mage', 'Spellbook', '3x Frostbolt (FvL, Exceptional)', '2 Aria Wraith - Elite', '3\tShatter\tFvL\tExceptional', '1 Màzuj Ifrit', 'Sites', '2 Tundra | FvL (new) | Elite'].join('\n'))
    expect(d.avatar).toBe('Frost Mage')
    expect(d.spellbook).toEqual({ Frostbolt: 3, 'Aria Wraith': 2, Shatter: 3, 'Màzuj Ifrit': 1 })
    expect(d.atlas).toEqual({ Tundra: 2 })
  })

  it('takes the first deck of a multi-deck paste', () => {
    const [a, b] = featuredDecks
    const d = parseDeckText('x', `===== ${a.name} =====\n${deckToText(a)}\n\n===== ${b.name} =====\n${deckToText(b)}\n`)
    expect(d.avatar).toBe(a.avatar)
    expect(d.spellbook).toEqual(a.spellbook)
    expect(d.atlas).toEqual(a.atlas)
    expect(validateDeck(d).filter((p) => p.level === 'error')).toEqual([])
  })
})
