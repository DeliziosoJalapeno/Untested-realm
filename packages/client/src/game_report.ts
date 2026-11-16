// The engine report: what a finished game looks like to the rules engine and the search bot, worked out
// from its replay in the browser when the game ends. It is saved with the game (see archiveLocalGame in
// App.tsx) and is the factual basis of Claude's written review.
//
//   rows    one line per turn: sites, life, hand, units and power on each side, and the position's
//           score from the computer's seat
//   swings  the two-turn stretches (a move and its reply) where that score moved the most
//   checks  at the worst swings against the computer: what the search engine would play at the start of
//           the computer's turn there today, next to what was played
import { applyAction, evaluate, avatarOf, effAttack, type GameState, type PlayerId, type Action } from '@sorcery/shared'
import { replayInitialState, type ReplayRecord } from './replay'
import { searchBotAction, resetSearchState, DEFAULT_SEARCH } from './bot_search'
import { describeAction } from './claude_bot'

export interface TurnRow {
  turn: number
  player: PlayerId
  sites: [number, number]
  life: [number, number]
  hand: [number, number]
  units: [number, number]
  power: [number, number]
  /** the position after this turn, scored from the computer's seat (hundreds ≈ decisive) */
  score: number
}
export interface Swing {
  turn: number
  player: PlayerId
  /** change in the computer's score over this turn and the one before it (one move and its reply; a
   *  single turn's change mostly shows whose turn it is): negative is bad for the computer */
  change: number
  log: string[]
}
export interface Check { turn: number; played: string[]; engine: string; same: boolean }
export interface GameReport {
  version: 1
  botSeat: PlayerId
  winner: PlayerId | null
  turns: number
  firstPlayer: PlayerId
  rows: TurnRow[]
  swings: Swing[]
  checks: Check[]
  /** actions the engine refused on replay: should be 0, anything else is a recording or rules problem */
  rejected: number
}

const CAP = 1500 // a decided game scores ±100000: keep it on the scale of the rest
const clamp = (v: number) => Math.max(-CAP, Math.min(CAP, Math.round(v)))
const pause = () => new Promise<void>((r) => setTimeout(r, 0))

function row(g: GameState, turn: number, player: PlayerId, botSeat: PlayerId): TurnRow {
  const per = <T,>(f: (p: PlayerId) => T): [T, T] => [f(0), f(1)]
  const minions = (p: PlayerId) => Object.values(g.units).filter((u) => u.controller === p && !u.isAvatar && !u.carriedBy)
  return {
    turn, player,
    sites: per((p) => Object.values(g.sites).filter((s) => s.controller === p && !s.isRubble).length),
    life: per((p) => avatarOf(g, p)?.life ?? 0),
    hand: per((p) => g.players[p].hand.length),
    units: per((p) => minions(p).length),
    power: per((p) => minions(p).reduce((n, u) => n + effAttack(g, u), 0)),
    score: clamp(evaluate(g, botSeat)),
  }
}

