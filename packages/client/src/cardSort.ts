// Sorting cards in the deck-building screens: by name, by mana cost, by element ("colour"), or by
// element and then cost.
import type { CardDef } from '@sorcery/shared'

export type CardSort = 'name' | 'cost' | 'element' | 'element-cost'
export const CARD_SORTS: { value: CardSort; label: string }[] = [
  { value: 'name', label: 'sort: name' },
  { value: 'cost', label: 'sort: mana cost' },
  { value: 'element', label: 'sort: element' },
  { value: 'element-cost', label: 'sort: element, then cost' },
]

const ELEMENT_ORDER = ['air', 'earth', 'fire', 'water']
/** 0-3 one element (Air, Earth, Fire, Water), 4 more than one, 5 none */
export function elementRank(c: CardDef): number {
  const els = c.elements.map((e) => e.toLowerCase()).filter((e) => ELEMENT_ORDER.includes(e))
  if (els.length === 0) return 5
  if (els.length > 1) return 4
  return ELEMENT_ORDER.indexOf(els[0])
}
/** spells before sites and Avatars (which have no cost); an X spell (no fixed cost) after the numbers */
const costRank = (c: CardDef): number => (c.type === 'Avatar' ? 2000 : c.type === 'Site' ? 1000 : c.cost == null ? 99 : c.cost)

export function compareCards(sort: CardSort): (a: CardDef, b: CardDef) => number {
  const name = (a: CardDef, b: CardDef) => a.name.localeCompare(b.name)
  const cost = (a: CardDef, b: CardDef) => costRank(a) - costRank(b)
  const element = (a: CardDef, b: CardDef) => elementRank(a) - elementRank(b)
  // within a cost or an element: minions before other spells, so like sits with like
  const kind = (a: CardDef, b: CardDef) => Number(a.type !== 'Minion') - Number(b.type !== 'Minion')
  switch (sort) {
    case 'cost': return (a, b) => cost(a, b) || element(a, b) || kind(a, b) || name(a, b)
    case 'element': return (a, b) => element(a, b) || name(a, b)
    case 'element-cost': return (a, b) => element(a, b) || cost(a, b) || kind(a, b) || name(a, b)
    default: return name
  }
}

const KEY = 'deckbuild:sort'
export function loadCardSort(): CardSort {
  try { const v = localStorage.getItem(KEY); if (CARD_SORTS.some((s) => s.value === v)) return v as CardSort } catch { /* private mode */ }
  return 'name'
}
export function saveCardSort(v: CardSort): void { try { localStorage.setItem(KEY, v) } catch { /* private mode */ } }
