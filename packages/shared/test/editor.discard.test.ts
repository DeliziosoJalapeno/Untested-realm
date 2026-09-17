// Editor: discard a specific card from a hand → it goes to that player's cemetery (routed through
// toCemetery, so Mismanaged Mortuary / Kor Crematory still apply).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { applyJudge } from '../src'

describe('editor discard', () => {
  it('moves the chosen hand card to the cemetery', () => {
    const g = newGame(); keepBoth(g)
    const cardId = g.players[0].hand[0]
    const before = g.players[0].hand.length

    expect(applyJudge(g, 0, { k: 'discard', cardId })).toBeNull()

    expect(g.players[0].hand.includes(cardId), 'left the hand').toBe(false)
    expect(g.players[0].hand.length).toBe(before - 1)
    expect(g.players[0].cemetery.includes(cardId), 'now in the cemetery').toBe(true)
  })

  it('rejects a card that is not in any hand', () => {
    const g = newGame(); keepBoth(g)
    expect(applyJudge(g, 0, { k: 'discard', cardId: 'not-a-card' })).toBeTruthy()
  })
})