/** Build the report. `recheckMs` is the search time per re-checked decision (0 turns the checks off). */
export async function buildReport(r: ReplayRecord, botSeat: PlayerId, opts: { recheckMs?: number; rechecks?: number; swings?: number } = {}): Promise<GameReport> {
  const g = replayInitialState(r)
  const rows: TurnRow[] = []
  const turnStart = new Map<number, number>() // turn → index of its first action
  const played = new Map<number, string[]>() // turn → what its player did, in words
  let rejected = 0
  let turn = g.turn, active = g.activePlayer
  for (let i = 0; i < r.actions.length; i++) {
    const { seat, action } = r.actions[i]
    if (g.phase === 'main' && !turnStart.has(g.turn)) turnStart.set(g.turn, i)
    if (g.phase === 'main' && seat === g.activePlayer && action.t !== 'prompt') {
      const list = played.get(g.turn) ?? []
      if (list.length < 12) { try { list.push(describeAction(g, seat, action)) } catch { list.push(action.t) } }
      played.set(g.turn, list)
    }
    let ok = false
    try { ok = applyAction(g, seat, action).ok } catch { ok = false }
    if (!ok) rejected++
    if (g.turn !== turn || g.phase === 'over') {
      if (g.phase !== 'mulligan' && turn > 0) rows.push(row(g, turn, active, botSeat))
      turn = g.turn; active = g.activePlayer
      if (g.phase === 'over') break
    }
    if (i % 60 === 59) await pause()
  }
  if (g.phase !== 'over' && (!rows.length || rows[rows.length - 1].turn !== turn)) rows.push(row(g, turn, active, botSeat))

  // the biggest moves of the score, either way
  const logOf = (t: number) => g.log.filter((l) => l.turn === t - 1 || l.turn === t).map((l) => l.msg).slice(0, 24)
  const swings: Swing[] = rows
    .map((x, i) => ({ turn: x.turn, player: x.player, change: i >= 2 ? x.score - rows[i - 2].score : 0, log: [] as string[] }))
    .filter((s) => Math.abs(s.change) >= 60)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .reduce<Swing[]>((keep, s) => (keep.length < (opts.swings ?? 6) && !keep.some((k) => Math.abs(k.turn - s.turn) === 1) ? [...keep, s] : keep), []) // not the same moment twice
    .sort((a, b) => a.turn - b.turn)
  for (const s of swings) s.log = logOf(s.turn)

  // at the worst swings against the computer: what would the search play at the start of its turn there?
  const checks: Check[] = []
  const ms = opts.recheckMs ?? 400
  if (ms > 0) {
    const worst = swings.filter((s) => s.change < 0).sort((a, b) => a.change - b.change)
    const botTurns = [...new Set(worst.map((s) => (s.player === botSeat ? s.turn - 2 : s.turn - 1)))].filter((t) => turnStart.has(t)).slice(0, opts.rechecks ?? 3)
    for (const t of botTurns.sort((a, b) => a - b)) {
      await pause()
      try {
        const at = replayInitialState(r)
        for (let i = 0; i < turnStart.get(t)!; i++) { try { applyAction(at, r.actions[i].seat, r.actions[i].action) } catch { /* as in the game */ } }
        if (at.activePlayer !== botSeat || at.phase !== 'main' || at.prompts.length) continue
        resetSearchState()
        const a: Action = searchBotAction(at, botSeat, { ...DEFAULT_SEARCH, timeBudgetMs: ms })
        const engine = describeAction(at, botSeat, a)
        const did = played.get(t) ?? []
        checks.push({ turn: t, played: did, engine, same: did[0] === engine })
      } catch { /* a position the search can't take: leave it out */ }
    }
    resetSearchState()
  }
  return { version: 1, botSeat, winner: g.winner ?? null, turns: g.turn, firstPlayer: r.firstPlayer, rows, swings, checks, rejected }
}

/** The report and the game log as one block of text: what Claude's written review is asked to read. */
export function reportText(r: ReplayRecord, rep: GameReport, log: string[], extra?: { difficulty?: string | null; plans?: { turn: number; plan: string }[] }): string {
  const who = (p: PlayerId) => (p === rep.botSeat ? 'Computer' : 'You')
  const human = (1 - rep.botSeat) as PlayerId
  const out: string[] = []
  out.push(`GAME: You (${r.decks[human]?.name ?? 'deck'}) against the Computer (${r.decks[rep.botSeat]?.name ?? 'deck'})${extra?.difficulty ? `, computer level: ${extra.difficulty}` : ''}.`)
  out.push(`${who(rep.firstPlayer)} went first. ${rep.winner === null ? 'The game was not finished.' : `${who(rep.winner)} won on turn ${rep.turns}.`}`)
  out.push('', 'TEMPO BY TURN (You / Computer; "score" is the position from the Computer\'s seat, higher is better for it):')
  for (const x of rows(rep)) out.push(x)
  if (rep.swings.length) {
    out.push('', 'BIGGEST SWINGS (change in the Computer\'s score over two turns: a move and the reply to it):')
    for (const s of rep.swings) out.push(`  Turns ${s.turn - 1}-${s.turn} (ending on ${who(s.player)}'s turn): ${s.change > 0 ? '+' : ''}${s.change}. ${s.log.join(' | ')}`)
  }
  if (rep.checks.length) {
    out.push('', 'ENGINE RE-CHECK of the Computer\'s turns before its worst swings (what the search engine would start with today):')
    for (const c of rep.checks) out.push(`  Turn ${c.turn}: played ${c.played.slice(0, 6).join('; ') || '(nothing)'}. Engine: ${c.engine}${c.same ? ' (same first move)' : ''}`)
  }
  if (extra?.plans?.length) {
    out.push('', 'THE COMPUTER\'S STATED PLANS (Claude opponent):')
    for (const p of extra.plans.slice(0, 40)) out.push(`  Turn ${p.turn}: ${p.plan.slice(0, 220)}`)
  }
  if (rep.rejected) out.push('', `NOTE: ${rep.rejected} recorded action(s) were refused by the engine on replay.`)
  out.push('', 'GAME LOG:')
  let size = out.join('\n').length
  const lines: string[] = []
  for (const l of log) { if (size + l.length > 60_000) { lines.push('…(log cut)'); break } lines.push(l); size += l.length + 1 }
  return out.concat(lines).join('\n')

  function rows(rp: GameReport): string[] {
    const pair = (v: [number, number]) => `${v[human]}/${v[rp.botSeat]}`
    return rp.rows.map((x) => `  T${x.turn} ${who(x.player)}: sites ${pair(x.sites)}, life ${pair(x.life)}, hand ${pair(x.hand)}, minions ${pair(x.units)} (power ${pair(x.power)}), score ${x.score}`)
  }
}
