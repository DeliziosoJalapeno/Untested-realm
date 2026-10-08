// "Rubble is Ordinary": a destroyed site has lost its identity, so every rarity-gated effect must read
// it as an Ordinary site — not the destroyed card's printed rarity (Castle Haunt / Castle's & Hamlet's
// Ablaze / Heirloom Lost). The canonical source of truth is siteRarity().
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { siteRarity, getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('rubble is an Ordinary site', () => {
  it('siteRarity: a destroyed Elite site reads as Ordinary', () => {
    const g = newGame() as GameState; keepBoth(g)
    const site = placeSite(g, 0, 'Battlefield', 2, 2) // Elite site
    expect(siteRarity(g, site), 'intact it keeps its printed rarity').toBe('Elite')
    site.isRubble = true
    expect(siteRarity(g, site), 'as rubble it is Ordinary').toBe('Ordinary')
  })

  it("Castle Haunt can haunt an Elite enemy site but not once it's rubble", () => {
    const g = newGame() as GameState; keepBoth(g)
    const site = placeSite(g, 1, 'Battlefield', 2, 2) // ENEMY Elite site
    const filter = getScript('Castle Haunt')!.summonFilter!
    expect(filter(g, 0, { x: 2, y: 2 }), 'an Elite enemy site is a legal haunt').toBeNull()
    site.isRubble = true
    expect(typeof filter(g, 0, { x: 2, y: 2 }), 'rubble is Ordinary → not a legal haunt').toBe('string')
  })

  it("Hamlet's Ablaze may be placed atop rubble (it reads as Ordinary)", () => {
    const g = newGame() as GameState; keepBoth(g)
    const site = placeSite(g, 0, 'Battlefield', 2, 2) // Elite — not a legal Hamlet's Ablaze target intact
    const place = getScript("Hamlet's Ablaze!")!.auraPlacement!
    expect(typeof place(g, 0, { x: 2, y: 2 }, undefined as any), 'an Elite site is not Ordinary/Exceptional').toBe('string')
    site.isRubble = true
    expect(place(g, 0, { x: 2, y: 2 }, undefined as any), 'rubble reads Ordinary → legal').toBeNull()
  })
})
