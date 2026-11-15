// The "Claude" opponent: the computer's decisions are made by Claude (Anthropic's model), through
// this app's own server (which holds the API key — see packages/server/src/claudeBot.ts).
//
// How a decision is made:
//   1. the position is described in words FROM THE BOT'S SEAT (hidden information stays hidden: it
//      is described from the same "fair view" the search bot plans on);
//   2. every legal move is listed and numbered (the engine's own move generator), each with the
//      evaluation function's opinion of the resulting position, and the search bot's own choice is
//      pointed out;
//   3. Claude answers with an ordered list of move numbers for the rest of the turn, plus a one-line
//      plan. The moves are played one at a time; a queued move is only played if that exact action is
//      still legal and nothing unexpected happened — otherwise Claude is asked again.
// If Claude can't be reached, answers nonsense, or takes too long, the search bot's move is played.
import {
  expandActions, evaluate, DEFAULT_WEIGHTS, getCard, affinity, effAttack, effKeywords, isDisabled, opponent,
  GRID_W, GRID_H, type Action, type GameState, type PlayerId, type UnitState,
} from '@sorcery/shared'
import { fairView } from './bot_search'
import { botActionKey } from './bot'

export interface ClaudeCandidate { action: Action; text: string; delta: number }
export interface ClaudeRequest { position: string; candidates: string[]; notes: string }
export interface ClaudeReply { picks: number[]; plan: string; model?: string; ms?: number }
export interface ClaudeStatus { enabled: boolean; model: string | null; reason?: string }

// ---------- naming things ----------
const COLS = 'abcde'
/** squares are named from the BOT's side of the table: a1 is its own back-left corner */
function sqName(me: PlayerId, x: number, y: number): string {
  const fx = me === 0 ? x : GRID_W - 1 - x, fy = me === 0 ? y : GRID_H - 1 - y
  return `${COLS[fx]}${fy + 1}`
}
const regionTag = (r: string) => (r === 'surface' ? '' : ` (${r})`)
const cardLine = (name: string): string => {
  const c = getCard(name)
  const th = Object.entries(c.thresholds ?? {}).filter(([, n]) => (n as number) > 0).map(([e, n]) => `${n} ${e}`).join(', ')
  const stats = c.type === 'Minion' ? ` ${c.attack ?? 0} power.` : ''
  return `${name} — ${c.type}${c.subtypes?.length ? ` (${c.subtypes.join(' ')})` : ''}, cost ${c.cost ?? 0}${th ? `, needs ${th}` : ''}.${stats} ${String(c.text ?? '').replace(/\s*\n\s*/g, ' / ') || '(no text)'}`
}

function unitLine(s: GameState, me: PlayerId, u: UnitState): string {
  const kw = effKeywords(s, u) as Record<string, unknown>
  const kws = Object.entries(kw).filter(([, v]) => v === true || (typeof v === 'number' && v > 0)).map(([k, v]) => (typeof v === 'number' ? `${k} ${v}` : k))
  const bits = [
    u.isAvatar ? `Avatar, life ${u.life ?? 0}${u.deathsDoor ? " — AT DEATH'S DOOR" : ''}` : `${effAttack(s, u)} power${u.damage ? `, ${u.damage} damage on it` : ''}`,
    u.tapped ? 'TAPPED' : 'untapped',
    !u.isAvatar && u.enteredTurn === s.turn && !kw.charge ? 'summoning sick' : '',
    isDisabled(s, u) ? 'DISABLED' : '',
    u.stealth ? 'has its Stealth mark' : '',
    kws.length ? kws.join(', ') : '',
    u.carrying?.length ? `carrying ${u.carrying.map((id) => s.artifacts[id]?.name).filter(Boolean).join(', ')}` : '',
  ].filter(Boolean)
  return `${u.name} at ${sqName(me, u.x, u.y)}${regionTag(u.region)} — ${bits.join('; ')}`
}

