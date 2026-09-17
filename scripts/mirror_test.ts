// Toggleable PARALLEL mirror test for the search bot (search vs procedural, same deck, both seats).
// Games are independent, so they're fanned out across worker processes. Durable synchronous log (no
// buffered blackout) + per-game life margins & site counts + an aggression metric (avg PROC life left).
//
//   npx tsx scripts/mirror_test.ts [games] [searchMs] [procDraws 0|1] [deckFilter] [workers]
//   e.g.  npx tsx scripts/mirror_test.ts 8 5000 0 Interrogator
//         npx tsx scripts/mirror_test.ts 8 5000 1 Interrogator        # procedural draw-pile ON
//         npx tsx scripts/mirror_test.ts 12 3000 0 all 6              # all decks, 6 workers
// Env: MT_GAMES, MT_MS, MT_PROC_DRAWS, MT_DECK, MT_WORKERS.  Watch: Get-Content -Wait mirror_test.log
import { spawn } from 'node:child_process'
import { cpus } from 'node:os'
import { appendFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createGame, applyAction, avatarOf, canCast, type Action, type GameState, type PlayerId, type DeckList } from '../packages/shared/src'
import { getCard } from '../packages/shared/src/cards/db'
import { communityDecks } from '../packages/shared/src/cards/communityDecks'
import { botAction, botNeedsToAct } from '../packages/client/src/bot'
import { searchBotAction, searchBotNeedsToAct, DEFAULT_SEARCH } from '../packages/client/src/bot_search'

const GAMES = Number(process.env.MT_GAMES ?? process.argv[2] ?? 8)
const MS = Number(process.env.MT_MS ?? process.argv[3] ?? 5000)
const PROC_DRAWS = String(process.env.MT_PROC_DRAWS ?? process.argv[4] ?? '0') === '1'
const DECK_FILTER = String(process.env.MT_DECK ?? process.argv[5] ?? 'Interrogator')
const MAXTURN = Number(process.env.MT_MAXTURN ?? 60)
const TURN_WALL_CAP = Number(process.env.MT_TURN_CAP_MS ?? 120000) // if one turn burns this much wall time, hand the REST of it to the procedural bot to finish

const pool: DeckList[] = DECK_FILTER.toLowerCase() === 'all'
  ? communityDecks.filter((d) => !/test|x[_ ]?test/i.test(d.name))
  : communityDecks.filter((d) => d.name.toLowerCase().includes(DECK_FILTER.toLowerCase()))

type BotFn = (g: GameState, s: PlayerId) => Action
const sitesOf = (g: GameState, p: PlayerId) => Object.values(g.sites).filter((s) => s.controller === p && !s.isRubble).length
/** hand composition: how many SPELLS vs SITES a player holds, e.g. "3sp+2si". */
const handSplit = (g: GameState, p: PlayerId) => {
  const types = g.players[p].hand.map((id) => getCard(g.cards[id].name).type)
  return `${types.filter((t) => t !== 'Site').length}sp+${types.filter((t) => t === 'Site').length}si`
}

/** how many MINIONS in `p`'s hand are actually castable right now (affordable + threshold + timing). */
const castableMinions = (g: GameState, p: PlayerId) =>
  g.players[p].hand.filter((id) => getCard(g.cards[id].name).type === 'Minion' && canCast(g, p, id, g.players[p].avatarUnitId).ok).length
/** how many NON-minion, non-site spells (Magic/Artifact/Aura) in `p`'s hand are castable right now. */
const castableOther = (g: GameState, p: PlayerId) =>
  g.players[p].hand.filter((id) => { const t = getCard(g.cards[id].name).type; return t !== 'Minion' && t !== 'Site' && t !== 'Avatar' && canCast(g, p, id, g.players[p].avatarUnitId).ok }).length

/** does this action involve `av` (the avatar unit id)? and a short description of it. */
function avatarAction(g: GameState, a: Action, av: string): string | null {
  const x = a as { t: string; unitId?: string; sourceId?: string; casterId?: string; cardId?: string; mode?: string; path?: { x: number; y: number }[]; attack?: unknown }
  if (x.t === 'avatarSite') return x.mode === 'draw' ? 'draw-site' : `play-site ${g.cards[x.cardId ?? '']?.name ?? ''}`
  if (x.t === 'moveAttack' && x.unitId === av) { const u = g.units[av]; const d = x.path?.length ? x.path[x.path.length - 1] : u; return `move (${u?.x},${u?.y})→(${d?.x},${d?.y})${x.attack ? ' +attack' : ''}` }
  if (x.t === 'activate' && x.sourceId === av) return `activate ${(a as { ability?: string }).ability ?? ''}`
  return null // avatar casts are expected (it's a spellcaster) — not logged
}
interface GameOut { i: number; winner: PlayerId | null; searchSeat: PlayerId; deckName: string; myLife: number; foeLife: number; mySites: number; myHand: string; castLeft: number; turns: number; crashes: number; wallMs: number }

const ts = () => new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm wall-clock, to spot stalls/gaps

