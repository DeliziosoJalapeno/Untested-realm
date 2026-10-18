// Bot-vs-bot timing profiler. Plays full NEW-vs-NEW games and times every
// decision: botNeedsToAct, botAction (the bot's thinking, including its own
// lookahead) and applyAction (the engine resolving the chosen action).
//
//   npm run profile                              (8 games, rotating all starter decks)
//   npm run profile -- --games 4 --cap 1500 --out profile-out
//   npm run profile:cpu                          (same, plus a V8 .cpuprofile → scripts/analyze_cpuprofile.ts)
//   npm run profile -- --bot thinking            the site's "Thinking" search bot (worker config: 30s budget)
//
// Writes <out>/decisions.jsonl (one row per decision, appended synchronously so a
// long run can be tailed) and <out>/summary.txt (aggregates + slowest decisions).

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import {
  createGame,
  applyAction,
  starterDecks,
  type GameState,
  type PlayerId,
  type Action,
  type DeckList,
} from '../packages/shared/src'
import { botAction as fastBotAction, botNeedsToAct } from '../packages/client/src/bot'
import { searchBotAction, DEFAULT_SEARCH } from '../packages/client/src/bot_search'

const argv = process.argv.slice(2)
const arg = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const GAMES = Number(arg('games', '8'))
const ACTION_CAP = Number(arg('cap', '2000'))
const OUT = arg('out', 'profile-out')
const SEED = Number(arg('seed', String(0x5eed1234)))
const BOT = arg('bot', 'fast')
const BUDGET_MS = Number(arg('budget', '30000')) // App.tsx hands the worker timeBudgetMs: 30000

// the search bot reports each planning search through SEARCH_DEBUG on stderr; capture it per decision
let lastSearch: { depth: number; nodes: number; ms: number; timedOut: boolean } | null = null
if (BOT === 'thinking') {
  process.env.SEARCH_DEBUG = '1'
  const origError = console.error
  console.error = (...a: unknown[]) => {
    const m = typeof a[0] === 'string' && /plan depth=(\d+) nodes=(\d+) took=(\d+)ms budget=\d+ timedOut=(true|false)/.exec(a[0])
    if (m) { lastSearch = { depth: +m[1], nodes: +m[2], ms: +m[3], timedOut: m[4] === 'true' }; return }
    origError(...a)
  }
}
const botAction = (g: GameState, seat: PlayerId): Action =>
  BOT === 'thinking' ? searchBotAction(g, seat, { ...DEFAULT_SEARCH, timeBudgetMs: BUDGET_MS }) : fastBotAction(g, seat)

mkdirSync(OUT, { recursive: true })
const LOG = join(OUT, 'decisions.jsonl')
writeFileSync(LOG, '')

interface Row {
  game: number
  step: number
  turn: number
  seat: PlayerId
  phase: string
  kind: string // action type, or prompt:<kind>
  card?: string
  needsMs: number
  botMs: number
  applyMs: number
  ok: boolean
  units: number
  search?: { depth: number; nodes: number; ms: number; timedOut: boolean } // thinking bot: a full planning search ran
}

const rows: Row[] = []

function describe(g: GameState, action: Action): { kind: string; card?: string } {
  if (action.t === 'prompt') return { kind: `prompt:${g.prompts[0]?.kind ?? '?'}` }
  const a = action as any
  const id = a.cardId ?? a.unitId ?? a.sourceId
  const card = id ? (g.cards[id]?.name ?? (g.units as any)[id]?.name) : undefined
  return { kind: a.ability ? `${action.t}:${a.ability}` : action.t, card }
}