/** the position in words, from seat `me`. `view` must already be me's fair view. */
export function describePosition(view: GameState, me: PlayerId): string {
  const foe = opponent(me)
  const P = view.players[me], F = view.players[foe]
  const out: string[] = []
  const aff = (p: PlayerId) => Object.entries(affinity(view, p)).filter(([, n]) => (n as number) > 0).map(([e, n]) => `${n} ${e}`).join(', ') || 'none'
  out.push(`Turn ${view.turn}. ${view.activePlayer === me ? 'It is YOUR turn' : "It is the OPPONENT's turn"} (${view.phase} phase).`)
  out.push(`You: ${P.mana} mana available; threshold ${aff(me)}; ${P.hand.length} cards in hand; spellbook ${P.spellbook.length}, atlas ${P.atlas.length}, cemetery ${P.cemetery?.length ?? 0}.`)
  out.push(`Opponent: threshold ${aff(foe)}; ${F.hand.length} cards in hand (hidden); spellbook ${F.spellbook.length}, atlas ${F.atlas.length}, cemetery ${F.cemetery?.length ?? 0}.`)
  out.push('', 'BOARD (a1 = your back-left corner; rows 1-2 are your side, rows 3-4 the opponent\'s; squares not listed are void):')
  const sites = Object.values(view.sites).sort((a, b) => a.y - b.y || a.x - b.x)
  for (const st of sites) {
    const here = Object.values(view.units).filter((u) => u.x === st.x && u.y === st.y)
    const arts = Object.values(view.artifacts).filter((a) => !a.carriedBy && a.x === st.x && a.y === st.y).map((a) => a.name)
    const who = st.controller === me ? 'yours' : "opponent's"
    const trap = st.trap && st.controller === me ? ` [your face-down trap: ${st.trap.realName}]` : ''
    out.push(`  ${sqName(me, st.x, st.y)}: ${st.isRubble ? 'Rubble' : st.name} (${who})${trap}${arts.length ? ` — on the ground: ${arts.join(', ')}` : ''}`)
    for (const u of here) out.push(`      ${u.controller === me ? 'YOUR' : 'ENEMY'} ${unitLine(view, me, u)}`)
  }
  const auras = Object.values(view.auras ?? {})
  if (auras.length) out.push('', 'AURAS: ' + auras.map((a: any) => `${a.name} at ${sqName(me, a.x, a.y)} (${a.controller === me ? 'yours' : "opponent's"})`).join('; '))
  out.push('', 'YOUR HAND:')
  for (const id of P.hand) out.push('  ' + cardLine(view.cards[id]?.name ?? '?'))
  if (!P.hand.length) out.push('  (empty)')
  // rules text of everything in play that isn't already printed above
  const seen = new Set(P.hand.map((id) => view.cards[id]?.name))
  const inPlay = new Set<string>()
  for (const u of Object.values(view.units)) inPlay.add(u.name)
  for (const st of sites) if (!st.isRubble) inPlay.add(st.name)
  for (const a of Object.values(view.artifacts)) inPlay.add(a.name)
  for (const a of auras) inPlay.add((a as any).name)
  const ref = [...inPlay].filter((n) => !seen.has(n)).sort()
  if (ref.length) { out.push('', 'CARD TEXT of what is in play:'); for (const n of ref) { try { out.push('  ' + cardLine(n)) } catch { /* token without a card entry */ } } }
  const prompt = view.prompts[0]
  if (prompt) out.push('', `QUESTION YOU MUST ANSWER NOW: ${prompt.title ?? prompt.kind}`)
  const log = view.log.slice(-10).map((l) => l.msg)
  if (log.length) out.push('', 'RECENT EVENTS:', ...log.map((m) => '  ' + m))
  return out.join('\n')
}