function playOne(i: number): GameOut {
  const searchSeat: PlayerId = (i % 2) as PlayerId
  const deck = pool[Math.floor(i / 2) % pool.length]
  const searchFn: BotFn = (g, s) => searchBotAction(g, s, { ...DEFAULT_SEARCH, timeBudgetMs: MS, proceduralDraws: PROC_DRAWS })
  const g = createGame([deck, deck], ['SRCH', 'PROC'], (999 + i * 7919) >>> 0, (i % 2) as PlayerId)
  const bots: [BotFn, BotFn] = searchSeat === 0 ? [searchFn, botAction] : [botAction, searchFn]
  const needs = searchSeat === 0 ? [searchBotNeedsToAct, botNeedsToAct] : [botNeedsToAct, searchBotNeedsToAct]
  let crashes = 0, lastTurn = -1, turnActs = 0, nonMinPlayed = 0, turnWallStart = Date.now(), procFallback = false // per-turn wall clock + "hand rest of turn to proc" flag
  const t0 = Date.now()
  const foeSeat0 = (1 - searchSeat) as PlayerId
  while (g.phase !== 'over' && g.turn <= MAXTURN) {
    if (g.turn !== lastTurn) {
      lastTurn = g.turn; turnActs = 0; turnWallStart = Date.now(); procFallback = false
      // per-turn trace row (streamed to the coordinator's durable log)
      console.log(`${ts()} game ${i + 1} T${g.turn} ${g.activePlayer === searchSeat ? 'SRCH' : 'PROC'}  life SRCH ${avatarOf(g, searchSeat).life ?? 0}/PROC ${avatarOf(g, foeSeat0).life ?? 0}  sites ${sitesOf(g, searchSeat)}/${sitesOf(g, foeSeat0)}  hand SRCH ${handSplit(g, searchSeat)}/PROC ${handSplit(g, foeSeat0)}  castMinS ${castableMinions(g, searchSeat)} castOthS ${castableOther(g, searchSeat)}  nonMinPlayed ${nonMinPlayed}`)
    }
    if (!needs[0](g, 0) && !needs[1](g, 1)) { if (!applyAction(g, g.activePlayer, { t: 'endTurn' }).ok) break; continue }
    const seat: PlayerId = needs[0](g, 0) ? 0 : 1
    if (++turnActs > 400) { applyAction(g, seat, { t: 'endTurn' }); continue }
    // wall-clock cap: a turn burning this much time is stuck (re-plan loop / repeatable action) — hand the
    // REST of the turn to the fast procedural bot, which will play sensibly and end it.
    if (seat === searchSeat && !procFallback && Date.now() - turnWallStart > TURN_WALL_CAP) {
      procFallback = true
      console.log(`${ts()} game ${i + 1} T${g.turn}   WALL-CAP: turn burned >${TURN_WALL_CAP}ms after ${turnActs} acts — handing rest of turn to PROC bot`)
    }
    let action: Action
    const d0 = Date.now()
    const botFn: BotFn = seat === searchSeat && procFallback ? botAction : bots[seat] // proc finishes a stuck turn
    try { action = botFn(g, seat) } catch (e) {
      if (seat === searchSeat) { crashes++; console.error('  threw:', (e as Error).message) }
      action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
    }
    const dms = Date.now() - d0
    // log every SRCH decision that took real time — especially TIMEOUTs (≥ budget). A stuck turn shows up
    // here as an ACT row every ~budget ms (re-planning each action) vs. a long GAP (hung on one decision).
    if (seat === searchSeat && dms >= 1000) {
      const desc = action.t === 'castSpell' ? 'cast:' + (g.cards[(action as { cardId?: string }).cardId ?? '']?.name ?? '') : (action as { t: string }).t
      console.log(`${ts()} game ${i + 1} T${g.turn}   ACT ${dms}ms${dms >= MS ? ' <TIMEOUT>' : ''}: ${desc}`)
    }
    if (seat === searchSeat) { const desc = avatarAction(g, action, g.players[searchSeat].avatarUnitId); if (desc) console.log(`${ts()} game ${i + 1} T${g.turn}   AV: ${desc}`) }
    // pinpoint "why unplayed": if SRCH ends its turn with CASTABLE spells still in hand, it CHOSE not to
    // play them (a search/eval issue, not affordability) — flag it.
    if (seat === searchSeat && action.t === 'endTurn') { const m = castableMinions(g, searchSeat), o = castableOther(g, searchSeat); if (m + o > 0) console.log(`${ts()} game ${i + 1} T${g.turn}   IDLE-CAST: ended turn with ${m}m+${o}o CASTABLE unplayed`) }
    // capture whether SRCH is about to play a NON-minion, non-site spell (card still in hand here)
    const castType = seat === searchSeat && action.t === 'castSpell' ? getCard(g.cards[(action as { cardId?: string }).cardId ?? '']?.name ?? '')?.type : undefined
    const res = applyAction(g, seat, action)
    if (res.ok && castType && castType !== 'Minion' && castType !== 'Site') nonMinPlayed++
    if (!res.ok) {
      if (seat === searchSeat) { crashes++; console.error('  illegal:', res.error) }
      const fb: Action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
      if (!applyAction(g, seat, fb).ok) { applyAction(g, seat, { t: 'concede' }); break }
    }
  }
  const foeSeat = (1 - searchSeat) as PlayerId
  return { i, winner: g.phase === 'over' ? g.winner : null, searchSeat, deckName: deck.name, myLife: avatarOf(g, searchSeat).life ?? 0, foeLife: avatarOf(g, foeSeat).life ?? 0, mySites: sitesOf(g, searchSeat), myHand: handSplit(g, searchSeat), castLeft: castableMinions(g, searchSeat) + castableOther(g, searchSeat), turns: g.turn, crashes, wallMs: Date.now() - t0 }
}

