// Replay fidelity: a game is fully determined by (createGame inputs + action log), so rebuilding from a
// recorded replay must reproduce the EXACT same states — at the end and at every intermediate step.
import { describe, it, expect } from 'vitest'
import {
  createGame,
  applyAction,
  starterDecks,
  viewFor,
  type GameState,
  type PlayerId,
  type Action,
} from '@sorcery/shared'
import { botAction } from '../src/bot'
import { startReplay, replayStateAt, type ReplayRecord } from '../src/replay'

/** play a full bot-vs-bot game, recording every applied action into a ReplayRecord + per-step snapshots. */
function playAndRecord(seed: number): { record: ReplayRecord; snapshots: string[]; final: string } {
  const g = createGame([starterDecks[0], starterDecks[1]], ['You', 'Computer'], seed, 0)
  const record = startReplay('bot', [starterDecks[0] as any, starterDecks[1] as any], ['You', 'Computer'], seed, 0, null, false)
  const snapshots: string[] = [JSON.stringify(g)] // state after N actions (index 0 = start)
  let steps = 0
  while (g.phase !== 'over' && steps < 1200) {
    steps++
    const prompt = g.prompts[0]
    let seat: PlayerId | null = null
    if (prompt) seat = prompt.player as PlayerId
    else if (g.phase === 'mulligan') seat = !g.players[0].keptHand ? 0 : !g.players[1].keptHand ? 1 : null
    else seat = g.activePlayer
    if (seat === null) break
    const action: Action = botAction(g, seat)
    const res = applyAction(g, seat, action)
    if (!res.ok) break
    record.actions.push({ seat, action })
    snapshots.push(JSON.stringify(g))
  }
  return { record, snapshots, final: JSON.stringify(g) }
}

describe('replay reconstruction is byte-exact', () => {
  for (const seed of [111, 222, 333]) {
    it(`reproduces the final state from the action log (seed ${seed})`, () => {
      const { record, final } = playAndRecord(seed)
      expect(record.actions.length).toBeGreaterThan(5) // a real game happened
      const rebuilt = replayStateAt(record, record.actions.length)
      expect(JSON.stringify(rebuilt)).toBe(final)
    })
  }

  it('reproduces every intermediate step (scrubbing is exact)', () => {
    const { record, snapshots } = playAndRecord(4242)
    // check a spread of indices, incl. the first few and the last
    const idxs = [0, 1, 2, 3, Math.floor(snapshots.length / 2), snapshots.length - 2, snapshots.length - 1]
      .filter((i) => i >= 0 && i < snapshots.length)
    for (const i of new Set(idxs)) {
      expect(JSON.stringify(replayStateAt(record, i)), `step ${i} mismatch`).toBe(snapshots[i])
    }
  })

  it('god-view reveals both hands', () => {
    const { record } = playAndRecord(7)
    const state = replayStateAt(record, 2)
    const god = viewFor(state, 0, { revealAll: true })
    // neither player's hand should contain the 'hidden' placeholder in a reveal-all view
    for (const p of god.players) {
      expect(p.hand.includes('hidden'), `player ${p.id} hand hidden under revealAll`).toBe(false)
    }
  })
})
