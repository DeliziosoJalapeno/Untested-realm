// Headless bot arena: NEW bot (packages/client/src/bot.ts) vs LEGACY bot
// (packages/client/src/bot_legacy.ts), plus a NEW-vs-NEW livelock/crash check.
//
// Runs full games entirely through the shared engine (createGame + applyAction,
// exactly like scripts/fuzz_*.ts). Each bot only ever sees the public GameState
// the client hands it — no hidden-info peeking is introduced here.
//
//   npm run arena                           (default: 60 new-vs-legacy + 20 mirror)
//   npx tsx scripts/bot_arena.ts --games 60 --mirror 20 --verbose
//   npx tsx scripts/bot_arena.ts --games 100 --cap 3000
//
// GATE: new bot wins ≥60% of DECISIVE games (draws excluded), 0 crashes/livelocks.

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
import { legacyBotAction, legacyBotNeedsToAct } from '../packages/client/src/bot_legacy'

// ---- CLI args ----
const argv = process.argv.slice(2)
const argN = (name: string, def: number): number => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : def
}
const VERBOSE = argv.includes('--verbose')
const GAMES    = argN('games',  60)   // new-vs-legacy games (half each seat)
const MIRROR   = argN('mirror', 20)   // new-vs-new livelock check
const TURN_CAP = argN('turns',  60)   // game turn limit → draw
const ACT_CAP  = argN('cap',   200)   // per-turn action limit → forced endTurn

// ---- deck pairings: rotate through several pairs (starter + community slots) ----
// starterDecks contains both starter and community decks; indices 0-17 are valid.
// Each entry is [p0 deck index, p1 deck index]. Both seat assignments are played.
const DECK_PAIRS: [number, number][] = [
  [0,  1],   // starter pair A
  [4,  5],   // starter pair B
  [10, 11],  // community pair A
  [16, 17],  // community pair B
  [2,  3],   // starter pair C
]

const BASE_SEED = 0xb07a2e5a

// ---- types ----
type BotFn   = (state: GameState, me: PlayerId) => Action
type NeedsFn = (state: GameState, me: PlayerId) => boolean

interface Metrics {
  siteAttacks:      number
  abilitiesUsed:    number
  subsurfaceSummons:number
  auraCasts:        number
  cemeteryCasts:    number
  pickUps:          number
}

interface GameResult {
  winner:    PlayerId | null  // null = draw (turn/action cap)
  turns:     number
  crashes:   number           // new-bot throws or illegal actions
  metrics:   Metrics
}

// ---- helpers ----
function emptyMetrics(): Metrics {
  return { siteAttacks: 0, abilitiesUsed: 0, subsurfaceSummons: 0, auraCasts: 0, cemeteryCasts: 0, pickUps: 0 }
}

function tallyAction(state: GameState, action: Action, trackSeat: PlayerId, actingSeat: PlayerId, m: Metrics): void {
  if (actingSeat !== trackSeat) return
  if (action.t === 'moveAttack' && action.attack && 'site' in action.attack) m.siteAttacks++
  if (action.t === 'activate' && action.ability !== 'ranged') m.abilitiesUsed++
  if (action.t === 'pickUp') m.pickUps++
  if (action.t === 'castSpell') {
    const card = state.cards[action.cardId]
    // subsurface summon
    if (action.at && typeof (action.at as any).region === 'string' && (action.at as any).region !== 'surface') {
      m.subsurfaceSummons++
    }
    // cemetery cast: card is in the owner's cemetery before the action resolves
    if (card) {
      const owner = card.owner as PlayerId
      if (state.players[owner]?.cemetery?.includes(action.cardId)) m.cemeteryCasts++
    }
    // aura cast: look up type without crashing
    if (card?.name) {
      try {
        const { getCard } = require('../packages/shared/src/cards/db') as typeof import('../packages/shared/src/cards/db')
        if (getCard(card.name).type === 'Aura') m.auraCasts++
      } catch { /* card not in db — skip */ }
    }
  }
}

const crashLog: string[] = []
function logCrash(label: string, g: GameState, seat: PlayerId, action?: Action, err?: unknown): void {
  const prompt = g.prompts[0]
  const line = [
    `CRASH seat=${seat}`,
    `reason="${label}"`,
    `phase=${g.phase}`,
    `turn=${g.turn}`,
    prompt   ? `prompt=${prompt.kind}` : '',
    action   ? `action=${action.t}` : '',
    action?.t === 'castSpell' ? `card="${g.cards[action.cardId]?.name ?? '?'}"` : '',
    err      ? `err=${String((err as any)?.message ?? err)}` : '',
  ].filter(Boolean).join(' ')
  crashLog.push(line)
  if (VERBOSE) process.stderr.write('  CRASH: ' + line + '\n')
}

