// The hosted game archive (finished games committed to a GitHub branch) and the written-review request.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildRecord } from '../../server/src/localReplays'
import { saveHostedReplay, hostedArchiveOn, resetHostedArchive, archiveAllowed, hostedArchiveStatus } from '../../server/src/gameArchive'
import { parseReviewRequest, reviewGame } from '../../server/src/claudeBot'

const replay = () => ({ replayVersion: 1, createdAt: Date.UTC(2026, 10, 16, 19, 28, 5), mode: 'bot', decks: [{ name: 'Frost Mage (FvL precon)' }, { name: 'Lavamancer / test' }], names: ['You', 'Computer'], seed: 1, firstPlayer: 0, clock: null, actions: [{ seat: 0, action: { t: 'keepHand' } }], winner: 0 })

interface Call { method: string; url: string; body: any }
function fakeGitHub(existing: Record<string, string> = {}, branchExists = true) {
  const calls: Call[] = []
  const files = { ...existing }
  const f = async (url: string, init: any = {}) => {
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ method, url, body })
    const reply = (status: number, data: any = {}) => ({ ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data) })
    const path = url.replace('https://api.github.com/repos/owner/repo', '')
    if (path.startsWith('/git/ref/heads/')) return branchExists ? reply(200, { object: { sha: 'r' } }) : reply(404, { message: 'Not Found' })
    if (path === '/git/trees') return reply(201, { sha: 'tree1' })
    if (path === '/git/commits') return reply(201, { sha: 'commit1' })
    if (path === '/git/refs') { branchExists = true; return reply(201, {}) }
    if (path.startsWith('/contents/')) {
      const file = decodeURIComponent(path.slice('/contents/'.length).split('?')[0])
      if (method === 'GET') return files[file] ? reply(200, { sha: files[file] }) : reply(404, {})
      if (method === 'PUT') { if (files[file] && body.sha !== files[file]) return reply(409, { message: 'sha' }); const made = !files[file]; files[file] = 'sha-' + calls.length; return reply(made ? 201 : 200, {}) }
      if (method === 'DELETE') { delete files[file]; return reply(200, {}) }
    }
    return reply(500, { message: 'unexpected ' + path })
  }
  return { f: f as any, calls, files }
}

describe('game archive record', () => {
  it('names the file from the game and keeps the report, review and Claude journal', () => {
    const b = buildRecord({ replay: replay(), finished: true, turn: 21, botDifficulty: 'claude', report: { version: 1 }, review: 'A close game.', claude: { decisions: [1, 2] } })
    if ('error' in b) throw new Error(b.error)
    expect(b.folder).toBe('games')
    expect(b.name).toBe('2026-11-16_192805_bot-claude_Frost-Mage-FvL-precon_vs_Lavamancer-test.json')
    expect(b.record).toMatchObject({ finished: true, winner: 'You', turns: 21, botDifficulty: 'claude', review: 'A close game.', report: { version: 1 }, claude: { decisions: [1, 2] } })
  })
  it('puts a flagged game in the review queue, drops oversized extras and refuses what is not a replay', () => {
    const b = buildRecord({ replay: replay(), flags: [{ at: 99, turn: 3, note: 'odd' }], report: { big: 'x'.repeat(300_000) } })
    if ('error' in b) throw new Error(b.error)
    expect(b.folder).toBe('review')
    expect((b.record.flags as any[])[0].at).toBe(1) // clamped to the game's length
    expect(b.record.report).toBeUndefined()
    expect(buildRecord({ replay: { actions: 'no' } })).toMatchObject({ status: 400 })
    expect(buildRecord(null)).toMatchObject({ status: 400 })
  })
})

