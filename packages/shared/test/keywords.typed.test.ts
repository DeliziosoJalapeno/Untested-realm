// Keyword grants are typed data (engine/keywords.ts): nothing parses keyword text during play. Old saved
// scenarios / replays still hold strings — those are converted once where they're loaded.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { applyGrant, legacyKeyword, migrateLegacyKeywords, toModifierKeyword, keywordLabel, effKeywords, type GameState } from '../src'
import { applyJudge } from '../src/engine/judge'
import type { ParsedKeywords } from '../src/cards/db'
import '../src/cards/scripts/index'

describe('applyGrant', () => {
  it('sets flags and combines parametric grants like the rules do', () => {
    const kw: ParsedKeywords = {}
    applyGrant(kw, 'airborne')
    applyGrant(kw, 'strikeFirst')
    applyGrant(kw, { movement: 2 })
    applyGrant(kw, { movement: -1 }) // movement adds up
    applyGrant(kw, { ranged: 3 })
    applyGrant(kw, { ranged: 1 }) // the best range wins
    expect(kw).toEqual({ airborne: true, strikeFirst: true, movement: 1, ranged: 3 })
  })

  it('spellcaster grants', () => {
    const a: ParsedKeywords = {}; applyGrant(a, { spellcasterElement: 'water' })
    expect(a).toEqual({ spellcaster: true, spellcasterElement: 'water' })
    const b: ParsedKeywords = {}; applyGrant(b, { addSpellcasterElements: ['fire'] }); applyGrant(b, { addSpellcasterElements: ['air', 'fire'] })
    expect(b).toEqual({ spellcaster: true, spellcasterElements: ['fire', 'air'] })
    const c: ParsedKeywords = {}; applyGrant(c, { spellcasterExclude: 'fire' })
    expect(c).toEqual({ spellcaster: true, spellcasterExclude: 'fire' })
  })

  it('status markers grant nothing', () => {
    const kw: ParsedKeywords = {}
    applyGrant(kw, 'disabled'); applyGrant(kw, 'undisableable')
    expect(kw).toEqual({})
  })
})

describe('saved data from before typed keywords', () => {
  it('converts every string the old code produced', () => {
    expect(legacyKeyword('strike first')).toBe('strikeFirst')
    expect(legacyKeyword('Strike First')).toBe('strikeFirst')
    expect(legacyKeyword('movement +7')).toEqual({ movement: 7 })
    expect(legacyKeyword('movement -1')).toEqual({ movement: -1 })
    expect(legacyKeyword('ranged')).toEqual({ ranged: 1 })
    expect(legacyKeyword('ranged 3')).toEqual({ ranged: 3 })
    expect(legacyKeyword('water spellcaster')).toEqual({ spellcasterElement: 'water' })
    expect(legacyKeyword('air and fire spellcaster')).toEqual({ spellcasterElements: ['air', 'fire'] })
    expect(legacyKeyword('non-fire spellcaster')).toEqual({ spellcasterExclude: 'fire' })
    expect(legacyKeyword('spellcaster:air,fire')).toEqual({ addSpellcasterElements: ['air', 'fire'] })
    expect(legacyKeyword('undisableable')).toBe('undisableable')
    expect(legacyKeyword('flying fish')).toBeUndefined()
  })

  it('typed values pass through unchanged (strikeFirst is not mistaken for old text)', () => {
    expect(toModifierKeyword('strikeFirst')).toBe('strikeFirst')
    expect(toModifierKeyword({ movement: 2 })).toEqual({ movement: 2 })
  })

  it("migrates an old scenario's modifiers in place and drops ones that never granted anything", () => {
    const g: GameState = newGame(); keepBoth(g)
    const u = summonCard(g, 0, 'Bone Jumble', 2, 0)
    u.modifiers.push(
      { kind: 'keyword', keyword: 'strike first' as any, duration: 'permanent', turn: 0, sourcePlayer: 0 },
      { kind: 'keyword', keyword: 'movement +2' as any, duration: 'permanent', turn: 0, sourcePlayer: 0 },
      { kind: 'keyword', keyword: 'nonsense' as any, duration: 'permanent', turn: 0, sourcePlayer: 0 },
      { kind: 'power', amount: 1, duration: 'permanent', turn: 0, sourcePlayer: 0 },
    )
    migrateLegacyKeywords(g)
    expect(u.modifiers.map((m) => m.kind === 'keyword' ? m.keyword : 'power')).toEqual(['strikeFirst', { movement: 2 }, 'power'])
    const kw = effKeywords(g, u)
    expect(kw.strikeFirst).toBe(true)
    expect(kw.movement).toBe(2)
  })

  it("an old replay's editor op with a keyword string still applies", () => {
    const g: GameState = newGame(); keepBoth(g)
    const u = summonCard(g, 0, 'Bone Jumble', 2, 0)
    expect(applyJudge(g, 0, { k: 'keyword', unitId: u.id, keyword: 'ranged 2' as any, duration: 'permanent' })).toBeNull()
    expect(effKeywords(g, u).ranged).toBe(2)
    expect(g.log.at(-1)?.msg).toContain(keywordLabel({ ranged: 2 }))
  })
})
