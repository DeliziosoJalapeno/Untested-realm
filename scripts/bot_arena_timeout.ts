// Timeout-tracking bot arena. Runs N bot-vs-bot matches, each with a WALL-CLOCK
// budget; any match that exceeds the budget is recorded as a TIMEOUT (the engine
// or bot got too slow / stuck). Also records per-action timing so a single slow
// bot decision is visible. Everything is written to a human-readable log file.
//
//   npx tsx scripts/bot_arena_timeout.ts [--games 8] [--budget 30] [--label before] [--out arena_timeout.log]
//
// Purpose: a health/perf probe (e.g. before/after the effKeywords static-grant
// index work) — the bot search calls effKeywords heavily, so slow keywords show
// up directly as slow turns / timeouts here.

import { appendFileSync, writeFileSync } from 'node:fs'
import {
  createGame,
  applyAction,
  starterDecks,
  type GameState,
  type PlayerId,
  type Action,
  type DeckList,
} from '../packages/shared/src'
import { botAction, botNeedsToAct } from '../packages/client/src/bot'

const argv = process.argv.slice(2)
const argN = (name: string, def: number): number => {
  const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : def
}
const argS = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const GAMES     = argN('games', 8)
const BUDGET_MS = argN('budget', 30) * 1000
const TURN_CAP  = argN('turns', 60)
const ACT_CAP   = argN('cap', 400)
const LABEL     = argS('label', 'run')
const OUT       = argS('out', 'arena_timeout.log')

const DECK_PAIRS: [number, number][] = [[0, 1], [4, 5], [10, 11], [16, 17], [2, 3]]
const BASE_SEED = 0xb07a2e5a

function log(line = ''): void { process.stdout.write(line + '\n'); appendFileSync(OUT, line + '\n') }

interface MatchResult {
  idx: number
  pair: [number, number]
  timedOut: boolean
  winner: PlayerId | null
  turns: number
  actions: number
  wallMs: number
  maxActMs: number          // slowest single bot decision + apply
  maxActWhat: string        // what that slowest action was (phase/turn/action)
  crashes: number
}

function playGame(decks: [DeckList, DeckList], seed: number, fp: PlayerId, idx: number, pair: [number, number]): MatchResult {
  const g = createGame(decks, ['A', 'B'], seed, fp)
  const start = Date.now()
  let actions = 0, crashes = 0, maxActMs = 0, maxActWhat = ''
  let turnActCount = 0, lastTurn = g.turn
  let timedOut = false

  const step = (seat: PlayerId): void => {
    if (g.turn !== lastTurn) { turnActCount = 0; lastTurn = g.turn }
    turnActCount++
    if (turnActCount > ACT_CAP) { applyAction(g, seat, { t: 'endTurn' }); turnActCount = 0; return }

    const t0 = Date.now()
    let action: Action
    try { action = botAction(g, seat) }
    catch {
      action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null }
        : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
    }
    const res = applyAction(g, seat, action)
    if (!res.ok) {
      crashes++
      const fb: Action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null }
        : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
      if (!applyAction(g, seat, fb).ok) applyAction(g, seat, { t: 'concede' })
    }
    const dt = Date.now() - t0
    actions++
    if (dt > maxActMs) { maxActMs = dt; maxActWhat = `turn=${g.turn} phase=${g.phase} action=${action.t}` }
  }

  while (g.phase !== 'over') {
    if (Date.now() - start > BUDGET_MS) { timedOut = true; break }
    if (g.turn > TURN_CAP * 2) break
    if (botNeedsToAct(g, 0)) step(0)
    else if (botNeedsToAct(g, 1)) step(1)
    else { if (!applyAction(g, g.activePlayer, { t: 'endTurn' }).ok) break }
  }

  return {
    idx, pair, timedOut,
    winner: g.phase === 'over' ? g.winner : null,
    turns: g.turn, actions, wallMs: Date.now() - start, maxActMs, maxActWhat, crashes,
  }
}

// ---- run ----
// Fresh file unless --append is passed (so a "before" run starts clean and a later
// "after" run appends into the SAME file for easy side-by-side reading).
if (!argv.includes('--append')) writeFileSync(OUT, '', 'utf8')

log('')
log(`================ bot_arena_timeout [${LABEL}] ================`)
log(`games=${GAMES}  budget=${BUDGET_MS / 1000}s/match  turnCap=${TURN_CAP}  actCap=${ACT_CAP}`)
log(`started (wall clock captured per match below)`)
log('')

const results: MatchResult[] = []
for (let i = 0; i < GAMES; i++) {
  const pair = DECK_PAIRS[i % DECK_PAIRS.length]
  const decks: [DeckList, DeckList] = [starterDecks[pair[0]], starterDecks[pair[1]]]
  const seed = (BASE_SEED + i * 7919) >>> 0
  const fp: PlayerId = (i % 2) as PlayerId
  const r = playGame(decks, seed, fp, i + 1, pair)
  results.push(r)
  log(
    `match ${String(i + 1).padStart(2)}/${GAMES}  pair=[${pair}]  ` +
    `${r.timedOut ? 'TIMEOUT ⏱' : (r.winner === null ? 'draw' : 'win P' + r.winner)}  ` +
    `turns=${String(r.turns).padStart(3)}  actions=${String(r.actions).padStart(4)}  ` +
    `wall=${(r.wallMs / 1000).toFixed(1)}s  slowestAct=${r.maxActMs}ms (${r.maxActWhat})` +
    (r.crashes ? `  crashes=${r.crashes}` : ''),
  )
}

const timeouts = results.filter((r) => r.timedOut).length
const crashes = results.reduce((a, r) => a + r.crashes, 0)
const slowest = results.reduce((a, r) => (r.maxActMs > a.maxActMs ? r : a), results[0])
const avgWall = results.reduce((a, r) => a + r.wallMs, 0) / results.length

log('')
log(`---- summary [${LABEL}] ----`)
log(`TIMEOUTS (>${BUDGET_MS / 1000}s): ${timeouts} / ${GAMES}`)
log(`crashes/illegal actions:  ${crashes}`)
log(`avg match wall:           ${(avgWall / 1000).toFixed(1)}s`)
log(`slowest single action:    ${slowest.maxActMs}ms  (match ${slowest.idx}, ${slowest.maxActWhat})`)
log(`==============================================================`)
log('')

process.exit(0)