describe('hosted archive on GitHub', () => {
  const env = { ...process.env }
  beforeEach(() => { process.env.GAME_ARCHIVE_TOKEN = 'tkn'; process.env.GAME_ARCHIVE_REPO = 'owner/repo'; delete process.env.GAME_ARCHIVE_BRANCH; resetHostedArchive() })
  afterEach(() => { process.env = { ...env } })
  const built = (extra: object = {}) => { const b = buildRecord({ replay: replay(), finished: true, ...extra }); if ('error' in b) throw new Error(b.error); return b }

  it('is off without a token', () => {
    expect(hostedArchiveOn()).toBe(true)
    delete process.env.GAME_ARCHIVE_TOKEN
    expect(hostedArchiveOn()).toBe(false)
  })
  it('commits a new game to the archive branch with the token, and never to main', async () => {
    const gh = fakeGitHub()
    const file = await saveHostedReplay(built(), gh.f)
    expect(file).toMatch(/^games\/2026-11-16_192805_bot_/)
    const put = gh.calls.find((c) => c.method === 'PUT')!
    expect(put.url).toContain('/contents/match-replays/games/')
    expect(put.body.branch).toBe('game-archive')
    expect(put.body.sha).toBeUndefined()
    expect(JSON.parse(Buffer.from(put.body.content, 'base64').toString('utf8')).replay.seed).toBe(1)
    expect(gh.calls.every((c) => !JSON.stringify(c.body ?? {}).includes('"main"'))).toBe(true)
  })
  it('creates the branch from its own root commit when it does not exist yet', async () => {
    const gh = fakeGitHub({}, false)
    await saveHostedReplay(built(), gh.f)
    const commit = gh.calls.find((c) => c.url.endsWith('/git/commits'))!
    expect(commit.body.parents).toEqual([])
    expect(gh.calls.find((c) => c.url.endsWith('/git/refs'))!.body.ref).toBe('refs/heads/game-archive')
  })
  it('replaces the first save when the report arrives, and moves a game that gets flagged', async () => {
    const gh = fakeGitHub()
    const first = await saveHostedReplay(built(), gh.f)
    await saveHostedReplay(built({ report: { version: 1 } }), gh.f)
    const puts = gh.calls.filter((c) => c.method === 'PUT')
    expect(puts).toHaveLength(2)
    expect(puts[1].body.sha).toBeTruthy()
    await saveHostedReplay(built({ flags: [{ at: 1, turn: 2, note: 'look here' }] }), gh.f)
    expect(Object.keys(gh.files)).toEqual([`match-replays/${first.replace('games/', 'review/')}`])
  })
  it('reports a failure instead of pretending the game was saved', async () => {
    const f = (async () => ({ ok: false, status: 401, json: async () => ({ message: 'Bad credentials' }), text: async () => '' })) as any
    await expect(saveHostedReplay(built(), f)).rejects.toThrow(/401/)
  })
  it('remembers what happened to the last save, with what to do about a refusal', async () => {
    const gh = fakeGitHub()
    await saveHostedReplay(built(), gh.f)
    await new Promise((r) => setTimeout(r, 0))
    expect(hostedArchiveStatus()).toMatchObject({ ok: true, saved: 1, failed: 0, repo: 'owner/repo', branch: 'game-archive' })
    const refuse = (async () => ({ ok: false, status: 403, json: async () => ({ message: 'Resource not accessible by personal access token' }), text: async () => '' })) as any
    await expect(saveHostedReplay(built(), refuse)).rejects.toThrow(/403/)
    await new Promise((r) => setTimeout(r, 0))
    const st = hostedArchiveStatus()
    expect(st).toMatchObject({ ok: false, saved: 1, failed: 1 })
    expect(st.error).toMatch(/Contents: Read and write/)
    expect(JSON.stringify(st)).not.toContain('tkn')
  })
  it('limits how many games one address can save in an hour', () => {
    for (let i = 0; i < 5; i++) expect(archiveAllowed('1.2.3.4', 5)).toBe(true)
    expect(archiveAllowed('1.2.3.4', 5)).toBe(false)
    expect(archiveAllowed('5.6.7.8', 5)).toBe(true)
  })
})

describe('written review', () => {
  const env = { ...process.env }
  afterEach(() => { process.env = { ...env } })
  it('refuses an empty or oversized summary', () => {
    expect(parseReviewRequest({ summary: 'short' })).toBe('Nothing to review.')
    expect(parseReviewRequest({ summary: 'x'.repeat(90_000) })).toMatch(/too long/)
    expect(parseReviewRequest({ summary: 'x'.repeat(500) })).toEqual({ summary: 'x'.repeat(500) })
  })
  it('sends the summary to the API with the key and returns the text', async () => {
    process.env.ANTHROPIC_API_KEY = 'k'
    let sent: any
    const f = (async (_url: string, init: any) => { sent = init; return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Key moments: turn 14.' }], usage: { input_tokens: 10, output_tokens: 5 } }), text: async () => '' } }) as any
    const out = await reviewGame('the report and the log', f)
    expect(out.text).toBe('Key moments: turn 14.')
    expect(sent.headers['x-api-key']).toBe('k')
    expect(JSON.parse(sent.body).messages[0].content).toBe('the report and the log')
  })
  it('fails without a key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(reviewGame('x')).rejects.toThrow(/not configured/)
  })
})
