// Game replays. A game is fully determined by its creation inputs (decks, names, seed, first player,
// clock, options) plus the ordered list of actions applied to it — the engine is a deterministic,
// seeded reducer. So a replay is just those inputs + the action log; we reconstruct any point in the
// game by re-running createGame and applying the first N actions. Compact (a few KB), and exact.
import {
  createGame,
  applyAction,
  type GameState,
  type Action,
  type PlayerId,
  type DeckList,
  type ClockConfig,
} from '@sorcery/shared'

export const REPLAY_VERSION = 1

export interface ReplayRecord {
  replayVersion: number
  createdAt: number
  mode: 'hotseat' | 'bot' | 'online'
  decks: [DeckList, DeckList]
  names: [string, string]
  seed: number
  firstPlayer: PlayerId
  clock: ClockConfig | null
  secondSeer?: boolean
  actions: { seat: PlayerId; action: Action }[]
  winner?: PlayerId | null
}

/** Start a fresh recording for a local game (captures the exact inputs needed to reproduce it).
 *  NOTE: pass the ORIGINAL seed/firstPlayer you handed to createGame — createGame advances state.seed
 *  during setup (shuffles/draws), so reading it back afterwards would record the wrong starting point. */
export function startReplay(
  mode: 'hotseat' | 'bot',
  decks: [DeckList, DeckList],
  names: [string, string],
  seed: number,
  firstPlayer: PlayerId,
  clock: ClockConfig | null,
  secondSeer: boolean,
): ReplayRecord {
  return {
    replayVersion: REPLAY_VERSION,
    createdAt: Date.now(),
    mode,
    // deep-clone the decks so later deck edits can't mutate the stored record
    decks: JSON.parse(JSON.stringify(decks)),
    names,
    seed,
    firstPlayer,
    clock,
    secondSeer,
    actions: [],
  }
}

/** The starting position of a replay. */
export function replayInitialState(r: ReplayRecord): GameState {
  return createGame(r.decks, r.names, r.seed, r.firstPlayer, r.clock, { secondSeer: r.secondSeer })
}

/** Apply the next action in the log to a working state, in place. Returns false past the end. */
export function replayStep(r: ReplayRecord, state: GameState, index: number): boolean {
  const entry = r.actions[index]
  if (!entry) return false
  try { applyAction(state, entry.seat, entry.action) } catch { /* keep the board as-is */ }
  return true
}

/** Rebuild the state after the first `n` actions (for scrubbing / jumping backwards). */
export function replayStateAt(r: ReplayRecord, n: number): GameState {
  const state = replayInitialState(r)
  const end = Math.max(0, Math.min(n, r.actions.length))
  for (let i = 0; i < end; i++) replayStep(r, state, i)
  return state
}
