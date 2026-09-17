// Vivien the Enchantress becomes a Spellcaster from ANY realm Spellcaster — including a minion that
// GAINED the keyword (permanently or temporarily), not only a printed one — and loses it when that
// source stops being a Spellcaster. (Card: "abilities of all Avatars and Spellcasters in the realm".)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { effKeywords } from '../src/engine/statics'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

function vivien(g: GameState) {
  // Vivien is a MINION (not an avatar) — avatars get Spellcaster inherently, which would mask the
  // conditional-Spellcaster behaviour we're testing.
  return summonCard(g, 0, 'Vivien the Enchantress', 2, 2)
}

describe('Vivien gains Spellcaster from a minion that GAINED the keyword', () => {
  it('a permanently-granted Spellcaster minion makes Vivien a Spellcaster; removing it un-makes her', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2); placeSite(g, 0, 'Rustic Village', 3, 3)
    const v = vivien(g)
    const beast = summonCard(g, 0, 'Bone Jumble', 3, 3) // a vanilla minion, no printed Spellcaster
    expect(effKeywords(g, v).spellcaster, 'no Spellcaster in the realm yet → Vivien is not one').toBeFalsy()

    beast.modifiers.push({ kind: 'keyword', keyword: 'spellcaster', duration: 'permanent', turn: g.turn, sourcePlayer: 0 } as any)
    expect(effKeywords(g, v).spellcaster, 'a GAINED Spellcaster minion makes Vivien a Spellcaster').toBe(true)

    beast.modifiers = []
    expect(effKeywords(g, v).spellcaster, 'she loses it the moment that source stops being a Spellcaster').toBeFalsy()
  })

  it('a TEMPORARY (this-turn) grant works the same while it lasts', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2); placeSite(g, 0, 'Rustic Village', 3, 3)
    const v = vivien(g)
    const beast = summonCard(g, 0, 'Bone Jumble', 3, 3)
    beast.modifiers.push({ kind: 'keyword', keyword: 'spellcaster', duration: 'untilYourNextTurn', turn: g.turn, sourcePlayer: 0 } as any)
    expect(effKeywords(g, v).spellcaster, 'a temporary grant counts while active').toBe(true)
  })

  it('an element-locked granted Spellcaster passes its element restriction on to Vivien', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2); placeSite(g, 0, 'Rustic Village', 3, 3)
    const v = vivien(g)
    const beast = summonCard(g, 0, 'Bone Jumble', 3, 3)
    // grant a Fire-locked spellcaster identity
    beast.modifiers.push({ kind: 'keyword', keyword: 'spellcaster:fire', duration: 'permanent', turn: g.turn, sourcePlayer: 0 } as any)
    const kw = effKeywords(g, v)
    expect(kw.spellcaster, 'Vivien is a Spellcaster').toBe(true)
    expect(kw.spellcasterElements ?? (kw.spellcasterElement ? [kw.spellcasterElement] : []), 'restricted to Fire').toContain('fire')
  })
})