function playGame(gi: number, decks: [DeckList, DeckList], seed: number, first: PlayerId) {
  const g = createGame(decks, ['P0', 'P1'], seed, first)
  let steps = 0
  const t0 = performance.now()
  while (g.phase !== 'over' && steps < ACTION_CAP) {
    steps++
    let n0 = performance.now()
    let seat: PlayerId | null = botNeedsToAct(g, 0) ? 0 : botNeedsToAct(g, 1) ? 1 : null
    const needsMs = performance.now() - n0
    if (seat === null) {
      if (!applyAction(g, g.activePlayer, { t: 'endTurn' }).ok) break
      continue
    }
    const turn = g.turn
    const phase = g.phase
    const b0 = performance.now()
    lastSearch = null
    let action: Action
    try {
      action = botAction(g, seat)
    } catch (e: any) {
      console.error(`  game ${gi} step ${steps}: bot threw ${e?.message ?? e}`)
      action = { t: 'endTurn' }
    }
    const botMs = performance.now() - b0
    const { kind, card } = describe(g, action)
    const a0 = performance.now()
    let res = applyAction(g, seat, action)
    if (!res.ok) {
      const fb: Action = g.prompts[0]?.player === seat
        ? { t: 'prompt', promptId: g.prompts[0].id, choice: null }
        : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
      if (!applyAction(g, seat, fb).ok) applyAction(g, seat, { t: 'concede' })
    }
    const applyMs = performance.now() - a0
    const row: Row = {
      game: gi, step: steps, turn, seat, phase, kind, card,
      needsMs: +needsMs.toFixed(3), botMs: +botMs.toFixed(3), applyMs: +applyMs.toFixed(3),
      ok: res.ok, units: Object.keys(g.units).length,
      ...(lastSearch ? { search: lastSearch } : {}),
    }
    rows.push(row)
    appendFileSync(LOG, JSON.stringify(row) + '\n')
    if (lastSearch) {
      const ls = lastSearch as { depth: number; nodes: number; ms: number; timedOut: boolean }
      console.log(`  g${gi} t${turn} P${seat} SEARCH nodes=${ls.nodes} depth=${ls.depth} ${ls.ms}ms ${(ls.nodes / Math.max(1, ls.ms) * 1000).toFixed(0)} nodes/s${ls.timedOut ? ' CUT-OFF' : ''} → ${kind}${card ? ` "${card}"` : ''} (${Object.keys(g.units).length} units)`)
    }
    if (botMs + applyMs > 1000) {
      console.error(`  SLOW game ${gi} turn ${turn} ${kind}${card ? ` "${card}"` : ''}: bot ${botMs.toFixed(0)}ms, engine ${applyMs.toFixed(0)}ms (${Object.keys(g.units).length} units)`)
    }
  }
  return { winner: g.phase === 'over' ? g.winner : null, turns: g.turn, steps, ms: performance.now() - t0 }
}

// ---- run ----
const games: { i: number; decks: string; winner: PlayerId | null; turns: number; steps: number; ms: number }[] = []
const runStart = performance.now()
for (let i = 0; i < GAMES; i++) {
  const a = (i * 2) % starterDecks.length
  const b = (i * 2 + 1) % starterDecks.length
  const seed = (SEED + i * 7919) >>> 0
  const r = playGame(i, [starterDecks[a], starterDecks[b]], seed, (i % 2) as PlayerId)
  const decks = `${starterDecks[a].name} vs ${starterDecks[b].name}`
  games.push({ i, decks, ...r })
  console.error(`game ${i + 1}/${GAMES} [${decks}] → ${r.winner === null ? 'DRAW(cap)' : 'P' + r.winner} ${r.turns}t ${r.steps} decisions ${(r.ms / 1000).toFixed(1)}s`)
}
const wall = performance.now() - runStart

// ---- aggregate ----
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0
  const s = [...xs].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}
