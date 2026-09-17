// Search-bot harness: plays games of search-bot vs the current procedural botAction, checking for
// illegal/crashing actions and reporting win share + timing.
//
//   npx tsx scripts/search_smoke.ts 1            → one game, verbose per-decision trace
//   npx tsx scripts/search_smoke.ts 24 12        → 24 games across 12 worker processes (parallel)
//   npx tsx scripts/search_smoke.ts 24           → 24 games, auto = (cpus-1) workers
//
// Games are independent, so the batch is split across child processes; each worker plays a slice
// and streams `RESULT {json}` lines that the coordinator aggregates.
import { spawn } from 'node:child_process'
import { cpus } from 'node:os'
import { createGame, applyAction, type Action, type DeckList, type GameState, type PlayerId } from '../packages/shared/src'
import { communityDecks } from '../packages/shared/src/cards/communityDecks'
import { botAction, botNeedsToAct } from '../packages/client/src/bot'
import { searchBotAction, searchBotNeedsToAct, DEFAULT_SEARCH } from '../packages/client/src/bot_search'

// Deck pool for bot-SKILL testing: real community/tournament decks only — exclude the weak default
// starters and any `test` decks. Matches are MIRRORS (both bots play the same deck) so deck strength
// cancels out and the win rate reflects bot skill, not the matchup.
const POOL: DeckList[] = communityDecks.filter((d) => !/test|x[_ ]?test/i.test(d.name))

// tunables (env wins so worker children inherit them; else CLI arg; else default)
const MAXTURN = Number(process.env.SMOKE_MAXTURN ?? process.argv[4] ?? 80) // turn at which a stalled game is called a draw
const SEARCH_MS = Number(process.env.SMOKE_SEARCH_MS ?? process.argv[5] ?? 1000) // per-decision search time budget
const VERBOSE = String(process.env.SMOKE_VERBOSE ?? '') === '1' || process.argv.includes('--verbose') // per-turn search-bot trace
const ACT_CAP = 400
type BotFn = (g: GameState, s: PlayerId) => Action
type NeedsFn = (g: GameState, s: PlayerId) => boolean
const searchFn: BotFn = (g, s) => searchBotAction(g, s, { ...DEFAULT_SEARCH, timeBudgetMs: SEARCH_MS })

interface GameOut { i: number; winner: PlayerId | null; searchSeat: PlayerId; deckName: string; turns: number; crashes: number; decisions: number; searchMs: number; maxMs: number; wallMs: number }

function playOne(i: number, verbose: boolean): GameOut {
  const searchSeat: PlayerId = (i % 2) as PlayerId
  // MIRROR match: both bots play the SAME deck (deck strength cancels → pure bot-skill signal). Each
  // deck is played twice (once per seat) as i advances.
  const deck = POOL[Math.floor(i / 2) % POOL.length]
  const decks: [DeckList, DeckList] = [deck, deck]
  const seed = (12345 + i * 7919) >>> 0
  const g = createGame(decks, ['SRCH', 'PROC'], seed, (i % 2) as PlayerId)
  const bots: [BotFn, BotFn] = searchSeat === 0 ? [searchFn, botAction] : [botAction, searchFn]
  const needs: [NeedsFn, NeedsFn] = searchSeat === 0 ? [searchBotNeedsToAct, botNeedsToAct] : [botNeedsToAct, searchBotNeedsToAct]

  let crashes = 0, decisions = 0, searchMs = 0, maxMs = 0, turnActCount = 0, lastTurn = g.turn
  const t0 = Date.now()
  const act = (seat: PlayerId): boolean => {
    if (!needs[seat](g, seat)) return false
    if (g.turn !== lastTurn) { turnActCount = 0; lastTurn = g.turn }
    if (++turnActCount > ACT_CAP) { if (seat === searchSeat) crashes++; applyAction(g, seat, { t: 'endTurn' }); turnActCount = 0; return true }
    let action: Action
    const d0 = Date.now()
    try { action = bots[seat](g, seat) } catch (e) {
      if (seat === searchSeat) { crashes++; console.error('  threw:', (e as Error).message) }
      action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
    }
    const ms = Date.now() - d0
    if (seat === searchSeat) {
      decisions++; searchMs += ms; if (ms > maxMs) maxMs = ms
      if (verbose) {
        const pr = g.prompts[0]?.player === seat ? `prompt:${g.prompts[0].kind}` : (action as any).t
        const sites = Object.values(g.sites).filter((s) => s.controller === seat && !s.isRubble).length
        const detail = JSON.stringify(action).slice(0, 70)
        console.log(`g${i + 1} [t${g.turn} s${seat}] ${pr.padEnd(11)} ${String(ms).padStart(6)}ms  life ${g.units[g.players[0].avatarUnitId]?.life}/${g.units[g.players[1].avatarUnitId]?.life}  hand ${g.players[seat].hand.length}  sites ${sites}  ${detail}`)
      }
    }
    const res = applyAction(g, seat, action)
    if (!res.ok) {
      if (seat === searchSeat) { crashes++; console.error('  illegal:', res.error, JSON.stringify(action).slice(0, 90)) }
      const fb: Action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
      if (!applyAction(g, seat, fb).ok) applyAction(g, seat, { t: 'concede' })
    }
    return true
  }
  let lastLog = -1
  while (g.phase !== 'over') {
    if (g.turn > MAXTURN) break
    if (verbose && g.turn !== lastLog) {
      lastLog = g.turn
      const nb = g.units[g.players[searchSeat].avatarUnitId]?.life
      const ob = g.units[g.players[(1 - searchSeat) as PlayerId].avatarUnitId]?.life
      console.log(`g${i + 1} ── turn ${g.turn}  newbot(search) ${nb}  oldbot(proc) ${ob}`)
    }
    if (needs[0](g, 0)) act(0)
    else if (needs[1](g, 1)) act(1)
    else { if (!applyAction(g, g.activePlayer, { t: 'endTurn' }).ok) break }
  }
  return { i, winner: g.phase === 'over' ? g.winner : null, searchSeat, deckName: deck.name, turns: g.turn, crashes, decisions, searchMs, maxMs, wallMs: Date.now() - t0 }
}

