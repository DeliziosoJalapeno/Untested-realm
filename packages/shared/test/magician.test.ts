import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, answer, act } from './helpers'
import { drawCards, noAtlasDraw, type GameState, type PlayerId } from '../src'

/** turn a player's avatar into the Magician (the noAtlasDraw / sitesInSpellbook avatar). */
function makeMagician(g: GameState, player: PlayerId): void {
  g.units[g.players[player].avatarUnitId].name = 'Magician'
}

describe('Magician never draws from the atlas', () => {
  it('noAtlasDraw() is true for a Magician, false for a normal avatar', () => {
    const g = newGame()
    expect(noAtlasDraw(g, 0)).toBe(false)
    makeMagician(g, 0)
    expect(noAtlasDraw(g, 0)).toBe(true)
    expect(noAtlasDraw(g, 1)).toBe(false)
  })

  it('an atlas-draw effect does NOTHING — no card gained, and no empty-deck loss', () => {
    const g = newGame()
    makeMagician(g, 0)
    g.players[0].atlas = [] // a real Magician has an empty atlas
    const handBefore = g.players[0].hand.length
    drawCards(g, 0, 'atlas', 3) // e.g. a "draw a site" / "draw 3 sites" effect
    expect(g.players[0].hand.length).toBe(handBefore) // nothing drawn
    expect(g.phase).not.toBe('over') // NOT a deck-out loss
    expect(g.winner == null).toBe(true)
  })

  it('spellbook draws still work for a Magician', () => {
    const g = newGame()
    makeMagician(g, 0)
    const before = g.players[0].hand.length
    drawCards(g, 0, 'spellbook', 1)
    expect(g.players[0].hand.length).toBe(before + 1)
  })

  it('the start-of-turn draw never prompts a Magician — it just draws a spell', () => {
    const g = newGame(42, 0)
    makeMagician(g, 0)
    keepBoth(g) // turn 1 (player 0, first player) skips the draw; opens to main
    // hand player 0 → player 1 (draws, gets the normal spellbook/atlas prompt)
    act(g, 0, { t: 'endTurn' })
    // player 1 is a normal avatar: they DO get the draw choice
    expect(g.prompts.find((p) => p.player === 1 && p.kind === 'drawDeck')).toBeTruthy()
    answer(g, 'spellbook')
    while (g.prompts.length) answer(g, g.prompts[0].data?.options?.[0] ?? 'spellbook')
    const magHandBefore = g.players[0].hand.length
    act(g, 1, { t: 'endTurn' }) // → player 0's (Magician) start-of-turn draw step

    // no drawDeck prompt was ever raised for the Magician…
    expect(g.prompts.some((p) => p.player === 0 && p.kind === 'drawDeck')).toBe(false)
    // …and they drew exactly one card — from the spellbook (hand grew, atlas untouched)
    expect(g.players[0].hand.length).toBe(magHandBefore + 1)
  })
})