const fmt = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(1)}ms`

function table(title: string, keyOf: (r: Row) => string | undefined, val: (r: Row) => number, limit = 25): string {
  const groups = new Map<string, number[]>()
  for (const r of rows) {
    const k = keyOf(r)
    if (k === undefined) continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(val(r))
  }
  const total = sum(rows.map(val))
  const lines = [...groups.entries()]
    .map(([k, xs]) => ({ k, n: xs.length, tot: sum(xs), mean: sum(xs) / xs.length, p95: pct(xs, 0.95), max: Math.max(...xs) }))
    .sort((x, y) => y.tot - x.tot)
    .slice(0, limit)
    .map(s => `  ${s.k.padEnd(42).slice(0, 42)} ${String(s.n).padStart(6)} ${fmt(s.tot).padStart(9)} ${((s.tot / total) * 100).toFixed(1).padStart(5)}% ${fmt(s.mean).padStart(9)} ${fmt(s.p95).padStart(9)} ${fmt(s.max).padStart(9)}`)
  return `\n${title}\n  ${'key'.padEnd(42)} ${'count'.padStart(6)} ${'total'.padStart(9)} ${'share'.padStart(6)} ${'mean'.padStart(9)} ${'p95'.padStart(9)} ${'max'.padStart(9)}\n${lines.join('\n')}`
}

const botTot = sum(rows.map(r => r.botMs))
const applyTot = sum(rows.map(r => r.applyMs))
const needsTot = sum(rows.map(r => r.needsMs))
const out: string[] = []
out.push(`bot_profile [${BOT} bot${BOT === 'thinking' ? `, ${BUDGET_MS}ms budget` : ''}] — ${GAMES} games, ${rows.length} decisions, wall ${fmt(wall)}`)
out.push(`  bot thinking (botAction):   ${fmt(botTot)}  (${((botTot / wall) * 100).toFixed(1)}%)`)
out.push(`  engine (applyAction):       ${fmt(applyTot)}  (${((applyTot / wall) * 100).toFixed(1)}%)`)
out.push(`  botNeedsToAct:              ${fmt(needsTot)}  (${((needsTot / wall) * 100).toFixed(1)}%)`)
out.push(`  decisions/s: ${(rows.length / (wall / 1000)).toFixed(1)}   p50 bot ${fmt(pct(rows.map(r => r.botMs), 0.5))}  p95 bot ${fmt(pct(rows.map(r => r.botMs), 0.95))}  p99 bot ${fmt(pct(rows.map(r => r.botMs), 0.99))}`)
out.push('\nGames')
for (const g of games) out.push(`  #${g.i} ${g.decks.slice(0, 70).padEnd(70)} ${g.winner === null ? 'DRAW' : 'P' + g.winner} ${String(g.turns).padStart(3)}t ${String(g.steps).padStart(5)} dec ${fmt(g.ms).padStart(8)}`)
const searches = rows.filter((r) => r.search).map((r) => r.search!)
if (searches.length) {
  const nps = searches.map((x) => x.nodes / Math.max(1, x.ms) * 1000)
  out.push(`
Planning searches: ${searches.length}  total ${fmt(sum(searches.map((x) => x.ms)))}  cut off (time/node cap): ${searches.filter((x) => x.timedOut).length}`)
  out.push(`  nodes: mean ${(sum(searches.map((x) => x.nodes)) / searches.length).toFixed(0)}  max ${Math.max(...searches.map((x) => x.nodes))}   ms: p50 ${fmt(pct(searches.map((x) => x.ms), 0.5))}  p95 ${fmt(pct(searches.map((x) => x.ms), 0.95))}  max ${fmt(Math.max(...searches.map((x) => x.ms)))}`)
  out.push(`  throughput: ${(sum(searches.map((x) => x.nodes)) / Math.max(1, sum(searches.map((x) => x.ms))) * 1000).toFixed(0)} nodes/s overall, p50 ${pct(nps, 0.5).toFixed(0)} / p10 ${pct(nps, 0.1).toFixed(0)} per search   plan depth mean ${(sum(searches.map((x) => x.depth)) / searches.length).toFixed(1)}`)
}
out.push(table('BOT time by decision kind', r => r.kind, r => r.botMs))
out.push(table('ENGINE time by action kind', r => r.kind, r => r.applyMs))
out.push(table('BOT time by card involved', r => r.card, r => r.botMs))
out.push(table('ENGINE time by card involved', r => r.card, r => r.applyMs))
out.push(table('BOT time by board size (units on board, bucketed)', r => `${Math.floor(r.units / 5) * 5}-${Math.floor(r.units / 5) * 5 + 4} units`, r => r.botMs))
out.push(table('BOT time by turn', r => `turn ${String(r.turn).padStart(3)}`, r => r.botMs, 40))
out.push('\nSlowest 30 decisions (bot + engine)')
for (const r of [...rows].sort((x, y) => (y.botMs + y.applyMs) - (x.botMs + x.applyMs)).slice(0, 30)) {
  out.push(`  game ${r.game} step ${String(r.step).padStart(4)} turn ${String(r.turn).padStart(3)} P${r.seat} ${r.kind.padEnd(28)} ${(r.card ?? '').padEnd(28).slice(0, 28)} bot ${fmt(r.botMs).padStart(9)} engine ${fmt(r.applyMs).padStart(9)} units ${r.units}${r.ok ? '' : ' ILLEGAL'}`)
}
const text = out.join('\n') + '\n'
writeFileSync(join(OUT, 'summary.txt'), text)
console.log(text)
