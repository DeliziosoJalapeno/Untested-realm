// The hosted game archive. A host without a disk (Render's free plan) forgets its database on every
// deploy, so finished games are committed to a branch of a GitHub repository instead:
//
//   <branch>/match-replays/games/    finished games
//   <branch>/match-replays/review/   games with a flagged moment
//
// the same layout and file format as the on-disk archive (localReplays.ts), so `npm run replay:review`
// reads a checkout of that branch. The branch has its own root commit: it holds only games, and a commit
// to it does not redeploy the site.
//
//   GAME_ARCHIVE_TOKEN    a GitHub token that may write the repository's contents (required; off without it)
//   GAME_ARCHIVE_REPO     owner/name (default: BarelyCoded/Untested-realm)
//   GAME_ARCHIVE_BRANCH   default: match-replays
import type { BuiltRecord } from './localReplays'

type Fetch = (url: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>

const repo = (): string => process.env.GAME_ARCHIVE_REPO || 'BarelyCoded/Untested-realm'
const branch = (): string => process.env.GAME_ARCHIVE_BRANCH || 'match-replays'
export const hostedArchiveOn = (): boolean => !!process.env.GAME_ARCHIVE_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(repo())

async function gh(fetchImpl: Fetch, method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetchImpl(`https://api.github.com/repos/${repo()}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GAME_ARCHIVE_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'realmforge-game-archive',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  let data: any = null
  try { data = await res.json() } catch { /* no body */ }
  return { status: res.status, data }
}

const README = `# Match replays

Finished games from the hosted site, written here automatically (see packages/server/src/gameArchive.ts on the main branch).

- \`match-replays/games/\`: finished games
- \`match-replays/review/\`: games with a moment flagged for review

Each file holds the replay (decks, seed, actions), and where available the engine report, Claude's written review and the Claude opponent's decision journal.
`

let branchReady = false
/** make sure the archive branch exists; a new one starts from its own root commit, holding only a README */
async function ensureBranch(f: Fetch): Promise<void> {
  if (branchReady) return
  const ref = await gh(f, 'GET', `/git/ref/heads/${branch()}`)
  if (ref.status === 200) { branchReady = true; return }
  if (ref.status !== 404) throw new Error(`GitHub ${ref.status} reading the archive branch: ${String(ref.data?.message ?? '').slice(0, 200)}`)
  const tree = await gh(f, 'POST', '/git/trees', { tree: [{ path: 'README.md', mode: '100644', type: 'blob', content: README }] })
  if (tree.status !== 201) throw new Error(`GitHub ${tree.status} creating the archive branch: ${String(tree.data?.message ?? '').slice(0, 200)}`)
  const commit = await gh(f, 'POST', '/git/commits', { message: 'Start the match-replay archive', tree: tree.data.sha, parents: [] })
  if (commit.status !== 201) throw new Error(`GitHub ${commit.status} creating the archive branch: ${String(commit.data?.message ?? '').slice(0, 200)}`)
  const made = await gh(f, 'POST', '/git/refs', { ref: `refs/heads/${branch()}`, sha: commit.data.sha })
  if (made.status !== 201 && made.status !== 422) throw new Error(`GitHub ${made.status} creating the archive branch: ${String(made.data?.message ?? '').slice(0, 200)}`) // 422: someone just made it
  branchReady = true
}

const shaOf = async (f: Fetch, path: string): Promise<string | null> => {
  const r = await gh(f, 'GET', `/contents/${path}?ref=${encodeURIComponent(branch())}`)
  return r.status === 200 && typeof r.data?.sha === 'string' ? r.data.sha : null
}

async function put(f: Fetch, b: BuiltRecord): Promise<string> {
  await ensureBranch(f)
  const path = `match-replays/${b.folder}/${b.name}`
  const content = Buffer.from(JSON.stringify(b.record, null, 1), 'utf8').toString('base64')
  const message = `${b.record.finished ? 'Game' : 'Flagged game'}: ${b.name.replace(/\.json$/, '')}`
  for (let attempt = 0; ; attempt++) {
    const sha = await shaOf(f, path) // a second save of the same game (its report arriving) replaces the first
    const res = await gh(f, 'PUT', `/contents/${path}`, { message, content, branch: branch(), ...(sha ? { sha } : {}) })
    if (res.status === 200 || res.status === 201) break
    if (res.status === 409 && attempt < 2) continue // the branch moved under us: read the sha again
    throw new Error(`GitHub ${res.status} saving the game: ${String(res.data?.message ?? '').slice(0, 200)}`)
  }
  // a game flagged after an earlier save moves to the review queue
  const otherPath = `match-replays/${b.other}/${b.name}`
  const otherSha = await shaOf(f, otherPath)
  if (otherSha) await gh(f, 'DELETE', `/contents/${otherPath}`, { message: `Move to ${b.folder}: ${b.name}`, sha: otherSha, branch: branch() })
  return `${b.folder}/${b.name}`
}

// one write at a time: two commits to one branch at once would collide
let queue: Promise<unknown> = Promise.resolve()
export function saveHostedReplay(b: BuiltRecord, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<string> {
  const job = queue.then(() => put(fetchImpl, b))
  queue = job.catch(() => undefined)
  return job
}

/** for tests */
export function resetHostedArchive(): void { branchReady = false; queue = Promise.resolve() }

// a per-address allowance: this endpoint is open to anyone playing on the site and writes to a repository
const WINDOW_MS = 60 * 60 * 1000
const seen = new Map<string, number[]>()
export function archiveAllowed(ip: string, limit = Number(process.env.GAME_ARCHIVE_PER_HOUR ?? 40)): boolean {
  const now = Date.now()
  const list = (seen.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= limit) { seen.set(ip, list); return false }
  list.push(now); seen.set(ip, list)
  if (seen.size > 5000) for (const [k, v] of seen) if (!v.some((t) => now - t < WINDOW_MS)) seen.delete(k)
  return true
}