function report(results: GameOut[]) {
  let wins = 0, losses = 0, draws = 0, crashes = 0, decisions = 0, searchMs = 0
  for (const r of results.sort((a, b) => a.i - b.i)) {
    const won = r.winner === r.searchSeat, lost = r.winner === (1 - r.searchSeat)
    if (won) wins++; else if (lost) losses++; else draws++
    crashes += r.crashes; decisions += r.decisions; searchMs += r.searchMs
    const winnerName = r.winner === null ? 'none' : won ? 'newbot' : 'oldbot'
    console.log(`game ${r.i + 1}: ${won ? 'W' : lost ? 'L' : 'D'} winner=${winnerName}(seat${r.winner}) [mirror: ${r.deckName}] turns=${r.turns} crashes=${r.crashes} avgMs=${(r.searchMs / Math.max(1, r.decisions)).toFixed(0)} maxMs=${r.maxMs} wall=${(r.wallMs / 1000).toFixed(1)}s`)
  }
  const n = results.length
  console.log(`\nSEARCH BOT: ${wins}W ${losses}L ${draws}D over ${n}  (${((wins / Math.max(1, n)) * 100).toFixed(0)}% win)  |  crashes=${crashes}  |  avg decision ${(searchMs / Math.max(1, decisions)).toFixed(0)}ms`)
  if (crashes > 0) { console.error('FAIL: search bot produced illegal/crashing actions'); process.exit(1) }
}

// ── worker mode: play the given game indices, stream one RESULT line each ──
const workerArg = process.argv.indexOf('--worker')
if (workerArg >= 0) {
  const indices = process.argv[workerArg + 1].split(',').map(Number)
  for (const i of indices) console.log('RESULT ' + JSON.stringify(playOne(i, VERBOSE)))
  process.exit(0)
}

// ── coordinator ──
const GAMES = Number(process.argv[2] ?? 4)
const CONCURRENCY = Math.max(1, Math.min(GAMES, Number(process.argv[3] ?? Math.max(1, cpus().length - 1))))

if (GAMES === 1 || CONCURRENCY === 1) {
  const results: GameOut[] = []
  for (let i = 0; i < GAMES; i++) results.push(playOne(i, GAMES === 1))
  report(results)
} else {
  // round-robin the indices into CONCURRENCY buckets (balances long/short games)
  const buckets: number[][] = Array.from({ length: CONCURRENCY }, () => [])
  for (let i = 0; i < GAMES; i++) buckets[i % CONCURRENCY].push(i)
  console.log(`running ${GAMES} games across ${CONCURRENCY} workers  (maxTurn=${MAXTURN}, searchMs=${SEARCH_MS})…`)
  const t0 = Date.now()
  const results: GameOut[] = []
  let done = 0
  Promise.all(
    buckets.filter((b) => b.length).map(
      (bucket) =>
        new Promise<void>((resolve) => {
          const child = spawn('npx', ['tsx', process.argv[1], '--worker', bucket.join(',')], {
            shell: true,
            env: {
              ...process.env,
              SMOKE_MAXTURN: String(MAXTURN),
              SMOKE_SEARCH_MS: String(SEARCH_MS),
              SMOKE_VERBOSE: VERBOSE ? '1' : '',
              // bigger heap so heavy cloning doesn't OOM; strip any inherited --trace-gc that spams stderr
              NODE_OPTIONS: `${(process.env.NODE_OPTIONS ?? '').replace(/--trace-gc\S*/g, '')} --max-old-space-size=2048`.trim(),
            },
          })
          let buf = ''
          child.stdout.on('data', (d) => {
            buf += d.toString()
            let nl
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
              if (line.startsWith('RESULT ')) {
                const r: GameOut = JSON.parse(line.slice(7)); results.push(r); done++
                const won = r.winner === r.searchSeat, lost = r.winner === (1 - r.searchSeat)
                const winnerName = r.winner === null ? 'none' : won ? 'newbot' : 'oldbot'
                console.log(`[${done}/${GAMES}] game ${r.i + 1}: ${won ? 'W' : lost ? 'L' : r.winner === null ? 'D(cap)' : 'D'} winner=${winnerName}(seat${r.winner}) [mirror: ${r.deckName}] turns=${r.turns} crashes=${r.crashes} avgMs=${(r.searchMs / Math.max(1, r.decisions)).toFixed(0)} maxMs=${r.maxMs} wall=${(r.wallMs / 1000).toFixed(1)}s`)
              } else if (line.trim()) {
                process.stdout.write(line + '\n') // live pass-through of the per-turn rows
              }
            }
          })
          // pass worker stderr through, but drop GC / deprecation spam so CRASH traces stay visible
          child.stderr.on('data', (d) => {
            for (const line of d.toString().split('\n')) {
              if (line && !/Scavenge|Mark-Compact|allocation failure|DeprecationWarning|trace-deprecation|pooled:/.test(line)) {
                process.stderr.write(line + '\n')
              }
            }
          })
          child.on('close', () => resolve())
        }),
    ),
  ).then(() => {
    console.log(`\n(wall ${((Date.now() - t0) / 1000).toFixed(1)}s across ${CONCURRENCY} workers)\n`)
    report(results)
  })
}
