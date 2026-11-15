// The Claude opponent: what it is told about the position, how its answer becomes moves, and what
// happens when the answer is missing, late or wrong. No network: Claude is a stub here.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyAction, type Action } from '@sorcery/shared'
import { scene } from '../src/tutorial/scene'
import { candidates, describePosition, deckReference, buildRequest, claudeBotAction, claudeQuick, claudeDefers, claudeUsage, resetClaudeBot, lastClaudeNote, MAX_CANDIDATES, type AskClaude } from '../src/claude_bot'
import { fairView } from '../src/bot_search'
import { askClaude, buildApiRequest, parseApiResponse, parseRequest, SYSTEM_PROMPT, userMessage } from '../../server/src/claudeBot'

// seat 0 plays the bot here: two attackers next to an enemy minion, a spell and a site in hand
const board = () => scene({
  sites: [[0, 'Valley', 2, 0], [0, 'Spire', 2, 1], [0, 'Wasteland', 1, 1], [1, 'Wasteland', 2, 3], [1, 'Wasteland', 2, 2]],
  hand: ['Lightning Bolt', 'Stream'], foeHand: ['Hellhounds', 'Blaze'],
  units: [
    { key: 'war', p: 0, name: 'Amazon Warriors', x: 2, y: 1 }, { key: 'cat', p: 0, name: 'Snow Leopard', x: 1, y: 1 },
    { key: 'cam', p: 1, name: 'Raal Dromedary', x: 2, y: 2 },
  ],
})
const find = (cs: ReturnType<typeof candidates>, re: RegExp) => cs.findIndex((c) => re.test(c.text)) + 1

beforeEach(() => resetClaudeBot())