// ---- single game ----
function playGame(
  decks:      [DeckList, DeckList],
  seed:       number,
  bots:       [BotFn, BotFn],
  needs:      [NeedsFn, NeedsFn],
  trackSeat:  PlayerId,
  firstPlayer: PlayerId,
): GameResult {
  const g = createGame(decks, ['NEW', 'OLD'], seed, firstPlayer)
  const m = emptyMetrics()
  let crashes = 0

  // per-turn action counter (livelock guard)
  let turnActCount = 0
  let lastTurn = g.turn

  const act = (seat: PlayerId): boolean => {
    if (!needs[seat](g, seat)) return false

    // reset per-turn counter on new turns
    if (g.turn !== lastTurn) { turnActCount = 0; lastTurn = g.turn }
    turnActCount++
    if (turnActCount > ACT_CAP) {
      // livelock detected: force endTurn and count as crash for the tracked bot
      if (seat === trackSeat) { crashes++; logCrash('per-turn-cap', g, seat) }
      applyAction(g, seat, { t: 'endTurn' })
      turnActCount = 0
      return true
    }

    let action: Action
    try {
      action = bots[seat](g, seat)
    } catch (e) {
      if (seat === trackSeat) { crashes++; logCrash('threw', g, seat, undefined, e) }
      action = g.prompts[0]?.player === seat
        ? { t: 'prompt', promptId: g.prompts[0].id, choice: null }
        : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
    }

    tallyAction(g, action, trackSeat, seat, m)

    const res = applyAction(g, seat, action)
    if (!res.ok) {
      if (seat === trackSeat) { crashes++; logCrash(res.error ?? 'illegal', g, seat, action) }
      // client-mirrored fallback ladder
      const fb: Action = g.prompts[0]?.player === seat
        ? { t: 'prompt', promptId: g.prompts[0].id, choice: null }
        : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
      const r2 = applyAction(g, seat, fb)
      if (!r2.ok) applyAction(g, seat, { t: 'concede' })
    }
    return true
  }

  // main loop — turn cap enforced at the game level
  while (g.phase !== 'over') {
    if (g.turn > TURN_CAP * 2) break   // both players share turns; *2 is conservative

    if      (needs[0](g, 0)) act(0)
    else if (needs[1](g, 1)) act(1)
    else {
      // stall: nudge
      const r = applyAction(g, g.activePlayer, { t: 'endTurn' })
      if (!r.ok) break
    }
  }

  return { winner: g.phase === 'over' ? g.winner : null, turns: g.turn, crashes, metrics: m }
}

// ---- new-vs-legacy matchup ----
function runMatchup() {
  let newWins = 0, legWins = 0, draws = 0, totalTurns = 0, totalCrashes = 0
  const agg = emptyMetrics()

  const half = Math.floor(GAMES / 2)
  for (let i = 0; i < GAMES; i++) {
    const newIsP0   = i < half
    const pair      = DECK_PAIRS[i % DECK_PAIRS.length]
    const decks: [DeckList, DeckList] = newIsP0
      ? [starterDecks[pair[0]], starterDecks[pair[1]]]
      : [starterDecks[pair[1]], starterDecks[pair[0]]]
    const seed        = (BASE_SEED + i * 7919) >>> 0
    const newSeat: PlayerId = newIsP0 ? 0 : 1
    const bots:  [BotFn,   BotFn]   = newIsP0 ? [botAction,       legacyBotAction]       : [legacyBotAction,       botAction]
    const needs: [NeedsFn, NeedsFn] = newIsP0 ? [botNeedsToAct, legacyBotNeedsToAct] : [legacyBotNeedsToAct, botNeedsToAct]
    const fp: PlayerId = (i % 2) as PlayerId

    const t0 = Date.now()
    const r  = playGame(decks, seed, bots, needs, newSeat, fp)
    totalTurns   += r.turns
    totalCrashes += r.crashes
    for (const k of Object.keys(agg) as (keyof Metrics)[]) agg[k] += r.metrics[k]
    if (r.winner === null)       draws++
    else if (r.winner === newSeat) newWins++
    else                           legWins++
    process.stderr.write(
      `game ${String(i+1).padStart(3)}/${GAMES}  pair=[${pair}]  newP${newSeat}  ` +
      `→ ${r.winner === null ? 'DRAW' : r.winner === newSeat ? 'NEW ' : 'LEG '}` +
      `  (${r.turns}t  ${r.crashes}crash  ${((Date.now()-t0)/1000).toFixed(1)}s)\n`
    )
  }
  return { newWins, legWins, draws, totalTurns, totalCrashes, metrics: agg }
}

