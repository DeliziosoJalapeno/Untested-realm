// Plays one Thinking-vs-Thinking game (the site's search bot, worker config) and streams the engine's own
// game log as it happens — turn headers with life/mana/board, every log line, and each planning search.
//
//   npx tsx scripts/live_game.ts [--a 4] [--b 12] [--seed 7] [--budget 30000] > live.log
//   Get-Content -Wait live.log        (watch it from another terminal)

import { createGame, applyAction, starterDecks, type GameState, type PlayerId, type Action } from '../packages/shared/src'
import { botNeedsToAct } from '../packages/client/src/bot'
import { searchBotAction, DEFAULT_SEARCH } from '../packages/client/src/bot_search'

const argv = process.argv.slice(2)
const arg = (n: string, d: number) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? Number(argv[i + 1]) : d }
const A = arg('a', 4), B = arg('b', 12), SEED = arg('seed', 7), BUDGET = arg('budget', 30000)

let search = ''
process.env.SEARCH_DEBUG = '1'
const origError = console.error
console.error = (...a: unknown[]) => {
  const m = typeof a[0] === 'string' && /plan depth=(\d+) nodes=(\d+) took=(\d+)ms/.exec(a[0])
  if (m) { if (+m[2] > 0) search = `🧠 thought ${(+m[3] / 1000).toFixed(1)}s, ${m[2]} positions, plan ${m[1]} deep`; return }
  origError(...a)
}

const decks = [starterDecks[A], starterDecks[B]] as const
const g = createGame([decks[0], decks[1]], [decks[0].name, decks[1].name], SEED, 0)
const name = (p: PlayerId | null) => (p === null ? 'Game' : `P${p}`)
const say = (s: string) => console.log(s)
const board = (s: GameState, p: PlayerId) => {
  const pl = s.players[p], av = s.units[pl.avatarUnitId]
  const minions = Object.values(s.units).filter((u) => u.controller === p && !u.isAvatar).length
  const sites = Object.values(s.sites).filter((x) => x.controller === p && !x.isRubble).length
  return `P${p} ${decks[p].name.slice(0, 28)}: life ${av ? (av.life ?? '?') : '-'} | ${sites} sites | ${minions} minions | hand ${pl.hand.length}`
}

say(`=== ${decks[0].name}  vs  ${decks[1].name}  (seed ${SEED}, Thinking bot both seats, ${BUDGET / 1000}s budget) ===`)
let logSeen = 0
let lastTurn = -1
let steps = 0
while (g.phase !== 'over' && steps++ < 2000) {
  if (g.turn !== lastTurn) {
    lastTurn = g.turn
    say(`\n── Turn ${g.turn} · P${g.activePlayer} to play ──`)
    say(`   ${board(g, 0)}\n   ${board(g, 1)}`)
  }
  const seat: PlayerId | null = botNeedsToAct(g, 0) ? 0 : botNeedsToAct(g, 1) ? 1 : null
  if (seat === null) { if (!applyAction(g, g.activePlayer, { t: 'endTurn' }).ok) break; continue }
  search = ''
  let action: Action
  try { action = searchBotAction(g, seat, { ...DEFAULT_SEARCH, timeBudgetMs: BUDGET }) } catch (e: any) { say(`   ⚠ bot threw: ${e?.message ?? e}`); action = { t: 'endTurn' } }
  if (search) say(`   ${search}`)
  const res = applyAction(g, seat, action)
  if (!res.ok) {
    say(`   ⚠ illegal ${action.t}: ${res.error}`)
    const fb: Action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
    if (!applyAction(g, seat, fb).ok) applyAction(g, seat, { t: 'concede' })
  }
  for (; logSeen < g.log.length; logSeen++) {
    const e = g.log[logSeen]
    say(`   [${name(e.player)}] ${e.msg}`)
  }
}
say(`\n=== ${g.phase === 'over' ? `WINNER: P${g.winner} ${g.winner !== null ? decks[g.winner].name : ''}` : 'stopped (action cap)'} after ${g.turn} turns ===`)
say(`   ${board(g, 0)}\n   ${board(g, 1)}`)
