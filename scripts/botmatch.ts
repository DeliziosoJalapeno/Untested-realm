// Headless bot benchmark: NEW bot (packages/client/src/bot.ts) vs LEGACY bot
// (packages/client/src/bot_legacy.ts), plus a NEW-vs-NEW livelock check.
//
// Runs full games entirely through the shared engine (createGame + applyAction,
// exactly like scripts/fuzz_*.ts). Each bot only ever sees the SAME GameState the
// client hands it — no peeking beyond public info is introduced here.
//
//   npm run botmatch                    (default: 60 new-vs-legacy + 20 new-vs-new)
//   npx tsx scripts/botmatch.ts --games 60 --mirror 20 --verbose
//
// ACCEPTANCE: the new bot must beat legacy with >=65% win rate and produce ZERO
// concede-cascade fallbacks (every illegal bot action is a bug; we log the state).

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

const argv = process.argv.slice(2)
const arg = (name: string, def: number): number => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : def
}
const VERBOSE = argv.includes('--verbose')
const GAMES = arg('games', 60)
const MIRROR = arg('mirror', 20)
const ACTION_CAP = arg('cap', 2000)

const BASE_SEED = 0x5eed1234

// rotate through a handful of deck pairings so results aren't a single-matchup fluke
const DECK_PAIRS: [number, number][] = [
  [0, 1],
  [4, 5],
  [10, 11],
  [16, 17],
]

type BotFn = (state: GameState, me: PlayerId) => Action
type NeedFn = (state: GameState, me: PlayerId) => boolean

interface Metrics {
  siteAttacks: number
  abilities: number
  subsurfaceSummons: number
  expansionCasts: number
  auraCasts: number
  cemeteryCasts: number
}

const EXPANSION_SPELLS = new Set([
  'Buried Alive', 'Burning Hands', 'Firebreathing', 'Grievous Insult', 'Kiss of Death', 'Smite', 'Trial by Fire',
])

interface GameResult {
  winner: PlayerId | null // null = draw (action cap)
  turns: number
  fallbacks: number
  newMetrics: Metrics
}

function emptyMetrics(): Metrics {
  return { siteAttacks: 0, abilities: 0, subsurfaceSummons: 0, expansionCasts: 0, auraCasts: 0, cemeteryCasts: 0 }
}

/** record what the NEW bot's action exercised, for the metrics report. */
function tallyMetrics(state: GameState, action: Action, m: Metrics): void {
  if (action.t === 'moveAttack' && action.attack && 'site' in action.attack) m.siteAttacks++
  if (action.t === 'activate' && action.ability !== 'ranged') m.abilities++
  if (action.t === 'castSpell') {
    const card = state.cards[action.cardId]
    const name = card?.name
    if (name && EXPANSION_SPELLS.has(name)) m.expansionCasts++
    if (action.at && (action.at as any).region && (action.at as any).region !== 'surface') m.subsurfaceSummons++
    // cemetery cast: the card is in the caster's cemetery, not their hand
    if (card) {
      const owner = card.owner as PlayerId
      if (state.players[owner]?.cemetery?.includes(action.cardId)) m.cemeteryCasts++
    }
  }
}

/**
 * Play one game. `bots[seat]` acts for that seat. Metrics are collected only for
 * the seat named in `trackSeat` (the new bot). Returns the outcome + fallbacks.
 */