// ---- new-vs-new mirror (livelock / crash check) ----
function runMirror() {
  let decisive = 0, draws = 0, totalTurns = 0, totalCrashes = 0
  for (let i = 0; i < MIRROR; i++) {
    const pair  = DECK_PAIRS[i % DECK_PAIRS.length]
    const decks: [DeckList, DeckList] = [starterDecks[pair[0]], starterDecks[pair[1]]]
    const seed  = (BASE_SEED + 0x2000 + i * 5387) >>> 0
    const fp: PlayerId = (i % 2) as PlayerId
    const t0 = Date.now()
    const r = playGame(decks, seed, [botAction, botAction], [botNeedsToAct, botNeedsToAct], 0, fp)
    totalTurns   += r.turns
    totalCrashes += r.crashes
    if (r.winner === null) draws++; else decisive++
    process.stderr.write(
      `mirror ${String(i+1).padStart(2)}/${MIRROR}  pair=[${pair}]  ` +
      `→ ${r.winner === null ? 'DRAW' : 'P'+r.winner}` +
      `  (${r.turns}t  ${r.crashes}crash  ${((Date.now()-t0)/1000).toFixed(1)}s)\n`
    )
  }
  return { decisive, draws, avgTurns: totalTurns / Math.max(1, MIRROR), totalCrashes }
}

// ---- execute ----
const wallStart = Date.now()
process.stderr.write(`\nbot_arena: ${GAMES} new-vs-legacy  +  ${MIRROR} mirror  (turn cap ${TURN_CAP}, act cap ${ACT_CAP})\n\n`)

const res    = runMatchup()
const mirror = runMirror()
const elapsed = ((Date.now() - wallStart) / 1000).toFixed(1)

const decisive  = res.newWins + res.legWins
const winRatePct = decisive > 0 ? ((res.newWins / decisive) * 100).toFixed(1) : 'N/A'
const totalCrashes = res.totalCrashes + mirror.totalCrashes

console.log('\n===================== bot_arena =====================')
console.log(`NEW vs LEGACY — ${GAMES} games, ${DECK_PAIRS.length} deck pairings, ${elapsed}s total`)
console.log(`  deck pairings used: ${DECK_PAIRS.map(p => `[${p}]`).join('  ')}`)
console.log('')
console.log(`  new wins:    ${res.newWins}`)
console.log(`  legacy wins: ${res.legWins}`)
console.log(`  draws (cap): ${res.draws}`)
console.log(`  decisive:    ${decisive}`)
console.log(`  WIN RATE (decisive): ${winRatePct}%   (gate: ≥60%)`)
console.log(`  avg turns:   ${(res.totalTurns / GAMES).toFixed(1)}`)
console.log('')
console.log(`  crashes / livelocks (new bot, MUST BE 0): ${res.totalCrashes}`)
console.log('')
console.log('  new-bot mechanics exercised across all its games:')
console.log(`    site attacks:       ${res.metrics.siteAttacks}`)
console.log(`    abilities fired:    ${res.metrics.abilitiesUsed}`)
console.log(`    subsurface summons: ${res.metrics.subsurfaceSummons}`)
console.log(`    aura casts:         ${res.metrics.auraCasts}`)
console.log(`    cemetery casts:     ${res.metrics.cemeteryCasts}`)
console.log(`    artifact pickups:   ${res.metrics.pickUps}`)
console.log('')
console.log(`  NEW vs NEW livelock check — ${MIRROR} games`)
console.log(`    decisive: ${mirror.decisive}  draws(cap): ${mirror.draws}`)
console.log(`    avg turns: ${mirror.avgTurns.toFixed(1)}  crashes: ${mirror.totalCrashes}`)

if (crashLog.length > 0) {
  console.log(`\n  CRASHES (first 20):`)
  for (const l of crashLog.slice(0, 20)) console.log('    ' + l)
}

const gateWinRate  = decisive > 0 && res.newWins / decisive >= 0.60
const gateCrashes  = totalCrashes === 0
const gateGames    = GAMES >= 50
const pass = gateWinRate && gateCrashes && gateGames

console.log('')
console.log(`  gate: ≥60% decisive win rate  → ${gateWinRate ? 'PASS' : 'FAIL'}`)
console.log(`  gate: 0 crashes/livelocks     → ${gateCrashes ? 'PASS' : 'FAIL'}`)
console.log(`  gate: ≥50 games played        → ${gateGames   ? 'PASS' : 'FAIL'}`)
console.log(`\n  RESULT: ${pass ? 'PASS' : 'FAIL'}`)
console.log('=====================================================\n')

process.exit(pass ? 0 : 1)