/** one legal move in words */
export function describeAction(s: GameState, me: PlayerId, a: Action): string {
  const un = (id: string) => { const u = s.units[id]; return u ? `${u.name}${u.controller === me ? '' : ' (enemy)'} at ${sqName(me, u.x, u.y)}` : s.sites[id] ? `${s.sites[id].name} at ${sqName(me, s.sites[id].x, s.sites[id].y)}` : s.artifacts[id]?.name ?? id }
  const tgt = (t: string) => { const m = /^sq:(\d+),(\d+)(?:,(\w+))?$/.exec(t); return m ? `${sqName(me, +m[1], +m[2])}${m[3] && m[3] !== 'surface' ? ` (${m[3]})` : ''}` : un(t) }
  const dir = (d: unknown) => { const map: Record<string, string> = me === 0 ? { n: 'forward', s: 'backward', e: 'right', w: 'left' } : { n: 'backward', s: 'forward', e: 'left', w: 'right' }; return typeof d === 'string' ? map[d] ?? d : '' }
  switch (a.t) {
    case 'endTurn': return 'END YOUR TURN'
    case 'avatarSite': return a.mode === 'draw' ? 'Avatar: tap to DRAW a site from the atlas' : `Avatar: tap to PLAY ${s.cards[a.cardId]?.name} at ${sqName(me, a.x, a.y)}`
    case 'moveAttack': {
      const u = s.units[a.unitId]
      const last = a.path[a.path.length - 1]
      const go = last ? (last.x === u.x && last.y === u.y ? (last.region !== u.region ? `changes layer to ${last.region}` : 'stays') : `moves to ${sqName(me, last.x, last.y)}${regionTag(last.region)}`) : 'stays'
      const atk = a.attack ? ('unit' in a.attack ? ` and ATTACKS ${un(a.attack.unit)}` : ` and ATTACKS THE SITE there`) : ''
      return `${un(a.unitId)} ${go}${atk}`
    }
    case 'castSpell': {
      const extra = a.extra as Record<string, unknown> | undefined
      const bits = [
        a.at ? `at ${sqName(me, a.at.x, a.at.y)}${a.at.region && a.at.region !== 'surface' ? ` (${a.at.region})` : ''}` : '',
        a.targets?.length ? `targeting ${a.targets.map(tgt).join(', ')}` : '',
        extra?.direction ? `direction ${dir(extra.direction)}` : '',
        extra?.giveTo ? `handed to ${un(String(extra.giveTo))}` : '',
        a.casterId && !s.units[a.casterId]?.isAvatar ? `cast by ${un(a.casterId)}` : '',
      ].filter(Boolean)
      return `CAST ${s.cards[a.cardId]?.name} ${bits.join(', ')}`.trim()
    }
    case 'activate': {
      const extra = a.extra as Record<string, unknown> | undefined
      return `ABILITY "${a.ability}" of ${un(a.sourceId)}${a.targets?.length ? ` targeting ${a.targets.map(tgt).join(', ')}` : ''}${extra?.direction ? `, direction ${dir(extra.direction)}` : ''}`
    }
    case 'pickUp': return `${un(a.unitId)} PICKS UP ${a.artifactIds.map((id) => s.artifacts[id]?.name).join(', ')}`
    case 'drop': return `${un((a as any).unitId)} DROPS what it carries`
    case 'prompt': return `Answer: ${describeChoice(s, me, a.choice, un)}`
    default: return JSON.stringify(a)
  }
}

function describeChoice(s: GameState, me: PlayerId, c: unknown, un: (id: string) => string): string {
  if (c === true) return 'yes'
  if (c === false || c === null) return 'no / decline'
  if (typeof c === 'string') return s.units[c] || s.sites[c] || s.artifacts[c] ? un(c) : s.cards[c] ? s.cards[c].name : c
  if (Array.isArray(c)) return c.length ? c.map((x) => describeChoice(s, me, x, un)).join(' + ') : 'nobody / nothing'
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>
    if (typeof o.x === 'number' && typeof o.y === 'number') return `square ${sqName(me, o.x, o.y)}`
    if (o.allocation && typeof o.allocation === 'object') return 'damage: ' + Object.entries(o.allocation as Record<string, number>).map(([id, n]) => `${n} to ${un(id)}`).join(', ')
    return JSON.stringify(c)
  }
  return String(c)
}

/** every legal move for `me` right now, described, with the evaluation's opinion of the result */
export function candidates(real: GameState, me: PlayerId): ClaudeCandidate[] {
  const view = fairView(real, me)
  const base = evaluate(view, me, DEFAULT_WEIGHTS)
  const seen = new Set<string>()
  const out: ClaudeCandidate[] = []
  for (const e of expandActions(view, me, { minionCasters: true, abilityTargets: true })) {
    if (e.action.t === 'concede') continue
    const k = botActionKey(e.action)
    if (seen.has(k)) continue
    seen.add(k)
    let delta = 0
    try { delta = evaluate(e.next, me, DEFAULT_WEIGHTS) - base } catch { /* keep 0 */ }
    out.push({ action: e.action, text: describeAction(view, me, e.action), delta })
  }
  return out.slice(0, MAX_CANDIDATES)
}
export const MAX_CANDIDATES = 160

export function buildRequest(real: GameState, me: PlayerId, cands: ClaudeCandidate[], suggested: Action | null, notes: string): ClaudeRequest {
  const view = fairView(real, me)
  const hint = suggested ? botActionKey(suggested) : null
  return {
    position: describePosition(view, me),
    candidates: cands.map((c, i) => `${i + 1}. ${c.text}  [eval ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(1)}]${hint && botActionKey(c.action) === hint ? '  <- the search engine\'s choice' : ''}`),
    notes,
  }
}

// ---------- the per-turn plan queue ----------
interface Plan { seat: PlayerId; turn: number; queue: string[]; hand: string; notes: string }
let PLAN: Plan | null = null
let LAST_NOTE = ''
export const lastClaudeNote = (): string => LAST_NOTE
export function resetClaudeBot(): void { PLAN = null; LAST_NOTE = '' }

