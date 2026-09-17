// The Editor can remove a placed aura: to the cemetery (its card returns) or out of the game.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { applyJudge, type GameState } from '../src'
import '../src/cards/scripts/index'

function placeAura(g: GameState, player: 0 | 1, name: string, squares: { x: number; y: number }[]): string {
  const cardId = `ca${g.nextId++}`
  g.cards[cardId] = { id: cardId, name, owner: player } as any
  const id = `r${g.nextId++}`
  g.auras[id] = { id, cardId, name, controller: player, squares } as any
  return id
}

describe('judge removeAura', () => {
  it('sends the aura to its owner’s cemetery', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 1, 1)
    const id = placeAura(g, 0, 'Wildfire', [{ x: 1, y: 1 }])
    const cardId = g.auras[id].cardId
    expect(applyJudge(g, 0, { k: 'removeAura', auraId: id })).toBeNull()
    expect(g.auras[id], 'aura gone from the board').toBeUndefined()
    expect(g.players[0].cemetery.includes(cardId), 'its card went to the cemetery').toBe(true)
  })

  it('toBanish removes it from the game (no cemetery)', () => {
    const g: GameState = newGame(); keepBoth(g)
    const id = placeAura(g, 0, 'Wildfire', [{ x: 2, y: 2 }])
    const cardId = g.auras[id].cardId
    expect(applyJudge(g, 0, { k: 'removeAura', auraId: id, toBanish: true })).toBeNull()
    expect(g.auras[id]).toBeUndefined()
    expect(g.players[0].cemetery.includes(cardId), 'not in the cemetery').toBe(false)
    expect(g.players[0].banished.includes(cardId), 'banished instead').toBe(true)
  })

  it('errors on a missing aura', () => {
    const g: GameState = newGame(); keepBoth(g)
    expect(applyJudge(g, 0, { k: 'removeAura', auraId: 'nope' })).toBeTruthy()
  })
})
