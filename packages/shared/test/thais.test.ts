import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { actingSeatFor, viewSeatFor, viewFor, opponent, type GameState } from '../src'

/** put seat `active` under Thaïs control on its own turn (the other seat pilots it). */
function underThais(active: 0 | 1): GameState {
  const g = newGame(); keepBoth(g)
  g.activePlayer = active
  g.flow = { ...(g.flow ?? {}), thaisActive: active }
  return g
}

describe('Courtesan Thaïs — who acts, and whose board each client sees', () => {
  it('the OTHER seat makes the controlled active player’s decisions', () => {
    const g = underThais(1)
    expect(actingSeatFor(g, 1), 'seat 0 pilots seat 1’s turn').toBe(0)
    // a seat that is NOT the controlled active player still decides for itself
    expect(actingSeatFor(g, 0)).toBe(0)
  })

  it('the pilot’s VIEW flips to the controlled seat; the benched seat keeps its own', () => {
    const g = underThais(1)
    expect(viewSeatFor(g, 0), 'pilot (seat 0) sees seat 1’s board').toBe(1)
    expect(viewSeatFor(g, 1), 'benched seat 1 still sees its own board').toBe(1)
  })

  it('with no Thaïs control, everyone sees their own board', () => {
    const g = newGame(); keepBoth(g)
    expect(viewSeatFor(g, 0)).toBe(0)
    expect(viewSeatFor(g, 1)).toBe(1)
  })

  it('the pilot’s flipped view reveals the controlled seat’s hand (so they can play it)', () => {
    const g = underThais(1)
    const pilot = 0
    const controlled = 1
    expect(opponent(controlled)).toBe(pilot)

    // what the SERVER would send the pilot: viewFor(viewSeatFor(pilot)) === viewFor(controlled)
    const view = viewFor(g, viewSeatFor(g, pilot))
    expect(view.you, 'the pilot is shown the controlled seat’s perspective').toBe(controlled)
    // the controlled seat's own hand is now fully visible (real card ids, not 'hidden')
    const hand = view.players[controlled].hand as string[]
    expect(hand.length).toBeGreaterThan(0)
    expect(hand.every((id) => id !== 'hidden' && !!view.cards[id]), 'controlled hand fully revealed to its pilot').toBe(true)
    // and the pilot’s OWN hand is hidden in this flipped view (they’re not playing it now)
    expect((view.players[pilot].hand as string[]).some((id) => id === 'hidden')).toBe(true)
  })
})
