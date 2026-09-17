// parseKeywords must only harvest a card's INNATE keywords — the leading run of keyword tokens on each
// line — and NOT keyword words that merely appear inside prose (e.g. Ribble Boggart's mutation list).
import { describe, it, expect } from 'vitest'
import { parseKeywords } from '../src/cards/db'

const kw = (text: string) => parseKeywords(text).keywords

describe('parseKeywords leading-keyword rule', () => {
  it('does NOT harvest keyword words listed inside a prose sentence (Ribble Boggart)', () => {
    const k = kw('At the start of your turn, Boggart gains a random mutation until the end of turn: Airborne, Ranged, Lethal, or +3 power.')
    expect(k.ranged).toBeUndefined()
    expect(k.lethal).toBeUndefined()
    expect(k.airborne).toBeUndefined()
  })

  it('harvests keywords printed on their own line after prose (Sewer Rats)', () => {
    const k = kw('May be cast under any site.\n\nBurrowing, Submerge')
    expect(k.burrowing).toBe(true)
    expect(k.submerge).toBe(true)
  })

  it('harvests a leading keyword before prose on the same line (Hellstar)', () => {
    expect(kw("Airborne, can't attack or defend. At the start of your turn, each other unit takes damage:").airborne).toBe(true)
  })

  it('harvests a leading run and stops at the first prose token (Tawny)', () => {
    const k = kw("Airborne, Spellcaster, Can't defend")
    expect(k.airborne).toBe(true)
    expect(k.spellcaster).toBe(true)
  })

  it('ignores keywords only granted conditionally / to allies (Spire Lich, Onslaught)', () => {
    expect(kw('If Spire Lich is atop a Tower, it has +2 power, Ranged, and Spellcaster.').ranged).toBeUndefined()
    expect(kw("This turn, allies gain +1 power, Charge, and can't be immobilized, silenced, or disabled.").charge).toBeUndefined()
  })

  it('still fully-parses keyword-only cards', () => {
    const r = parseKeywords('Airborne, Voidwalk')
    expect(r.fullyParsed).toBe(true)
    expect(r.keywords.airborne).toBe(true)
    expect(r.keywords.voidwalk).toBe(true)
  })
})