const fmt = (r: GameOut) => {
  const won = r.winner === r.searchSeat, lost = r.winner === (1 - r.searchSeat)
  return `game ${r.i + 1} (SRCH=seat${r.searchSeat}): ${won ? 'W' : lost ? 'L' : 'D'}  life SRCH ${r.myLife}/PROC ${r.foeLife}  sites ${r.mySites}  hand ${r.myHand} (castable-left ${r.castLeft})  turns ${r.turns}  ${(r.wallMs / 1000).toFixed(0)}s  [${r.deckName.slice(0, 26)}]`
}

// ── worker mode ──
const wArg = process.argv.indexOf('--worker')
if (wArg >= 0) {
  for (const i of process.argv[wArg + 1].split(',').map(Number)) console.log('RESULT ' + JSON.stringify(playOne(i)))
  process.exit(0)
}

// ── coordinator ──
const LOG = resolve(process.cwd(), 'mirror_test.log')
const log = (s: string) => { appendFileSync(LOG, s + '\n'); process.stdout.write(s + '\n') }
writeFileSync(LOG, '')
if (!pool.length) { log(`no deck matches "${DECK_FILTER}"`); process.exit(1) }
const CONC = Math.max(1, Math.min(GAMES, Number(process.env.MT_WORKERS ?? process.argv[6] ?? Math.min(6, Math.max(1, cpus().length - 2)))))
log(`=== MIRROR TEST  games=${GAMES}  searchMs=${MS}  proceduralDraws=${PROC_DRAWS ? 'ON' : 'off'}  deck="${DECK_FILTER}" (${pool.length})  workers=${CONC} ===`)

const buckets: number[][] = Array.from({ length: CONC }, () => [])
for (let i = 0; i < GAMES; i++) buckets[i % CONC].push(i)
const results: GameOut[] = []
let done = 0
const t0 = Date.now()
Promise.all(
  buckets.filter((b) => b.length).map((bucket) => new Promise<void>((res) => {
    const child = spawn('npx', ['tsx', process.argv[1], '--worker', bucket.join(',')], {
      shell: true,
      env: { ...process.env, MT_GAMES: String(GAMES), MT_MS: String(MS), MT_PROC_DRAWS: PROC_DRAWS ? '1' : '0', MT_DECK: DECK_FILTER, NODE_OPTIONS: `${(process.env.NODE_OPTIONS ?? '').replace(/--trace-gc\S*/g, '')} --max-old-space-size=2048`.trim() },
    })
    let buf = ''
    child.stdout.on('data', (d) => {
      buf += d.toString()
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
        if (line.startsWith('RESULT ')) { const r: GameOut = JSON.parse(line.slice(7)); results.push(r); done++; log(`${ts()} [${done}/${GAMES}] ${fmt(r)}`) }
        else if (line.trim()) log(line) // per-turn trace rows streamed from the worker
      }
    })
    child.stderr.on('data', (d) => { for (const line of d.toString().split('\n')) if (line && !/Scavenge|Mark-Compact|allocation failure|DeprecationWarning|trace-deprecation/.test(line)) process.stderr.write(line + '\n') })
    child.on('close', () => res())
  })),
).then(() => {
  const wins = results.filter((r) => r.winner === r.searchSeat).length
  const losses = results.filter((r) => r.winner === (1 - r.searchSeat)).length
  const draws = results.length - wins - losses
  const crashes = results.reduce((a, r) => a + r.crashes, 0)
  const foeLife = results.reduce((a, r) => a + r.foeLife, 0) / Math.max(1, results.length)
  const sites = results.reduce((a, r) => a + r.mySites, 0) / Math.max(1, results.length)
  log(`\n(wall ${((Date.now() - t0) / 1000).toFixed(0)}s across ${CONC} workers)`)
  log(`=== ${wins}W ${losses}L ${draws}D over ${results.length}  (${((wins / Math.max(1, results.length)) * 100).toFixed(0)}% win)  crashes=${crashes}  |  avg PROC life left ${foeLife.toFixed(1)} (lower = more aggressive)  |  avg SRCH sites ${sites.toFixed(1)} ===`)
})