describe('Claude opponent — what Claude is told', () => {
  it('describes the board from its own seat and never reveals the opponent\'s hand', () => {
    const t = board()
    const text = describePosition(fairView(t.g, 0), 0)
    expect(text).toMatch(/It is YOUR turn/)
    expect(text).toMatch(/YOUR Amazon Warriors at c2/)
    expect(text).toMatch(/ENEMY Raal Dromedary at c3/)
    expect(text).toMatch(/Lightning Bolt \(Magic, cost 2\)/)          // the hand: name and cost only…
    expect(text).not.toMatch(/Lightning Bolt — Magic/)
    expect(deckReference(fairView(t.g, 0), 0)).toMatch(/Lightning Bolt — Magic, cost 2, needs 1 air/) // …the text is in the cached reference
    expect(text).toMatch(/No enemy unit is within one step of your Avatar/)
    expect(text).toMatch(/Opponent: .*2 cards in hand \(hidden\)/)
    expect(text).not.toMatch(/Hellhounds|Blaze/)
  })

  it('lists every legal move in words, with the search bot\'s choice marked', () => {
    const t = board()
    const cs = candidates(t.g, 0)
    expect(find(cs, /^END YOUR TURN$/)).toBeGreaterThan(0)
    expect(find(cs, /Amazon Warriors at c2 moves to c3 and ATTACKS Raal Dromedary \(enemy\) at c3/)).toBeGreaterThan(0)
    expect(find(cs, /^CAST Lightning Bolt targeting c3/)).toBeGreaterThan(0)
    expect(find(cs, /^Avatar: tap to PLAY Stream at/)).toBeGreaterThan(0)
    const attack = cs[find(cs, /Amazon Warriors.*ATTACKS Raal/) - 1].action
    const req = buildRequest(t.g, 0, cs, attack, 'kill the camel')
    expect(req.reference).toBe(deckReference(fairView(t.g, 0), 0))
    expect(req.candidates.filter((c) => /search engine's choice/.test(c))).toHaveLength(1)
    expect(req.candidates[0]).toMatch(/^1\. .*\[eval [+-]\d/)
    expect(req.notes).toBe('kill the camel')
  })

  it('names squares from the far seat too (a1 is always the bot\'s own back-left corner)', () => {
    const t = board()
    applyAction(t.g, 0, { t: 'endTurn' })
    const text = describePosition(fairView(t.g, 1), 1)
    expect(text).toMatch(/ENEMY Amazon Warriors at c3/)   // c2 seen from the other side
    expect(text).toMatch(/YOUR Raal Dromedary at c2/)
  })
})

describe('Claude opponent — keeping each call small', () => {
  it('says who could defend each attack, and warns about attackers next to its Avatar', () => {
    const t = scene({
      sites: [[0, 'Valley', 2, 0], [0, 'Spire', 2, 1], [1, 'Wasteland', 2, 3], [1, 'Wasteland', 2, 2], [1, 'Valley', 1, 2]],
      units: [
        { key: 'war', p: 0, name: 'Amazon Warriors', x: 2, y: 1 },
        { key: 'cam', p: 1, name: 'Raal Dromedary', x: 2, y: 2 }, { key: 'tro', p: 1, name: 'Cave Trolls', x: 1, y: 2 }, { key: 'dog', p: 1, name: 'Hellhounds', x: 2, y: 0 },
      ],
    })
    const cs = candidates(t.g, 0)
    expect(cs.find((c) => /Amazon Warriors.*ATTACKS Raal Dromedary/.test(c.text))!.text).toMatch(/\{may be defended by: Flamecaller, Cave Trolls \(3\)\}/)
    expect(describePosition(fairView(t.g, 0), 0)).toMatch(/THREAT: enemy units one step from your Avatar.*Hellhounds \(3\)/)
    expect(describePosition(fairView(t.g, 0), 0)).toMatch(/Cave Trolls — Minion/) // an enemy card's text is still spelled out
  })

  it('offers only the best few repositioning moves and site squares, and never more than the cap', () => {
    const t = scene({
      sites: [[0, 'Valley', 2, 0], [0, 'Spire', 2, 1], [0, 'Wasteland', 1, 1], [0, 'Stream', 3, 1], [0, 'Valley', 1, 0], [0, 'Valley', 3, 0], [1, 'Wasteland', 2, 3]],
      hand: ['Stream'],
      units: ['a', 'b', 'c', 'd'].map((k, i) => ({ key: k, p: 0 as const, name: 'Foot Soldiers', x: 1 + (i % 3), y: i < 3 ? 1 : 0 })),
    })
    const cs = candidates(t.g, 0)
    expect(cs.filter((c) => c.action.t === 'moveAttack' && !c.action.attack).length).toBeLessThanOrEqual(6)
    expect(cs.filter((c) => c.action.t === 'avatarSite' && c.action.mode === 'play').length).toBeLessThanOrEqual(4)
    expect(cs.length).toBeLessThanOrEqual(MAX_CANDIDATES)
    expect(cs.some((c) => c.action.t === 'endTurn')).toBe(true)
  })

  it('does not call Claude when there is nothing to decide, or for the game\'s housekeeping questions', async () => {
    const t = scene({ sites: [[0, 'Valley', 2, 0], [1, 'Wasteland', 2, 3]], units: [{ key: 'a', p: 0, name: 'Foot Soldiers', x: 2, y: 0, tapped: true }] })
    const ask = vi.fn(async () => ({ picks: [1], plan: 'x' }))
    applyAction(t.g, 0, { t: 'avatarSite', mode: 'draw' })   // Avatar spent: only "end turn" style moves remain
    const r = await claudeBotAction(t.g, 0, { t: 'endTurn' }, ask)
    expect(ask).not.toHaveBeenCalled()
    expect(r.action).toEqual({ t: 'endTurn' })
    applyAction(t.g, 0, { t: 'endTurn' })
    expect(t.g.prompts[0]?.kind).toBe('drawDeck')
    expect(claudeDefers(t.g)).toBe(true)                      // which deck to draw from: the search bot decides
  })

  it('adds up the tokens each call reports', async () => {
    const t = board()
    await claudeBotAction(t.g, 0, null, async () => ({ picks: [1], plan: 'a', usage: { input: 900, output: 120, cacheRead: 2400, cacheWrite: 0 } }))
    expect(claudeUsage()).toEqual({ calls: 1, input: 900, output: 120, cacheRead: 2400, cacheWrite: 0 })
  })
})

describe('Claude opponent — turning the answer into moves', () => {
  it('plays the first pick, then replays the rest of the plan without asking again', async () => {
    const t = board()
    const cs = candidates(t.g, 0)
    const site = find(cs, /PLAY Stream at/), attack = find(cs, /Amazon Warriors.*ATTACKS Raal/)
    const ask: AskClaude = vi.fn(async () => ({ picks: [site, attack], plan: 'Develop, then take the camel.' }))
    const first = await claudeBotAction(t.g, 0, null, ask)
    expect(first.source).toBe('claude')
    expect(first.action).toMatchObject({ t: 'avatarSite', mode: 'play' })
    expect(lastClaudeNote()).toBe('Develop, then take the camel.')
    expect(applyAction(t.g, 0, first.action).ok).toBe(true)
    const second = claudeQuick(t.g, 0)                       // no second call
    expect(second).toMatchObject({ t: 'moveAttack', unitId: t.ids.war })
    expect(ask).toHaveBeenCalledTimes(1)
    expect(claudeQuick(t.g, 0)).toBeNull()                   // plan exhausted → ask again next time
  })

  it('drops a queued move that is no longer legal', async () => {
    const t = board()
    const cs = candidates(t.g, 0)
    const bolt = find(cs, /^CAST Lightning Bolt targeting c3/), attack = find(cs, /Amazon Warriors.*ATTACKS Raal/)
    await claudeBotAction(t.g, 0, null, async () => ({ picks: [bolt, attack], plan: 'Bolt it, then attack it.' }))
    applyAction(t.g, 0, cs[bolt - 1].action)                 // the bolt kills the camel…
    expect(t.g.units[t.ids.cam]).toBeUndefined()
    expect(claudeQuick(t.g, 0)).toBeNull()                   // …so "attack the camel" is not replayed
  })

  it('falls back to the search bot\'s move when Claude answers nonsense, fails, or is too slow', async () => {
    const t = board()
    const suggestion: Action = { t: 'endTurn' }
    const junk = await claudeBotAction(t.g, 0, suggestion, async () => ({ picks: [0, 9999, 2.5 as number], plan: '' }))
    expect(junk).toMatchObject({ source: 'fallback', action: suggestion })
    const down = await claudeBotAction(t.g, 0, suggestion, async () => { throw new Error('HTTP 502') })
    expect(down.source).toBe('fallback'); expect(down.note).toMatch(/unavailable.*502/)
    const slow: AskClaude = (_req, signal) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))))
    const late = await claudeBotAction(t.g, 0, suggestion, slow, 30)
    expect(late.source).toBe('fallback'); expect(late.note).toMatch(/too long/)
  })
})