function playGame(
  decks: [DeckList, DeckList],
  seed: number,
  bots: [BotFn, BotFn],
  needs: [NeedFn, NeedFn],
  trackSeat: PlayerId,
  firstPlayer: PlayerId,
): GameResult {
  const g = createGame(decks, ['NEW', 'LEG'], seed, firstPlayer)
  const m = emptyMetrics()
  let fallbacks = 0
  let steps = 0

  const act = (seat: PlayerId): boolean => {
    // returns true if it did something
    if (!needs[seat](g, seat)) return false
    let action: Action
    try {
      action = bots[seat](g, seat)
    } catch (e: any) {
      if (seat === trackSeat) {
        fallbacks++
        logFallback('threw', g, seat, undefined, e)
      }
      action = { t: 'endTurn' }
    }
    if (seat === trackSeat) {
      tallyMetrics(g, action, m)
      // aura cast tally
      if (action.t === 'castSpell') {
        const nm = g.cards[action.cardId]?.name
        if (nm) {
          const def = tryDef(nm)
          if (def?.type === 'Aura') m.auraCasts++
        }
      }
    }
    const res = applyAction(g, seat, action)
    if (!res.ok) {
      if (seat === trackSeat) {
        fallbacks++
        logFallback(res.error ?? 'illegal', g, seat, action)
      }
      // mirror the client's fallback ladder
      const fallback: Action = g.prompts[0]?.player === seat
        ? { t: 'prompt', promptId: g.prompts[0].id, choice: null }
        : g.phase === 'mulligan'
          ? { t: 'keepHand' }
          : { t: 'endTurn' }
      const res2 = applyAction(g, seat, fallback)
      if (!res2.ok) applyAction(g, seat, { t: 'concede' })
    }
    return true
  }

  while (g.phase !== 'over' && steps < ACTION_CAP) {
    steps++
    // whichever seat currently needs to act (prompts can flip the acting seat)
    let acted = false
    if (needs[0](g, 0)) acted = act(0) || acted
    else if (needs[1](g, 1)) acted = act(1) || acted
    else {
      // neither needs to act but game not over — nudge the active player to endTurn
      const ap = g.activePlayer
      const r = applyAction(g, ap, { t: 'endTurn' })
      if (!r.ok) break
    }
  }

  return {
    winner: g.phase === 'over' ? g.winner : null,
    turns: g.turn,
    fallbacks,
    newMetrics: m,
  }
}

function tryDef(name: string) {
  try {
    // lazy require to avoid a hard dep at module top
    const { getCard } = require('../packages/shared/src/cards/db')
    return getCard(name)
  } catch {
    return null
  }
}

const fallbackLog: string[] = []
function logFallback(reason: string, g: GameState, seat: PlayerId, action?: Action, err?: any) {
  const prompt = g.prompts[0]
  const cardName = action && action.t === 'castSpell' ? g.cards[action.cardId]?.name : undefined
  const line = `FALLBACK seat=${seat} reason="${reason}" phase=${g.phase} turn=${g.turn}` +
    (prompt ? ` prompt=${prompt.kind}` : '') +
    (action ? ` action=${action.t}` : '') +
    (cardName ? ` card="${cardName}"` : '') +
    (action && action.t === 'castSpell' ? ` targets=${JSON.stringify(action.targets)}` : '') +
    (err ? ` err=${String(err?.message ?? err)}` : '')
  fallbackLog.push(line)
  if (VERBOSE) console.error('  ' + line)
}

// ---- run the matches ----

function runMatchup(): { newWins: number; legWins: number; draws: number; totalTurns: number; totalFallbacks: number; metrics: Metrics } {
  let newWins = 0
  let legWins = 0
  let draws = 0
  let totalTurns = 0
  let totalFallbacks = 0
  const agg = emptyMetrics()

  const half = Math.floor(GAMES / 2)
  for (let i = 0; i < GAMES; i++) {
    const newIsP0 = i < half
    const pair = DECK_PAIRS[i % DECK_PAIRS.length]
    const decks: [DeckList, DeckList] = newIsP0
      ? [starterDecks[pair[0]], starterDecks[pair[1]]]
      : [starterDecks[pair[1]], starterDecks[pair[0]]]
    const seed = (BASE_SEED + i * 7919) >>> 0
    const newSeat: PlayerId = newIsP0 ? 0 : 1
    const bots: [BotFn, BotFn] = newIsP0 ? [botAction, legacyBotAction] : [legacyBotAction, botAction]
    const needs: [NeedFn, NeedFn] = newIsP0 ? [botNeedsToAct, legacyBotNeedsToAct] : [legacyBotNeedsToAct, botNeedsToAct]
    const firstPlayer: PlayerId = (i % 2) as PlayerId

    const gt = Date.now()
    const r = playGame(decks, seed, bots, needs, newSeat, firstPlayer)
    totalTurns += r.turns
    totalFallbacks += r.fallbacks
    for (const k of Object.keys(agg) as (keyof Metrics)[]) agg[k] += r.newMetrics[k]
    if (r.winner === null) draws++
    else if (r.winner === newSeat) newWins++
    else legWins++
    process.stderr.write(`game ${i + 1}/${GAMES} pair=[${pair}] newP${newSeat} → ${r.winner === null ? 'DRAW(cap)' : r.winner === newSeat ? 'NEW' : 'LEG'} (${r.turns}t, ${r.fallbacks}fb, ${((Date.now() - gt) / 1000).toFixed(1)}s)\n`)
  }
  return { newWins, legWins, draws, totalTurns, totalFallbacks, metrics: agg }
}