const handKey = (s: GameState, me: PlayerId) => [...s.players[me].hand].sort().join(',')

/** the next queued move, if it is still exactly legal and nothing unexpected happened */
function fromQueue(real: GameState, me: PlayerId, cands: ClaudeCandidate[]): Action | null {
  const p = PLAN
  if (!p || p.seat !== me || p.turn !== real.turn || !p.queue.length) return null
  if (real.prompts[0]) return null // a question always gets a fresh look
  const want = p.queue[0]
  const hit = cands.find((c) => botActionKey(c.action) === want)
  if (!hit) { PLAN = null; return null }
  // a card arrived that the plan didn't know about (a draw): re-plan
  const gained = handKey(real, me).split(',').filter((id) => id && !p.hand.split(',').includes(id))
  if (gained.length) { PLAN = null; return null }
  p.queue.shift()
  return hit.action
}

/** A move that needs no thinking: the next queued move of this turn's plan, or the only legal move.
 *  Null means Claude has to be asked (or the procedural policy, see `claudeDefers`). */
export function claudeQuick(real: GameState, me: PlayerId): Action | null {
  if (claudeDefers(real)) return null
  try {
    const cands = candidates(real, me)
    if (cands.length === 1) return cands[0].action
    return fromQueue(real, me, cands)
  } catch { return null }
}
/** decisions left to the search bot outright: the opening hand and which deck to draw from */
export const claudeDefers = (real: GameState): boolean => real.phase === 'mulligan' || real.prompts[0]?.kind === 'drawDeck'

export type AskClaude = (req: ClaudeRequest, signal: AbortSignal) => Promise<ClaudeReply>

/** Decide the bot's next action with Claude. `suggested` is the search bot's move for this position
 *  (the hint, and the fallback). Never throws: any failure returns `suggested` (or ends the turn). */
export async function claudeBotAction(real: GameState, me: PlayerId, suggested: Action | null, ask: AskClaude, timeoutMs = 20000): Promise<{ action: Action; source: 'claude' | 'queue' | 'fallback'; note: string }> {
  const fallback = (why: string) => ({ action: suggested ?? ({ t: 'endTurn' } as Action), source: 'fallback' as const, note: why })
  // the opening hand and draw-pile choices stay with the procedural policy (cheap, and well tuned)
  if (real.phase === 'mulligan' || real.prompts[0]?.kind === 'drawDeck') return fallback('')
  let cands: ClaudeCandidate[]
  try { cands = candidates(real, me) } catch { return fallback('move generation failed') }
  if (!cands.length) return fallback('no legal moves found')
  if (cands.length === 1) return { action: cands[0].action, source: 'queue', note: LAST_NOTE }
  const queued = fromQueue(real, me, cands)
  if (queued) return { action: queued, source: 'queue', note: LAST_NOTE }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const reply = await ask(buildRequest(real, me, cands, suggested, PLAN && PLAN.turn === real.turn ? PLAN.notes : ''), ctrl.signal)
    const picks = (reply.picks ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= cands.length)
    if (!picks.length) return fallback('Claude chose no legal move')
    const keys = picks.map((n) => botActionKey(cands[n - 1].action))
    LAST_NOTE = String(reply.plan ?? '').slice(0, 400)
    PLAN = { seat: me, turn: real.turn, queue: keys.slice(1), hand: handKey(real, me), notes: LAST_NOTE }
    return { action: cands[picks[0] - 1].action, source: 'claude', note: LAST_NOTE }
  } catch (e) {
    PLAN = null
    return fallback(ctrl.signal.aborted ? 'Claude took too long' : `Claude unavailable (${(e as Error)?.message ?? 'error'})`)
  } finally {
    clearTimeout(timer)
  }
}

// ---------- talking to this app's server ----------
const authHeader = (): Record<string, string> => { try { const t = localStorage.getItem('sorcery-token'); return t ? { Authorization: `Bearer ${t}` } : {} } catch { return {} } }

export async function claudeStatus(): Promise<ClaudeStatus> {
  try {
    const r = await fetch('/api/claude-bot', { headers: authHeader() })
    if (!r.ok) return { enabled: false, model: null, reason: `server answered ${r.status}` }
    return (await r.json()) as ClaudeStatus
  } catch { return { enabled: false, model: null, reason: 'server not reachable' } }
}

export const askServer: AskClaude = async (req, signal) => {
  const r = await fetch('/api/claude-bot', { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body: JSON.stringify(req), signal })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((body as any)?.error ?? `HTTP ${r.status}`)
  return body as ClaudeReply
}
