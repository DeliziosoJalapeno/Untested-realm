// "Draw a card" (unlike "draw a spell") lets the drawing player choose their spellbook (top spell)
// OR their atlas (top site) — per card, for each card drawn. Magician/Pathfinder are never offered
// the atlas and just draw spells.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, answer } from './helpers'
import { askDrawCard, makeCtx, type GameState, type PlayerId } from '../src'

function makeMagician(g: GameState, player: PlayerId): void {
  g.units[g.players[player].avatarUnitId].name = 'Magician'
}

describe('"draw a card" offers a spellbook-or-atlas choice', () => {
  it('raises a drawDeck prompt with both decks, and honours the choice', () => {
    const g = newGame(); keepBoth(g)
    const p = g.players[0]
    const spellBefore = p.spellbook.length
    const atlasBefore = p.atlas.length
    const handBefore = p.hand.length

    askDrawCard(g, 0)
    const prompt = g.prompts[0]
    expect(prompt?.kind).toBe('drawDeck')
    expect(prompt?.player).toBe(0)
    expect(prompt?.data?.options).toEqual(['spellbook', 'atlas'])

    // choose the atlas → a SITE is drawn (atlas shrinks, spellbook untouched)
    answer(g, 'atlas')
    expect(g.players[0].hand.length).toBe(handBefore + 1)
    expect(g.players[0].atlas.length).toBe(atlasBefore - 1)
    expect(g.players[0].spellbook.length).toBe(spellBefore)
  })

  it('choosing the spellbook draws a spell instead', () => {
    const g = newGame(); keepBoth(g)
    const atlasBefore = g.players[0].atlas.length
    const spellBefore = g.players[0].spellbook.length
    askDrawCard(g, 0)
    answer(g, 'spellbook')
    expect(g.players[0].spellbook.length).toBe(spellBefore - 1)
    expect(g.players[0].atlas.length).toBe(atlasBefore)
  })

  it('"draw N cards" chains one choice per card (can mix decks)', () => {
    const g = newGame(); keepBoth(g)
    const atlasBefore = g.players[0].atlas.length
    const spellBefore = g.players[0].spellbook.length

    askDrawCard(g, 0, 2)
    expect(g.prompts[0]?.kind).toBe('drawDeck')
    answer(g, 'atlas') // first card: a site
    // the second choice is only queued AFTER the first resolves
    expect(g.prompts[0]?.kind).toBe('drawDeck')
    answer(g, 'spellbook') // second card: a spell
    expect(g.prompts.length).toBe(0)

    expect(g.players[0].atlas.length).toBe(atlasBefore - 1)
    expect(g.players[0].spellbook.length).toBe(spellBefore - 1)
  })

  it('a Magician (noAtlasDraw) is never offered the atlas — just draws a spell, no prompt', () => {
    const g = newGame(); keepBoth(g)
    makeMagician(g, 0)
    const spellBefore = g.players[0].spellbook.length
    const handBefore = g.players[0].hand.length

    askDrawCard(g, 0)
    expect(g.prompts.some((pr) => pr.kind === 'drawDeck')).toBe(false)
    expect(g.players[0].spellbook.length).toBe(spellBefore - 1)
    expect(g.players[0].hand.length).toBe(handBefore + 1)
  })

  it('ctx.drawCard (what every "draw a card" card now calls) routes through the choice', () => {
    const g = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    const ctx: any = makeCtx(g as GameState, av.id, 0, [])
    const atlasBefore = g.players[0].atlas.length
    ctx.drawCard(0)
    expect(g.prompts[0]?.kind).toBe('drawDeck')
    answer(g, 'atlas')
    expect(g.players[0].atlas.length).toBe(atlasBefore - 1)
  })
})