function runMirror(): { decisive: number; draws: number; avgTurns: number; fallbacks: number } {
  let decisive = 0
  let draws = 0
  let totalTurns = 0
  let fallbacks = 0
  for (let i = 0; i < MIRROR; i++) {
    const pair = DECK_PAIRS[i % DECK_PAIRS.length]
    const decks: [DeckList, DeckList] = [starterDecks[pair[0]], starterDecks[pair[1]]]
    const seed = (BASE_SEED + 0x1000 + i * 5387) >>> 0
    const firstPlayer: PlayerId = (i % 2) as PlayerId
    const gt = Date.now()
    const r = playGame(decks, seed, [botAction, botAction], [botNeedsToAct, botNeedsToAct], 0, firstPlayer)
    totalTurns += r.turns
    fallbacks += r.fallbacks
    if (r.winner === null) draws++
    else decisive++
    process.stderr.write(`mirror ${i + 1}/${MIRROR} pair=[${pair}] → ${r.winner === null ? 'DRAW(cap)' : 'P' + r.winner} (${r.turns}t, ${((Date.now() - gt) / 1000).toFixed(1)}s)\n`)
  }
  return { decisive, draws, avgTurns: totalTurns / Math.max(1, MIRROR), fallbacks }
}

const t0 = Date.now()
const res = runMatchup()
const mirror = runMirror()
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

const played = res.newWins + res.legWins + res.draws
const winRate = ((res.newWins / GAMES) * 100).toFixed(1)

console.log('\n=================== botmatch ===================')
console.log(`NEW vs LEGACY — ${GAMES} games over ${DECK_PAIRS.length} deck pairings (${elapsed}s)`)
console.log(`  new wins:   ${res.newWins}`)
console.log(`  legacy wins:${res.legWins}`)
console.log(`  draws:      ${res.draws}`)
console.log(`  WIN RATE:   ${winRate}%   (acceptance >= 65%)`)
console.log(`  avg turns:  ${(res.totalTurns / GAMES).toFixed(1)}`)
console.log(`  NEW fallbacks (bugs, must be 0): ${res.totalFallbacks}`)
console.log('\n  new-bot mechanics exercised (aggregate over its games):')
console.log(`    site attacks:        ${res.metrics.siteAttacks}`)
console.log(`    abilities activated: ${res.metrics.abilities}`)
console.log(`    subsurface summons:  ${res.metrics.subsurfaceSummons}`)
console.log(`    expansion casts:     ${res.metrics.expansionCasts}`)
console.log(`    aura casts:          ${res.metrics.auraCasts}`)
console.log(`    cemetery casts:      ${res.metrics.cemeteryCasts}`)
console.log('\n  NEW vs NEW (livelock check) — ' + MIRROR + ' games')
console.log(`    decisive: ${mirror.decisive}, draws(cap): ${mirror.draws}, avg turns: ${mirror.avgTurns.toFixed(1)}, fallbacks: ${mirror.fallbacks}`)

if (res.totalFallbacks > 0 || mirror.fallbacks > 0) {
  console.log('\n  ⚠ FALLBACKS (first 20):')
  for (const l of fallbackLog.slice(0, 20)) console.log('    ' + l)
}

const pass = res.newWins / GAMES >= 0.65 && res.totalFallbacks === 0 && mirror.fallbacks === 0
console.log(`\n  RESULT: ${pass ? 'PASS ✅' : 'FAIL ❌'}`)
console.log('================================================\n')
process.exit(pass ? 0 : 1)
