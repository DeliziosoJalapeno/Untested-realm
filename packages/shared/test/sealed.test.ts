import { describe, it, expect } from 'vitest'
import {
  generateSealedPool,
  generateBooster,
  mulberry32,
  validateSealedDeck,
  autofillSealedDeck,
  MIN_SEALED_SPELLBOOK,
  MIN_SEALED_ATLAS,
  SEALED_SUPPLIED_AVATAR,
  SEALED_SUPPLIED_SITES,
  findCard,
  type DeckList,
} from '../src'

const count = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0)

describe('sealed booster / pool generation', () => {
  it('a booster is ~15 cards, all from the chosen edition', () => {
    const pack = generateBooster('Beta', mulberry32(1))
    expect(pack.length).toBeGreaterThanOrEqual(14)
    expect(pack.length).toBeLessThanOrEqual(15)
    for (const name of pack) {
      const def = findCard(name)!
      expect(def, name).toBeTruthy()
      expect(def.sets).toContain('Beta')
    }
  })

  it('boosters DO contain Avatars of the edition (rare slot, treated as Elite)', () => {
    const pool = generateSealedPool('Beta', 200, 31337)
    const avatars = Object.keys(pool).filter((n) => findCard(n)!.type === 'Avatar')
    expect(avatars.length, 'avatars appear across many packs').toBeGreaterThan(0)
    for (const a of avatars) expect(findCard(a)!.sets).toContain('Beta')
  })

  it('a pool is deterministic in its seed (same seed → same pool)', () => {
    const a = generateSealedPool('Beta', 6, 12345)
    const b = generateSealedPool('Beta', 6, 12345)
    const c = generateSealedPool('Beta', 6, 999)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c) // overwhelmingly likely to differ
    expect(count(a)).toBe(count(b))
    // 6 packs → roughly 6×15 cards
    expect(count(a)).toBeGreaterThanOrEqual(6 * 14)
  })

  it("'Random' mixes editions across packs", () => {
    const pool = generateSealedPool('Random', 8, 42)
    const sets = new Set<string>()
    for (const name of Object.keys(pool)) for (const s of findCard(name)!.sets) sets.add(s)
    expect(sets.size).toBeGreaterThan(1)
  })
})

describe('validateSealedDeck', () => {
  // a helper pool with plenty of a real Beta common to fill a spellbook
  function poolWith(name: string, n: number): Record<string, number> {
    return { [name]: n }
  }

  it('accepts the supplied Spellslinger + unlimited basic Sites even with an empty pool', () => {
    const spellName = 'Bone Jumble' // a real minion
    const deck: DeckList = {
      name: 'x', avatar: SEALED_SUPPLIED_AVATAR,
      spellbook: { [spellName]: MIN_SEALED_SPELLBOOK },
      atlas: { [SEALED_SUPPLIED_SITES[0]]: MIN_SEALED_ATLAS },
    }
    const pool = poolWith(spellName, MIN_SEALED_SPELLBOOK) // the spells are opened; sites are supplied
    const problems = validateSealedDeck(deck, pool).filter((p) => p.level === 'error')
    expect(problems, JSON.stringify(problems)).toHaveLength(0)
  })

  it('rejects using more copies than you opened, and under-minimum decks', () => {
    const spellName = 'Bone Jumble'
    const deck: DeckList = {
      name: 'x', avatar: SEALED_SUPPLIED_AVATAR,
      spellbook: { [spellName]: 5 },      // only opened 2 → over pool + under 24
      atlas: { [SEALED_SUPPLIED_SITES[0]]: 3 }, // under 12
    }
    const errs = validateSealedDeck(deck, poolWith(spellName, 2)).map((p) => p.msg)
    expect(errs.some((m) => m.includes('you only opened 2'))).toBe(true)
    expect(errs.some((m) => m.includes(`minimum is ${MIN_SEALED_SPELLBOOK}`))).toBe(true)
    expect(errs.some((m) => m.includes(`minimum is ${MIN_SEALED_ATLAS}`))).toBe(true)
  })

  it('has NO rarity constraint (many copies of a Unique are fine if opened)', () => {
    const uni = 'Plague of Frogs' // a Unique magic
    expect(findCard(uni)!.rarity).toBe('Unique')
    const deck: DeckList = {
      name: 'x', avatar: SEALED_SUPPLIED_AVATAR,
      spellbook: { [uni]: MIN_SEALED_SPELLBOOK },
      atlas: { [SEALED_SUPPLIED_SITES[1]]: MIN_SEALED_ATLAS },
    }
    const errs = validateSealedDeck(deck, { [uni]: MIN_SEALED_SPELLBOOK }).filter((p) => p.level === 'error')
    expect(errs, JSON.stringify(errs)).toHaveLength(0)
  })
})

describe('autofillSealedDeck (deckbuild-timer expiry)', () => {
  it('brings an empty deck up to legal minimums from the pool + supplied sites', () => {
    // a realistic pool: 6 Beta packs
    const pool = generateSealedPool('Beta', 6, 777)
    const empty: DeckList = { name: 'auto', avatar: '', spellbook: {}, atlas: {} }
    const filled = autofillSealedDeck(empty, pool)

    expect(filled.avatar).toBe(SEALED_SUPPLIED_AVATAR) // defaulted
    expect(count(filled.spellbook)).toBeGreaterThanOrEqual(MIN_SEALED_SPELLBOOK)
    expect(count(filled.atlas)).toBeGreaterThanOrEqual(MIN_SEALED_ATLAS)
    // the auto-filled deck is legal against the same pool
    const errs = validateSealedDeck(filled, pool).filter((p) => p.level === 'error')
    expect(errs, JSON.stringify(errs)).toHaveLength(0)
    // leftovers became the collection, and nothing is over-used
    for (const [name, n] of Object.entries(filled.collection ?? {})) {
      expect(n).toBeGreaterThan(0)
      expect((filled.spellbook[name] ?? 0) + (filled.atlas[name] ?? 0) + n).toBeLessThanOrEqual(pool[name])
    }
  })

  it('keeps the player\'s existing picks and only tops up the rest', () => {
    const pool = generateSealedPool('Gothic', 6, 55)
    const someSpell = Object.keys(pool).find((n) => {
      const t = findCard(n)!.type
      return t !== 'Site' && t !== 'Avatar'
    })!
    const partial: DeckList = { name: 'p', avatar: SEALED_SUPPLIED_AVATAR, spellbook: { [someSpell]: 1 }, atlas: {} }
    const filled = autofillSealedDeck(partial, pool)
    expect(filled.spellbook[someSpell]).toBeGreaterThanOrEqual(1) // preserved
    expect(count(filled.spellbook)).toBeGreaterThanOrEqual(MIN_SEALED_SPELLBOOK)
    expect(count(filled.atlas)).toBeGreaterThanOrEqual(MIN_SEALED_ATLAS)
  })
})
