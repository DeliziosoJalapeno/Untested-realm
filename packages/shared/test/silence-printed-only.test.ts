// Oct 2026 rules: Silence removes only a card's own PRINTED keyword abilities (and spellcasting). It
// does NOT remove keywords the unit gains from OTHER sources (carried artifacts, auras/sites, effect
// grants). Codex: a silenced Pudge Butcher keeps Immobile from Entangle Terrain but loses its printed one.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { effKeywords } from '../src'

describe('Silence is printed-only', () => {
  it('removes a card\'s own PRINTED keyword when silenced', () => {
    const g = newGame(); keepBoth(g)
    const imp = summonCard(g, 0, 'Pith Imp', 2, 2) // prints Airborne
    expect(effKeywords(g, imp).airborne, 'has printed Airborne').toBe(true)
    imp.silenced = true
    expect(effKeywords(g, imp).airborne, 'printed Airborne removed by silence').toBeFalsy()
  })

  it('KEEPS an externally-granted keyword through silence', () => {
    const g = newGame(); keepBoth(g)
    const fs = summonCard(g, 0, 'Foot Soldier', 3, 2) // vanilla, no printed Airborne
    fs.silenced = true
    expect(effKeywords(g, fs).airborne, 'no grant yet').toBeFalsy()
    // an external effect grants Airborne (a modifier is how effects/auras confer keywords)
    fs.modifiers.push({ kind: 'keyword', keyword: 'airborne', duration: 'permanent', turn: g.turn, sourcePlayer: 0 } as any)
    expect(effKeywords(g, fs).airborne, 'external grant persists despite silence').toBe(true)
  })
})
