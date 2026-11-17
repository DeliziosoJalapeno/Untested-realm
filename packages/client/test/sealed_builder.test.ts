// The computer's Sealed deck builder (also behind "Suggest a build" in sealed practice).
import { describe, it, expect } from 'vitest'
import { generateSealedPool, isPackCard, buildSealedDeck, validateSealedDeck, findCard, cardSupport, sealedRating, createGame, applyAction, SEALED_BOT_SITES, SEALED_BOT_SPELLS, type PlayerId } from '@sorcery/shared'
import { botAction, botNeedsToAct } from '../src/bot'

const EDITIONS = ['Alpha', 'Beta', 'Arthurian Legends', 'Gothic', 'Random'] as const
const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0)

describe('boosters', () => {
  it('never contain tokens (Skeleton, Frog, Foot Soldier, Bruin, Tawny, Rubble), but do contain X-cost spells', () => {
    const seen = new Set<string>()
    for (const ed of EDITIONS) for (let seed = 0; seed < 150; seed++) for (const n of Object.keys(generateSealedPool(ed, 6, seed))) seen.add(n)
    for (const n of seen) {
      expect(isPackCard(findCard(n)!), n).toBe(true)
      expect(/^(Skeleton|Frog( \(\w+\))?|Foot Soldiers?( \d| \(\w+\))?|Rubble|Bruin|Tawny|Lance)$/.test(n), n).toBe(false)
    }
    for (const x of ['Arcane Barrage', 'Assorted Animals', 'Twist of Fate']) expect(isPackCard(findCard(x)!), x).toBe(true)
    expect(seen.has('Assorted Animals') || seen.has('Twist of Fate') || seen.has('Arcane Barrage')).toBe(true)
  })
})

describe('sealed deck builder', () => {
  it('builds a legal 24-spell, 15-site deck from any pool, using only cards it opened', () => {
    for (const ed of EDITIONS) for (let seed = 1; seed <= 8; seed++) {
      const pool = generateSealedPool(ed, 6, seed * 131)
      const { deck } = buildSealedDeck(pool)
      expect(validateSealedDeck(deck, pool).filter((p) => p.level === 'error')).toEqual([])
      expect(total(deck.spellbook)).toBe(SEALED_BOT_SPELLS)
      expect(total(deck.atlas)).toBe(SEALED_BOT_SITES)
      expect(deck.avatar).toBe('Spellslinger')
      for (const name of Object.keys(deck.spellbook)) expect(cardSupport(findCard(name)!)).not.toBe('unsupported')
    }
  })

  it('stays in at most two elements and gives every element it uses enough sites', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const pool = generateSealedPool('Gothic', 6, seed * 977)
      const { deck, elements } = buildSealedDeck(pool)
      expect(elements.length).toBeLessThanOrEqual(2)
      const sources: Record<string, number> = {}
      for (const [site, n] of Object.entries(deck.atlas)) for (const [e, v] of Object.entries(findCard(site)!.thresholds)) if (v > 0) sources[e] = (sources[e] ?? 0) + n
      for (const [name] of Object.entries(deck.spellbook)) for (const [e, v] of Object.entries(findCard(name)!.thresholds)) {
        if (v > 0) { expect(elements).toContain(e); expect(sources[e] ?? 0).toBeGreaterThanOrEqual(Math.max(4, v + 2)) }
      }
    }
  })

  it('is mostly minions with cheap plays, and the same pool always gives the same deck', () => {
    const pool = generateSealedPool('Beta', 6, 4242)
    const a = buildSealedDeck(pool), b = buildSealedDeck({ ...pool })
    expect(a.deck).toEqual(b.deck)
    const cards = Object.entries(a.deck.spellbook).flatMap(([n, c]) => Array(c).fill(findCard(n)!))
    expect(cards.filter((c) => c.type === 'Minion').length).toBeGreaterThanOrEqual(13)
    expect(cards.filter((c) => (c.cost ?? 0) <= 2).length).toBeGreaterThanOrEqual(5)
    expect(cards.filter((c) => (c.cost ?? 0) >= 6).length).toBeLessThanOrEqual(4)
    expect(a.notes.length).toBe(3)
  })

  it('rates an efficient body above an overpriced one and removal above a situational spell', () => {
    const card = (o: object) => ({ name: 'Test', type: 'Minion', rarity: 'Ordinary', cost: 3, attack: 3, defence: 3, life: null, elements: [], subtypes: [], thresholds: { air: 0, earth: 0, fire: 0, water: 0 }, text: '', sets: [], img: null, ...o }) as any
    expect(sealedRating(card({ cost: 3, attack: 3 }))).toBeGreaterThan(sealedRating(card({ cost: 5, attack: 2 })))
    expect(sealedRating(card({ type: 'Magic', attack: null, text: 'Deal 3 damage to target unit.' }))).toBeGreaterThan(sealedRating(card({ type: 'Magic', attack: null, text: 'Draw a spell.' })))
  })

  it('makes decks the computer can play a whole game with', () => {
    const d0 = buildSealedDeck(generateSealedPool('Gothic', 6, 11)).deck, d1 = buildSealedDeck(generateSealedPool('Arthurian Legends', 6, 12)).deck
    const g = createGame([d0, d1], ['A', 'B'], 5, 0)
    let n = 0
    while (g.winner === null && g.phase !== 'over' && n++ < 5000) {
      const s = ([0, 1] as PlayerId[]).find((x) => botNeedsToAct(g, x))
      if (s === undefined) break
      expect(applyAction(g, s, botAction(g, s)).ok).toBe(true)
    }
    expect(g.winner).not.toBeNull()
  }, 60_000)
})
