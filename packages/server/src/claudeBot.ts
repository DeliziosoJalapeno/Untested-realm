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
//   CLAUDE_BOT_EFFORT   thinking effort: low | medium | high   (default low — keeps a move to seconds)
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

export interface ClaudeBotRequest { position: string; candidates: string[]; notes?: string }
export interface ClaudeBotReply { picks: number[]; plan: string; model: string; ms: number }

const MAX_POSITION = 24_000, MAX_CANDIDATES = 200, MAX_CANDIDATE_LEN = 400, MAX_NOTES = 600

/** check and trim a request body; returns an error string for a malformed one */
export function parseRequest(body: unknown): ClaudeBotRequest | string {
  const b = body as Partial<ClaudeBotRequest> | null
  if (!b || typeof b.position !== 'string' || !Array.isArray(b.candidates)) return 'Expected { position, candidates }.'
  if (b.position.length > MAX_POSITION) return 'Position too long.'
  if (!b.candidates.length || b.candidates.length > MAX_CANDIDATES) return 'Bad candidate count.'
  if (b.candidates.some((c) => typeof c !== 'string' || c.length > MAX_CANDIDATE_LEN)) return 'Bad candidate.'
  return { position: b.position, candidates: b.candidates, notes: typeof b.notes === 'string' ? b.notes.slice(0, MAX_NOTES) : '' }
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
- Every turn: play a site if you have one (mana wins games), then spend your mana on the strongest plays you can afford, then attack.
- Count defenders before attacking. An attack only reaches its target if every untapped enemy unit within one step of it is tapped, dead, or unwilling to take the fight.
- Prefer fights you win outright or trade up in. Don't feed small minions into big untapped ones.
- Attack sites to drain life when the Avatar is guarded; once the enemy Avatar is at Death's Door, switch to getting ONE point of damage onto it (a strike or any damage spell).
- A minion you only control temporarily should be used NOW: attack with it.
- Keep at least one untapped unit near your own Avatar when the opponent has attackers in reach, especially when you are low on life.
- Use removal on the unit that is actually stopping you (a guard, a Spellcaster, a big attacker), not on whatever is closest.
- Each move is annotated with "eval", a rough heuristic score change (positive is better for you) from a simple evaluation function, and one move may be marked as the search engine's choice. Treat both as advice from a tactically sound but strategically shallow assistant: follow it unless you can see why another move is better.

ANSWERING
- picks: the move numbers you want played, IN ORDER, for the rest of this turn. Only list moves that are in the list right now. After each move the game re-checks: if your next pick is no longer legal, or something unexpected happens, you will simply be asked again with a fresh list — so list the independent moves you are sure of, and stop where the outcome of a fight or a draw would change your mind.
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
    },
    required: ['picks', 'plan'],
  },
}

export function userMessage(r: ClaudeBotRequest): string {
  return `${r.position}\n\n${r.notes ? `YOUR PLAN SO FAR THIS TURN: ${r.notes}\n\n` : ''}LEGAL MOVES:\n${r.candidates.join('\n')}`
}

/** the Messages API request. `thinking: false` is the plain fallback shape (forced tool, no thinking). */
export function buildApiRequest(r: ClaudeBotRequest, thinking: boolean): Record<string, unknown> {
  const effort = ['low', 'medium', 'high'].includes(process.env.CLAUDE_BOT_EFFORT ?? '') ? process.env.CLAUDE_BOT_EFFORT : 'low'
  return {
    model: claudeModel(),
    max_tokens: thinking ? 6000 : 1024,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [TOOL],
    // a forced tool call can't be combined with thinking, so with thinking on the tool is left to the model
    ...(thinking ? { thinking: { type: 'adaptive' }, output_config: { effort }, tool_choice: { type: 'auto' } } : { tool_choice: { type: 'tool', name: TOOL.name } }),
    messages: [{ role: 'user', content: userMessage(r) }],
  }
}

/** pull the picks out of an API response: the tool call if there is one, else numbers in the text */
export function parseApiResponse(resp: any, candidateCount: number): { picks: number[]; plan: string } {
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
  return { picks: clean, plan: plan.trim() }
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>

/** ask Claude. One retry in the plain shape if the thinking request is rejected as malformed. */
export async function askClaude(r: ClaudeBotRequest, fetchImpl: Fetch = fetch as unknown as Fetch, timeoutMs = 25_000): Promise<ClaudeBotReply> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('The Claude opponent is not configured on this server (no ANTHROPIC_API_KEY).')
  const t0 = Date.now()
  const call = async (thinking: boolean) => {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(buildApiRequest(r, thinking)),
      signal: AbortSignal.timeout(timeoutMs),
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
  try { resp = await call(true) } catch (e) {
    if ((e as { status?: number }).status !== 400) throw e
    resp = await call(false) // this model or account doesn't take the thinking parameters
  }
  const out = parseApiResponse(resp, r.candidates.length)
  if (!out.picks.length) throw new Error('Claude did not choose a move.')
  return { ...out, model: claudeModel(), ms: Date.now() - t0 }
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
