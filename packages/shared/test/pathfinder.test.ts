import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, answer, act, actFail } from './helpers'
import { noAtlasDrawChoice, type GameState, type PlayerId } from '../src'

function makePathfinder(g: GameState, player: PlayerId): void {
  g.units[g.players[player].avatarUnitId].name = 'Pathfinder'
}

describe('Pathfinder', () => {
  it('noAtlasDrawChoice() is true for Pathfinder (and Magician), false for a normal avatar', () => {
    const g = newGame()
    expect(noAtlasDrawChoice(g, 0)).toBe(false)
    makePathfinder(g, 0)
    expect(noAtlasDrawChoice(g, 0)).toBe(true)
    expect(noAtlasDrawChoice(g, 1)).toBe(false)
  })

  it('turn-1 auto-establishes: taps and plays the TOP atlas site UNDER the avatar, no prompt', () => {
    const g = newGame(42, 0)
    makePathfinder(g, 0)
    g.players[0].firstSiteDone = false // re-enable the forced first-turn establishment
    const avatar = g.units[g.players[0].avatarUnitId]
    const topCard = g.players[0].atlas[0]
    const topName = g.cards[topCard].name
    const atlasBefore = g.players[0].atlas.length

    keepBoth(g) // triggers player 0's start-of-turn → auto-establishment

    const site = Object.values(g.sites).find((s) => s.x === avatar.x && s.y === avatar.y && !s.isRubble)
    expect(site?.name).toBe(topName) // top atlas site, placed under the avatar
    expect(g.players[0].atlas.length).toBe(atlasBefore - 1) // pulled off the atlas
    expect(avatar.tapped).toBe(true) // tapped (used its own ability)
    // it was fully automatic — never a firstSite (hand) or drawDeck prompt
    expect(g.prompts.some((p) => p.player === 0 && (p.kind === 'firstSite' || p.kind === 'drawDeck'))).toBe(false)
  })

  it('cannot play a site from hand via the standard avatar action', () => {
    const g = newGame()
    makePathfinder(g, 0)
    keepBoth(g)
    // hand a site to the Pathfinder and try the standard "tap: play site"
    const siteId = g.players[0].hand.find((id) => g.cards[id]) // any card id present
    const err = actFail(g, 0, { t: 'avatarSite', mode: 'play', cardId: siteId!, x: 2, y: 3 })
    expect(err).toMatch(/plays sites through its own ability/i)
  })

  it('start-of-turn draw never offers the atlas — it just draws a spell', () => {
    const g = newGame(42, 0)
    makePathfinder(g, 0)
    keepBoth(g) // firstSiteDone preset true for both → straight to main (draw-focused test)
    act(g, 0, { t: 'endTurn' })
    // player 1 is a normal avatar → gets the spellbook/atlas choice
    expect(g.prompts.find((p) => p.player === 1 && p.kind === 'drawDeck')).toBeTruthy()
    while (g.prompts.length) answer(g, g.prompts[0].data?.options?.[0] ?? 'spellbook')
    const before = g.players[0].hand.length
    act(g, 1, { t: 'endTurn' }) // → Pathfinder's start-of-turn draw step

    expect(g.prompts.some((p) => p.player === 0 && p.kind === 'drawDeck')).toBe(false)
    expect(g.players[0].hand.length).toBe(before + 1) // a spell, drawn automatically
  })
})