describe('Claude opponent — the server side', () => {
  const req = { position: 'Turn 3. It is YOUR turn.', candidates: ['1. END YOUR TURN  [eval +0.0]', '2. CAST Lightning Bolt targeting c3  [eval +2.0]'], notes: '' }

  it('accepts only the fixed request shape', () => {
    expect(parseRequest(req)).toMatchObject({ position: req.position })
    expect(parseRequest({ position: 'x' })).toMatch(/Expected/)
    expect(parseRequest({ position: 'x'.repeat(30000), candidates: ['1'] })).toMatch(/too long/)
    expect(parseRequest({ position: 'x', candidates: [] })).toMatch(/candidate/)
    expect(parseRequest({ position: 'x', candidates: [{ evil: 1 }] })).toMatch(/candidate/)
  })

  it('builds a Messages API request with a cached system prompt and the move tool', () => {
    const body = buildApiRequest(req, true) as any
    expect(body.model).toBe('claude-sonnet-5-5')
    expect(body.system[0]).toMatchObject({ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } })
    // with a deck reference, the cache breakpoint moves to the end of it (rules + reference are cached together)
    const withRef = buildApiRequest({ ...req, reference: 'Lightning Bolt — Magic, cost 2' }, true) as any
    expect(withRef.system).toHaveLength(2)
    expect(withRef.system[0].cache_control).toBeUndefined()
    expect(withRef.system[1]).toMatchObject({ cache_control: { type: 'ephemeral' } })
    expect(withRef.system[1].text).toMatch(/CARD REFERENCE[\s\S]*Lightning Bolt — Magic/)
    expect(body.thinking).toEqual({ type: 'adaptive' })
    expect(body.tool_choice).toEqual({ type: 'auto' })
    expect(body.messages[0].content).toBe(userMessage(req))
    expect(body.messages[0].content).toMatch(/LEGAL MOVES:\n1\. END YOUR TURN/)
    const plain = buildApiRequest(req, false) as any
    expect(plain.thinking).toBeUndefined()
    expect(plain.tool_choice).toEqual({ type: 'tool', name: 'choose_moves' })
  })

  it('reads the picks from the tool call, or from plain text, and discards anything out of range', () => {
    const tool = { content: [{ type: 'thinking', thinking: '…' }, { type: 'tool_use', name: 'choose_moves', input: { picks: [2, 2, 7, 1], plan: 'Bolt, then pass.' } }] }
    expect(parseApiResponse(tool, 2)).toEqual({ picks: [2, 1], plan: 'Bolt, then pass.' })
    expect(parseApiResponse({ content: [{ type: 'text', text: 'I play 2 and then 1.' }] }, 2).picks).toEqual([2, 1])
    expect(parseApiResponse({ content: [] }, 2).picks).toEqual([])
  })

  it('calls the API with the key, and retries without thinking when that request is rejected', async () => {
    const old = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'test-key'
    try {
      const seen: any[] = []
      const fake = async (url: string, init: any) => {
        seen.push({ url, headers: init.headers, body: JSON.parse(init.body) })
        if (seen.length === 1) return { ok: false, status: 400, json: async () => ({}), text: async () => 'thinking: unsupported' }
        return { ok: true, status: 200, text: async () => '', json: async () => ({ usage: { input_tokens: 700, output_tokens: 90, cache_read_input_tokens: 2100 }, content: [{ type: 'tool_use', name: 'choose_moves', input: { picks: [2], plan: 'Bolt the camel.' } }] }) }
      }
      const out = await askClaude(req, fake)
      expect(out).toMatchObject({ picks: [2], plan: 'Bolt the camel.', model: 'claude-sonnet-5-5', usage: { input: 700, output: 90, cacheRead: 2100, cacheWrite: 0 } })
      expect(seen).toHaveLength(2)
      expect(seen[0].url).toBe('https://api.anthropic.com/v1/messages')
      expect(seen[0].headers).toMatchObject({ 'x-api-key': 'test-key', 'anthropic-version': '2023-06-01' })
      expect(seen[0].body.thinking).toBeDefined()
      expect(seen[1].body.thinking).toBeUndefined()
      // CLAUDE_BOT_EFFORT=off: no thinking at all, one plain call
      process.env.CLAUDE_BOT_EFFORT = 'off'
      seen.length = 0
      const ok = async (_u: string, init: any) => { seen.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => '', json: async () => ({ content: [{ type: 'tool_use', name: 'choose_moves', input: { picks: [1], plan: 'Pass.' } }] }) } }
      await askClaude(req, ok)
      expect(seen).toHaveLength(1)
      expect(seen[0].thinking).toBeUndefined()
      delete process.env.CLAUDE_BOT_EFFORT
      await expect(askClaude(req, async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => 'bad key' }))).rejects.toThrow(/401/)
    } finally {
      if (old === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = old
    }
  })
})
