// Were Claude's departures from the engine's move good ones? Replays a saved Claude game; at the first
// point of each computer turn where the move played differs from what the Thinking bot would play, both
// turns are finished (Claude's as recorded, the engine's by the engine) and the game is then played out
// many times by the fast bot for both sides, over reshuffles of the unseen cards.
//   npx tsx scripts/fvl/claude_vs_engine.ts <saved game.json> [samples=30]
// Prints one JSON line per point and a total.
import { readFileSync } from 'node:fs'
import { applyAction, cloneState, evaluate, DEFAULT_WEIGHTS, type GameState, type PlayerId, type Action } from '../../packages/shared/src'
import '../../packages/shared/src/cards/scripts/index'
import { botAction, botNeedsToAct, botActionKey } from '../../packages/client/src/bot'
import { searchBotAction, DEFAULT_SEARCH, resetSearchState, reshuffled } from '../../packages/client/src/bot_search'
import { claudeDefers } from '../../packages/client/src/claude_bot'
import { replayInitialState } from '../../packages/client/src/replay'

const [file, nArg] = process.argv.slice(2)
const N = Number(nArg ?? 30)
const saved = JSON.parse(readFileSync(file, 'utf8'))
const r = saved.replay
const BOT = 1 as PlayerId
const cfg = { ...DEFAULT_SEARCH, timeBudgetMs: 400 }
const ok = (s: GameState, seat: PlayerId, a: Action) => { try { return applyAction(s, seat, a).ok } catch { return false } }
const engine = (s: GameState) => { try { return searchBotAction(s, BOT, cfg) } catch { return botAction(s, BOT) } }

/** finish the computer's current turn with the Thinking bot (the human seat answers with the fast bot) */
function finishTurn(s: GameState, turn: number) {
  let guard = 0
  while (s.winner === null && s.phase !== 'over' && s.turn === turn && guard++ < 200) {
    const seat = ([BOT, 0] as PlayerId[]).find((x) => botNeedsToAct(s, x)); if (seat === undefined) break
    const a = seat === BOT ? engine(s) : botAction(s, seat)
    if (!ok(s, seat, a) && !ok(s, seat, botAction(s, seat))) break
  }
}
/** the rest of the game, fast bot on both sides; 1 = the computer wins */
function playOn(s: GameState): [number, number] {
  let n = 0
  const horizon = s.turn + 4
  let score: number | null = null
  const mark = () => { score = s.winner === BOT ? 3000 : s.winner !== null ? -3000 : Math.max(-3000, Math.min(3000, evaluate(s, BOT, DEFAULT_WEIGHTS))) }
  while (s.winner === null && s.phase !== 'over' && n++ < 5000 && s.turn <= 70) {
    if (score === null && s.turn >= horizon) mark()
    const seat = ([0, 1] as PlayerId[]).find((x) => botNeedsToAct(s, x)); if (seat === undefined) break
    if (!ok(s, seat, botAction(s, seat))) break
  }
  if (score === null) mark()
  return [s.winner === BOT ? 1 : s.winner === null ? 0.5 : 0, score!]
}

const g = replayInitialState(r)
const points: { turn: number; state: GameState; rest: { seat: PlayerId; action: Action }[]; claude: string; engine: string }[] = []
let lastTurn = -1
for (let i = 0; i < r.actions.length; i++) {
  const { seat, action } = r.actions[i]
  if (seat === BOT && g.phase !== 'mulligan' && g.turn !== lastTurn && botNeedsToAct(g, BOT) && !claudeDefers(g)) {
    resetSearchState()
    const e = engine(cloneState(g))
    if (botActionKey(e) !== botActionKey(action)) {
      lastTurn = g.turn
      const rest: { seat: PlayerId; action: Action }[] = []
      const probe = cloneState(g)
      for (let j = i; j < r.actions.length && probe.turn === g.turn; j++) { rest.push(r.actions[j]); if (!ok(probe, r.actions[j].seat, r.actions[j].action)) break }
      points.push({ turn: g.turn, state: cloneState(g), rest, claude: JSON.stringify(action).slice(0, 90), engine: JSON.stringify(e).slice(0, 90) })
    }
  }
  if (!ok(g, seat, action)) { console.error('replay refused at', i); break }
}

let seed = 12345
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
let totC = 0, totE = 0, games = 0, totCs = 0, totEs = 0
for (const p of points) {
  let c = 0, e = 0, cs = 0, es = 0
  for (let k = 0; k < N; k++) {
    const world = k === 0 ? cloneState(p.state) : reshuffled(p.state, BOT, rand)
    const a = cloneState(world)
    for (const step of p.rest) { if (a.turn !== p.turn || !ok(a, step.seat, step.action)) break }
    finishTurn(a, p.turn)
    { const [w, sc] = playOn(a); c += w; cs += sc }
    const b = cloneState(world)
    resetSearchState()
    finishTurn(b, p.turn)
    { const [w, sc] = playOn(b); e += w; es += sc }
  }
  totC += c; totE += e; games += N; totCs += cs; totEs += es
  console.log(JSON.stringify({ turn: p.turn, claudeWin: +(c / N).toFixed(2), engineWin: +(e / N).toFixed(2), claudeScore: Math.round(cs / N), engineScore: Math.round(es / N), claude: p.claude, engine: p.engine }))
}
console.log(JSON.stringify({ file: file.split('/').pop(), points: points.length, samples: N, claudeWin: +(totC / Math.max(1, games)).toFixed(3), engineWin: +(totE / Math.max(1, games)).toFixed(3), claudeScore: Math.round(totCs / Math.max(1, games)), engineScore: Math.round(totEs / Math.max(1, games)) }))
