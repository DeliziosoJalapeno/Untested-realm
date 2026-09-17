// Local (hotseat + vs-Computer) Courtesan Thaïs must NOT diverge from online: the
// board flips to the controlled seat and the right human/seat may act. These pure
// seat-resolution helpers drive that (App feeds them to Game / the bot loop).

import { describe, it, expect } from 'vitest'
import { createGame, starterDecks, actingSeatFor, type GameState } from '@sorcery/shared'
import { hotseatViewpoint, botDisplaySeat, actingPlayer } from '../src/App'

function game(active: 0 | 1, thais?: 0 | 1): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 42, 0)
  g.phase = 'main'
  g.players[0].keptHand = true; g.players[1].keptHand = true
  g.activePlayer = active
  if (thais !== undefined) g.flow = { ...(g.flow ?? {}), thaisActive: thais }
  return g
}

describe('hotseat Thaïs — board + actor track the control', () => {
  it('normal: the device shows the active player and they act', () => {
    const g = game(1)
    expect(hotseatViewpoint(g)).toBe(1)        // show seat 1's board
    expect(actingPlayer(g, { t: 'endTurn' })).toBe(1) // seat 1 acts
  })
  it('under Thaïs: the device shows the CONTROLLED seat, the CONTROLLER acts', () => {
    const g = game(1, 1) // seat 1's turn, controlled by seat 0
    expect(actingSeatFor(g, 1)).toBe(0)
    expect(hotseatViewpoint(g)).toBe(1)              // board flips to the controlled seat
    expect(actingPlayer(g, { t: 'endTurn' })).toBe(0) // but the controller (seat 0) plays it
  })
})

describe('vs-Computer Thaïs — the human (seat 0) sees the hand they pilot', () => {
  it('normal: the human always sees their own board (seat 0)', () => {
    expect(botDisplaySeat(game(0))).toBe(0) // human turn
    expect(botDisplaySeat(game(1))).toBe(0) // computer turn — human watches from seat 0
  })
  it("when the human controls the computer's turn, the board flips to seat 1", () => {
    const g = game(1, 1) // computer's turn, controlled by the human (seat 0)
    expect(actingSeatFor(g, 1)).toBe(0)
    expect(botDisplaySeat(g)).toBe(1) // flip to seat 1 so the human sees that hand
  })
  it("when the computer controls the human's turn, the human keeps their own board", () => {
    const g = game(0, 0) // human's turn, controlled by the computer (seat 1)
    expect(actingSeatFor(g, 0)).toBe(1)
    expect(botDisplaySeat(g)).toBe(0) // human watches their own board being played
  })
})
