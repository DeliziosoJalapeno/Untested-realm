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
export interface ClaudeRequest { position: string; candidates: string[]; notes: string; reference?: string }
export interface ClaudeUsage { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface ClaudeReply { picks: number[]; plan: string; model?: string; ms?: number; usage?: ClaudeUsage }
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

const shortLine = (name: string): string => { const c = getCard(name); return `${name} (${c.type}, cost ${c.cost ?? 0})` }

/** every distinct card that started in `me`'s own deck (its text goes into the cached reference) */
function ownCardNames(view: GameState, me: PlayerId): Set<string> {
  const names = new Set<string>()
  for (const c of Object.values(view.cards)) if (c.owner === me && c.name) names.add(c.name)
  return names
}
/** the rules text of the bot's own deck: identical for the whole game, so the API can cache it */
export function deckReference(view: GameState, me: PlayerId): string {
  const lines: string[] = []
  for (const n of [...ownCardNames(view, me)].sort()) { try { lines.push(cardLine(n)) } catch { /* a token without a card entry */ } }
  return lines.join('\n')
}

/** could `u` step to (x,y) and fight there? One orthogonal step (or already there); flyers also diagonally */
function inReach(s: GameState, u: UnitState, x: number, y: number): boolean {
  const dx = Math.abs(u.x - x), dy = Math.abs(u.y - y)
  if (dx + dy <= 1) return true
  return dx === 1 && dy === 1 && !!(effKeywords(s, u) as Record<string, unknown>).airborne
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
  // who could hit your Avatar next turn — the thing a model most easily overlooks
  const av = view.units[P.avatarUnitId]
  if (av) {
    const near = Object.values(view.units).filter((u) => u.controller === foe && !u.isAvatar && !isDisabled(view, u) && u.region === av.region && inReach(view, u, av.x, av.y))
    out.push('', near.length
      ? `THREAT: enemy units one step from your Avatar (they can attack it next turn unless you leave an untapped defender within a step of it): ${near.map((u) => `${u.name} (${effAttack(view, u)})`).join(', ')}`
      : 'No enemy unit is within one step of your Avatar.')
  }
  // your own cards' text lives in the (cached) deck reference; only the name and cost are repeated here
  const own = ownCardNames(view, me)
  out.push('', 'YOUR HAND:')
  for (const id of P.hand) { const n = view.cards[id]?.name ?? '?'; out.push('  ' + (own.has(n) ? shortLine(n) : cardLine(n))) }
  if (!P.hand.length) out.push('  (empty)')
  // rules text of everything in play that isn't in your deck reference
  const seen = own
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
      return `${un(a.unitId)} ${go}${atk}${a.attack ? defenders(s, me, u, last ?? { x: u.x, y: u.y, region: u.region }, 'unit' in a.attack ? a.attack.unit : null) : ''}`
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

/** who could step in if this attack is made: the enemy's untapped units within a step of the fight */
function defenders(s: GameState, me: PlayerId, attacker: UnitState, at: { x: number; y: number; region: string }, targetId: string | null): string {
  if (attacker.stealth) return ' {cannot be defended: Stealth}'
  const ds = Object.values(s.units).filter((u) => u.controller !== me && u.id !== targetId && !u.tapped && !isDisabled(s, u) && u.region === at.region && inReach(s, u, at.x, at.y))
  return ds.length ? ` {may be defended by: ${ds.map((u) => `${u.name}${u.isAvatar ? '' : ` (${effAttack(s, u)})`}`).join(', ')}}` : ' {no defender in reach}'
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
  return trim(out)
}
export const MAX_CANDIDATES = 60
const MAX_PLAIN_MOVES = 6, MAX_SITE_SQUARES = 4

/** is this more than shuffling a unit around? (a cast, an attack, an ability, a site, an answer) */
const meaningful = (a: Action): boolean =>
  a.t === 'castSpell' || a.t === 'activate' || a.t === 'prompt' || a.t === 'pickUp' || (a.t === 'avatarSite' && a.mode === 'play') || (a.t === 'moveAttack' && !!a.attack)

/** Keep the list short (every line is paid for on every call): all the meaningful moves, but only the
 *  best few plain repositioning moves and the best few squares for each site in hand. */
function trim(all: ClaudeCandidate[]): ClaudeCandidate[] {
  const byEval = (x: ClaudeCandidate, y: ClaudeCandidate) => y.delta - x.delta
  const plain = all.filter((c) => c.action.t === 'moveAttack' && !c.action.attack).sort(byEval).slice(0, MAX_PLAIN_MOVES)
  const sites = new Map<string, ClaudeCandidate[]>()
  for (const c of all) if (c.action.t === 'avatarSite' && c.action.mode === 'play') { const k = c.action.cardId; sites.set(k, [...(sites.get(k) ?? []), c]) }
  const keepSites = new Set([...sites.values()].flatMap((l) => l.sort(byEval).slice(0, MAX_SITE_SQUARES)))
  const keep = new Set<ClaudeCandidate>([...plain, ...keepSites])
  const kept = all.filter((c) => {
    if (c.action.t === 'moveAttack' && !c.action.attack) return keep.has(c)
    if (c.action.t === 'avatarSite' && c.action.mode === 'play') return keep.has(c)
    return true
  })
  if (kept.length <= MAX_CANDIDATES) return kept
  // still too many (a wide board): drop the worst-scoring meaningful moves, never the passes
  const fixed = kept.filter((c) => c.action.t === 'endTurn' || c.action.t === 'avatarSite' || c.action.t === 'prompt')
  const rest = kept.filter((c) => !fixed.includes(c)).sort(byEval).slice(0, Math.max(0, MAX_CANDIDATES - fixed.length))
  return kept.filter((c) => fixed.includes(c) || rest.includes(c))
}

export function buildRequest(real: GameState, me: PlayerId, cands: ClaudeCandidate[], suggested: Action | null, notes: string): ClaudeRequest {
  const view = fairView(real, me)
  const hint = suggested ? botActionKey(suggested) : null
  return {
    reference: deckReference(view, me),
    position: describePosition(view, me),
    candidates: cands.map((c, i) => `${i + 1}. ${c.text}  [eval ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(1)}]${hint && botActionKey(c.action) === hint ? '  <- the search engine\'s choice' : ''}`),
    notes,
  }
}

// ---------- the per-turn plan queue ----------
interface Plan { seat: PlayerId; turn: number; queue: string[]; hand: string; notes: string }
let PLAN: Plan | null = null
let LAST_NOTE = ''
/** what Claude said it was doing on its previous turns (most recent last) — cheap continuity */
let MEMO: { turn: number; plan: string }[] = []
let USAGE = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
export const lastClaudeNote = (): string => LAST_NOTE
/** tokens used by this game's Claude calls so far */
export const claudeUsage = () => ({ ...USAGE })
/** forget the queued plan (an undo makes it stale); the game's memo and usage are kept */
export function dropClaudePlan(): void { PLAN = null }
/** a new game */
export function resetClaudeBot(): void { PLAN = null; LAST_NOTE = ''; MEMO = []; USAGE = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }

function notesFor(real: GameState): string {
  const earlier = MEMO.filter((m) => m.turn < real.turn).slice(-2).map((m) => `turn ${m.turn}: ${m.plan}`)
  const now = PLAN && PLAN.turn === real.turn ? PLAN.notes : ''
  return [earlier.length ? `Your earlier turns — ${earlier.join(' | ')}` : '', now ? `This turn so far — ${now}` : ''].filter(Boolean).join('\n')
}

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
/** Questions worth a model call. Everything else the game asks (which deck to draw from, the first
 *  site, ordering cards, dividing damage, the opening hand) stays with the search bot: cheap, and tuned. */
const CLAUDE_PROMPTS = new Set(['defend', 'intercept', 'chooseTargets', 'chooseSquare', 'chooseOption', 'chooseCards', 'yesNo', 'siteOrSpell'])
export const claudeDefers = (real: GameState): boolean =>
  real.phase === 'mulligan' || (!!real.prompts[0] && !CLAUDE_PROMPTS.has(real.prompts[0].kind))

export type AskClaude = (req: ClaudeRequest, signal: AbortSignal) => Promise<ClaudeReply>

/** Decide the bot's next action with Claude. `suggested` is the search bot's move for this position
 *  (the hint, and the fallback). Never throws: any failure returns `suggested` (or ends the turn). */
export async function claudeBotAction(real: GameState, me: PlayerId, suggested: Action | null, ask: AskClaude, timeoutMs = 20000): Promise<{ action: Action; source: 'claude' | 'queue' | 'fallback'; note: string }> {
  const fallback = (why: string) => ({ action: suggested ?? ({ t: 'endTurn' } as Action), source: 'fallback' as const, note: why })
  // the opening hand and draw-pile choices stay with the procedural policy (cheap, and well tuned)
  if (claudeDefers(real)) return fallback('')
  let cands: ClaudeCandidate[]
  try { cands = candidates(real, me) } catch { return fallback('move generation failed') }
  if (!cands.length) return fallback('no legal moves found')
  if (cands.length === 1) return { action: cands[0].action, source: 'queue', note: LAST_NOTE }
  const queued = fromQueue(real, me, cands)
  if (queued) return { action: queued, source: 'queue', note: LAST_NOTE }
  // nothing to decide: no spell, attack, ability, site or question on offer — don't pay to be told to pass
  if (!cands.some((c) => meaningful(c.action))) return fallback('')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const reply = await ask(buildRequest(real, me, cands, suggested, notesFor(real)), ctrl.signal)
    USAGE.calls++
    if (reply.usage) { USAGE.input += reply.usage.input; USAGE.output += reply.usage.output; USAGE.cacheRead += reply.usage.cacheRead; USAGE.cacheWrite += reply.usage.cacheWrite }
    const picks = (reply.picks ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= cands.length)
    if (!picks.length) return fallback('Claude chose no legal move')
    const keys = picks.map((n) => botActionKey(cands[n - 1].action))
    LAST_NOTE = String(reply.plan ?? '').slice(0, 400)
    if (LAST_NOTE && real.activePlayer === me && !real.prompts[0]) { MEMO = MEMO.filter((m) => m.turn !== real.turn); MEMO.push({ turn: real.turn, plan: LAST_NOTE }) }
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
