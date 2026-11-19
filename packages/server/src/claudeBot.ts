// The "Claude" opponent, server side: this process holds the Anthropic API key and makes the one
// call the bot needs — "here is the position and the numbered legal moves; which do you play?".
//
// It is deliberately NOT a general proxy: the request is a fixed shape (position text, candidate
// list, notes) with size caps, the model, system prompt and token limit are set here, and by
// default only this machine (or a signed-in admin) may call it — see `claudeAccess`.
//
// Configuration (environment, or a `.env` file in the repo root):
//   ANTHROPIC_API_KEY   required — without it the Claude opponent is simply unavailable
//   CLAUDE_BOT_MODEL    default claude-sonnet-5-5
//   CLAUDE_BOT_EFFORT   thinking effort: off | low | medium | high   (default medium; off = no thinking
//                       at all — the cheapest and fastest, with the move tool forced)
//   CLAUDE_BOT_ACCESS   local (default: loopback callers + admins) | users (any signed-in user) | all
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** KEY=VALUE lines from <repo>/.env, without overriding anything already set in the environment */
export function loadDotEnv(): void {
  for (const dir of [process.cwd(), import.meta.dirname ? resolve(import.meta.dirname, '../../..') : process.cwd()]) {
    const file = join(dir, '.env')
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
      if (!m || line.trim().startsWith('#')) continue
      const value = m[2].replace(/^(['"])(.*)\1$/, '$2')
      if (process.env[m[1]] === undefined) process.env[m[1]] = value
    }
    return
  }
}

loadDotEnv() // the key and the options below are read lazily, so loading here is early enough

export const claudeModel = (): string => process.env.CLAUDE_BOT_MODEL || 'claude-sonnet-5-5'
export const claudeEnabled = (): boolean => !!process.env.ANTHROPIC_API_KEY
export const claudeAccess = (): 'local' | 'users' | 'all' => {
  const v = (process.env.CLAUDE_BOT_ACCESS ?? 'local').toLowerCase()
  return v === 'all' || v === 'users' ? v : 'local'
}

export interface ClaudeBotRequest { position: string; candidates: string[]; notes?: string; reference?: string; check?: string }
export interface ClaudeBotUsage { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface ClaudeBotReply { picks: number[]; plan: string; strategy: string; model: string; ms: number; usage: ClaudeBotUsage }

const MAX_POSITION = 40_000, MAX_CANDIDATES = 200, MAX_CANDIDATE_LEN = 1200, MAX_NOTES = 1200, MAX_REFERENCE = 40_000

/** check and trim a request body; returns an error string for a malformed one */
export function parseRequest(body: unknown): ClaudeBotRequest | string {
  const b = body as Partial<ClaudeBotRequest> | null
  if (!b || typeof b.position !== 'string' || !Array.isArray(b.candidates)) return 'Expected { position, candidates }.'
  if (b.position.length > MAX_POSITION) return `Position too long (${b.position.length} characters).`
  if (!b.candidates.length || b.candidates.length > MAX_CANDIDATES) return 'Bad candidate count.'
  const long = b.candidates.find((c) => typeof c !== 'string' || c.length > MAX_CANDIDATE_LEN)
  if (long !== undefined) return typeof long === 'string' ? `A move description is too long (${long.length} characters).` : 'Bad candidate.'
  if (b.reference !== undefined && (typeof b.reference !== 'string' || b.reference.length > MAX_REFERENCE)) return 'Bad reference.'
  return { position: b.position, candidates: b.candidates, notes: typeof b.notes === 'string' ? b.notes.slice(0, MAX_NOTES) : '', reference: b.reference ?? '', check: typeof b.check === 'string' ? b.check.slice(0, 1500) : '' }
}

export const SYSTEM_PROMPT = `You are playing the trading card game Sorcery: Contested Realm against a human, as the computer opponent. You play to win, and you play fair: you only know what a player in your seat would know.

Each message gives you the position in words and a numbered list of EVERY legal move available to you right now. You answer by calling the choose_moves tool. Never invent a move: you can only pick numbers from the list.

RULES YOU NEED
- The realm is a 5x4 grid. Squares are named a1..e4 from YOUR side: row 1 is your back row, row 4 the opponent's. A square without a site is void; units can't normally stand there.
- Each player has an Avatar. An Avatar starts at 20 life. At 0 life it is at Death's Door: it can no longer gain life, and the next DAMAGE dealt to it (on a later turn than the one it got there) is a death blow that wins the game. Life lost through attacks on SITES is not damage and can never be the death blow.
- Sites give 1 mana each per turn and provide elemental threshold. Unspent mana is lost at end of turn. Your Avatar may tap to play a site from hand (adjacent to a site you control) or to draw a site.
- Spells cost mana and need threshold. Minions are summoned to sites you control and have summoning sickness (can't move or attack the turn they arrive) unless they have Charge.
- Move and Attack: a unit taps, takes one step (orthogonal; Airborne units may step diagonally), and may then attack an enemy unit or the site at the location where it ends. In a fight both sides strike simultaneously for their power. A minion dies when the damage on it reaches its power. All damage on minions heals at the end of every turn.
- Attacking a site: its controller loses life equal to the attacker's power (never the death blow).
- DEFENDING: when you attack, the opponent's UNTAPPED units within one step of the fight may defend — the fight then goes to the defender instead of your target. An attack on an Avatar guarded by untapped minions usually just hits a guard. Tapped units cannot defend. The same protects you: units you leave untapped next to your Avatar and sites can defend on the opponent's turn.
- Intercept: if an enemy ends its move on a square where you have untapped units and does not attack, they may fight it.
- Keywords: Airborne (can't be attacked by non-flyers; its own attacks can be defended by anyone), Ranged (shoot a projectile one step in a line, no strike back), Stealth (can't be targeted or defended against until it strikes), Lethal (any damage kills a minion), Charge, Burrowing / Submerge (may go under land / water sites; units in different layers can't fight), Spellcaster (may cast your spells; a spell comes from its caster's square), Disabled (no abilities, can't move, strike or defend).
- Projectiles fly in a straight line from the caster and hit the FIRST unit in their path — yours included.
- Trap sites are face down and look like a basic site; their owner can pay to spring them on their own turn.

HOW TO PLAY WELL
Think like a strong human player. Before answering, work through the turn: what does the opponent threaten next turn, what are your possible lines this turn, and what does the opponent do after each?
- YOUR AVATAR IS THE GAME. Keep it on your own back rows, on a site you control, with an untapped unit within one step whenever the opponent has attackers in reach. Never move it, or the site it stands on, toward the enemy — not with a step, not with an ability, not with a card that swaps or moves sites — unless that move wins the game this turn. An Avatar among enemy units loses life every turn and has no defenders.
- Develop first: play a site every turn while you have one (mana wins games), then spend your mana on the strongest plays you can afford, then attack. Mana left unspent is wasted.
- Count defenders before attacking. An attack only reaches its target if every untapped enemy unit within one step of it is tapped, dead, or unwilling to take the fight. Tap or remove the defenders first, or attack something they can't reach.
- Prefer fights you win outright or trade up in. Don't feed small minions into big untapped ones. Damage heals at end of turn, so partial damage is worthless unless something finishes the job the same turn.
- Attack sites to drain life when the Avatar is guarded; once the enemy Avatar is at Death's Door, switch entirely to getting ONE point of damage onto it (a strike or any damage spell).
- Tempo and cards: a removal spell on a minion that cost more than the spell is a good trade. Hold removal for the unit that is actually stopping you (a guard, a Spellcaster, a big attacker). Don't spend a card for no gain.
- A minion you only control temporarily should be used NOW: attack with it.
- Recurring damage decides games. An enemy that can hit your Avatar or your sites EVERY turn (a Ranged unit with a clear line of fire, an attacker you never answer) comes before everything else: kill it, block its line with a unit, or step out of its row or column. Keeping the Avatar "back" does nothing against Ranged. The position names these under RANGED THREAT.
- Do not pass with good attacks available just to "hold position". Leave a guard only against a threat the position actually names; if none is named, use your units: hit undefended sites, take the trades you win. A turn that neither develops nor attacks hands the opponent the game one turn sooner, and unspent mana is wasted.
- An effect that applies to BOTH players or to "each" unit applies to you too. Before casting one, ask what the opponent does with it: a card that lets each player control the other's next turn gives the opponent YOUR turn, with your sites and abilities to sacrifice or waste.
- Read each card's text before using it; an ability that sounds strong can hurt you (moving your own units or sites into danger, damaging your own units, giving the opponent something).
- Have a game plan and keep to it across turns: are you the aggressor racing their life total, or defending until your bigger spells take over? Say so in "strategy".

WHAT THE ANNOTATIONS MEAN
- Every move carries a simulation in brackets: "then their reply: …". It is what the game engine found when it played that ONE move, stopped, and let the opponent take its best reply turn with the units on the board (it cannot see cards in the opponent's hand). "eval +N vs passing" compares the resulting position with doing nothing: positive is good for you. Differences under about 20 are noise; 60 or more is a real difference. Life and units lost are listed. "YOUR AVATAR DIES" means exactly that.
- These simulations judge each move on its own. A move that only sets up a later one may look neutral; a move that looks fine may be bad if you tap the defenders it relies on. Use them as facts about consequences, and do your own reasoning about sequences.
- One move may be marked as the search engine's choice, and its whole line for the turn may be shown. The engine is tactically sound and strategically shallow: its line is a safe default. Deviate when you see a better plan — and check your alternative against the simulations first.
- If you see "ENGINE CHECK", your previous answer was simulated and looked like a mistake. Take it seriously.
- Some cards carry "[impact +N]" or "[impact -N]". That is measured on tens of thousands of real games between human players: the win rate of games where the card was drawn minus games where it stayed in the deck, in percentage points. +2.5 or more marks a card that wins games — protect yours, and make the opponent's a priority target. A negative figure marks a card that underperforms. Cards without a figure are average or lack data.

ANSWERING
- picks: the move numbers you want played, IN ORDER, for the rest of this turn. Only list moves that are in the list right now. After each move the game re-checks: if your next pick is no longer legal, or something unexpected happens, you will simply be asked again with a fresh list. Being asked again costs time, so plan the WHOLE turn in one answer whenever you can: list every independent move (site, casts, each unit's attack), and stop early only where the outcome of a fight or a draw would really change your mind.
- Attack moves are annotated with {may be defended by: …} or {no defender in reach}. An attack on an Avatar or a site only lands if no defender steps in.
- The list is trimmed: plain repositioning moves and site squares show only the best few options.
- Include the END YOUR TURN move as the last pick only when you are certain nothing else should happen after the moves before it.
- If you must answer a QUESTION, pick exactly one answer.
- plan: one or two short sentences for the human to read, describing what you are doing this turn and why. No move numbers in it.`

const TOOL = {
  name: 'choose_moves',
  description: 'Choose the moves to play, in order, from the numbered list of legal moves.',
  input_schema: {
    type: 'object',
    properties: {
      picks: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 1, maxItems: 12, description: 'Numbers from the legal-move list, in the order to play them.' },
      plan: { type: 'string', description: 'One or two short sentences describing the plan for this turn.' },
      strategy: { type: 'string', description: 'Optional. Your standing game plan in one sentence (how you intend to win, what you are holding back and why). It is shown back to you on later turns; send it again only to change it.' },
    },
    required: ['picks', 'plan'],
  },
}

export function userMessage(r: ClaudeBotRequest): string {
  return `${r.position}\n\n${r.notes ? `YOUR NOTES:\n${r.notes}\n\n` : ''}LEGAL MOVES:\n${r.candidates.join('\n')}${r.check ? `\n\n${r.check}` : ''}`
}

/** the Messages API request. `thinking: false` is the plain fallback shape (forced tool, no thinking). */
export function buildApiRequest(r: ClaudeBotRequest, thinking: boolean): Record<string, unknown> {
  const effort = ['low', 'medium', 'high'].includes(process.env.CLAUDE_BOT_EFFORT ?? '') ? process.env.CLAUDE_BOT_EFFORT : 'medium'
  // Everything that stays the same all game goes first and is marked cacheable: the rules, then the
  // text of every card in the bot's own deck. Repeat calls then pay a fraction for that part.
  const system = r.reference
    ? [{ type: 'text', text: SYSTEM_PROMPT }, { type: 'text', text: `CARD REFERENCE — every card in YOUR deck (name — type, cost, threshold, power, text):\n${r.reference}`, cache_control: { type: 'ephemeral' } }]
    : [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]
  return {
    model: claudeModel(),
    max_tokens: thinking ? 12000 : 1024,
    system,
    tools: [TOOL],
    // a forced tool call can't be combined with thinking, so with thinking on the tool is left to the model
    ...(thinking ? { thinking: { type: 'adaptive' }, output_config: { effort }, tool_choice: { type: 'auto' } } : { tool_choice: { type: 'tool', name: TOOL.name } }),
    messages: [{ role: 'user', content: userMessage(r) }],
  }
}

/** pull the picks out of an API response: the tool call if there is one, else numbers in the text */
export function parseApiResponse(resp: any, candidateCount: number): { picks: number[]; plan: string; strategy: string } {
  const blocks: any[] = Array.isArray(resp?.content) ? resp.content : []
  const tool = blocks.find((b) => b?.type === 'tool_use' && b?.name === TOOL.name)
  let picks: unknown[] = Array.isArray(tool?.input?.picks) ? tool.input.picks : []
  let plan: string = typeof tool?.input?.plan === 'string' ? tool.input.plan : ''
  if (!picks.length) {
    const text = blocks.filter((b) => b?.type === 'text').map((b) => String(b.text ?? '')).join('\n')
    picks = (text.match(/\b\d{1,3}\b/g) ?? []).map(Number).slice(0, 12)
    plan = plan || text.slice(0, 300)
  }
  const clean: number[] = []
  for (const p of picks) {
    const n = Number(p)
    if (Number.isInteger(n) && n >= 1 && n <= candidateCount && !clean.includes(n)) clean.push(n)
  }
  return { picks: clean, plan: plan.trim(), strategy: typeof tool?.input?.strategy === 'string' ? tool.input.strategy.trim() : '' }
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>

/** ask Claude. One retry in the plain shape if the thinking request is rejected as malformed. */
export async function askClaude(r: ClaudeBotRequest, fetchImpl: Fetch = fetch as unknown as Fetch, timeoutMs = 35_000): Promise<ClaudeBotReply> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('The Claude opponent is not configured on this server (no ANTHROPIC_API_KEY).')
  const t0 = Date.now()
  const call = async (thinking: boolean) => {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(buildApiRequest(r, thinking)),
      // the plain (no thinking) shape answers in a few seconds; it is also the retry after a slow call
      signal: AbortSignal.timeout(thinking ? timeoutMs : 20_000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      const err = new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`) as Error & { status?: number }
      err.status = res.status
      throw err
    }
    return res.json()
  }
  let resp: any
  if ((process.env.CLAUDE_BOT_EFFORT ?? '').toLowerCase() === 'off') resp = await call(false)
  else {
    try { resp = await call(true) } catch (e) {
      const err = e as { status?: number; name?: string }
      const tooSlow = err.name === 'TimeoutError' || err.name === 'AbortError'
      // 400: this model or account doesn't take the thinking parameters. Too slow: thinking ran past the
      // limit. Either way, ask again in the plain shape rather than give the move up.
      if (err.status !== 400 && !tooSlow) { console.error(`[claude-bot] failed: ${(e as Error).message}`); throw e }
      console.warn(`[claude-bot] ${tooSlow ? `no answer in ${timeoutMs / 1000}s with thinking` : 'thinking request rejected (400)'} — retrying without thinking`)
      resp = await call(false)
    }
  }
  const u = resp?.usage ?? {}
  const usage: ClaudeBotUsage = { input: Number(u.input_tokens ?? 0), output: Number(u.output_tokens ?? 0), cacheRead: Number(u.cache_read_input_tokens ?? 0), cacheWrite: Number(u.cache_creation_input_tokens ?? 0) }
  // one line per call in the server log: the numbers to tune cost with
  console.log(`[claude-bot] ${claudeModel()} ${Date.now() - t0}ms  in ${usage.input} (+${usage.cacheRead} cached, +${usage.cacheWrite} written)  out ${usage.output}  moves offered ${r.candidates.length}`)
  const out = parseApiResponse(resp, r.candidates.length)
  if (!out.picks.length) throw new Error('Claude did not choose a move.')
  return { ...out, model: claudeModel(), ms: Date.now() - t0, usage }
}

// a simple global throttle: this is a paid API behind a game button
const WINDOW_MS = 60_000
const stamps: number[] = []
export function throttled(limit = Number(process.env.CLAUDE_BOT_RPM ?? 40)): boolean {
  const now = Date.now()
  while (stamps.length && now - stamps[0] > WINDOW_MS) stamps.shift()
  if (stamps.length >= limit) return true
  stamps.push(now)
  return false
}

// ---------- a written review of a finished game ----------
export const REVIEW_PROMPT = `You are reviewing a finished game of the trading card game Sorcery: Contested Realm, played on a simulator by a human ("You" in the log) against a computer opponent ("Computer"). You are given an engine report (tempo by turn, the biggest swings, and what the search engine would have played at those moments) and the game log.

Write a short review for the human player, in plain text (no markdown headings, no tables), at most 280 words:
1. One sentence on how the game was decided.
2. "Key moments": the two to four turns that mattered most, each with the turn number, what happened and what the better play was. Say which side erred.
3. "For you": one concrete thing the human could do better next time.
4. "For the bot": one or two concrete weaknesses of the computer's play, or anything in the log that looks like a rules mistake by the simulator. If there is nothing, say so.
Only state what the report and log support. If the log is too thin to judge a moment, say that rather than guess.`

export interface GameReviewReply { text: string; model: string; ms: number; usage: ClaudeBotUsage }

/** check a review request: one block of text (the report and the log) */
export function parseReviewRequest(body: unknown): { summary: string } | string {
  const summary = (body as { summary?: unknown } | null)?.summary
  if (typeof summary !== 'string' || summary.trim().length < 200) return 'Nothing to review.'
  if (summary.length > 80_000) return 'The game summary is too long.'
  return { summary }
}

export async function reviewGame(summary: string, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<GameReviewReply> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('Claude is not configured on this server (no ANTHROPIC_API_KEY).')
  const t0 = Date.now()
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: claudeModel(), max_tokens: 900, system: REVIEW_PROMPT, messages: [{ role: 'user', content: summary }] }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
  const resp: any = await res.json()
  const text = (Array.isArray(resp?.content) ? resp.content : []).filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? '')).join('\n').trim()
  if (!text) throw new Error('Claude wrote no review.')
  const u = resp?.usage ?? {}
  const usage: ClaudeBotUsage = { input: Number(u.input_tokens ?? 0), output: Number(u.output_tokens ?? 0), cacheRead: Number(u.cache_read_input_tokens ?? 0), cacheWrite: Number(u.cache_creation_input_tokens ?? 0) }
  console.log(`[game-review] ${claudeModel()} ${Date.now() - t0}ms  in ${usage.input}  out ${usage.output}`)
  return { text: text.slice(0, 6000), model: claudeModel(), ms: Date.now() - t0, usage }
}
