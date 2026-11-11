// Local match archive. When you run the game on your own machine, every finished local game (vs the
// computer or hotseat) — and any game you flag mid-way — is written as a JSON file under
// <repo>/match-replays/, so the games can be committed and reviewed later (`npm run replay:review`).
//
//   match-replays/review/   games with at least one flagged moment — the review queue
//   match-replays/games/    everything else
//
// A replay is the game's inputs (decks, seed, first player) plus its action list; the engine is
// deterministic, so any position can be rebuilt from it.
//
// Only requests from this machine are accepted, and the archive is off when NODE_ENV=production or
// LOCAL_REPLAY_DIR=off. Set LOCAL_REPLAY_DIR to a path to store the files somewhere else.
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname, join, resolve } from 'node:path'

/** the checkout's root: the nearest folder at or above the working directory that holds .git */
function repoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, '.git'))) return dir
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  return process.cwd()
}

function archiveDir(): string | null {
  const env = process.env.LOCAL_REPLAY_DIR
  if (env === 'off' || env === '0') return null
  if (env) return resolve(env)
  if (process.env.NODE_ENV === 'production') return null
  return join(repoRoot(), 'match-replays')
}

let commit: string | null | undefined
/** the code version the game was played on (replays re-run through the engine, so this matters) */
function codeCommit(): string | null {
  if (commit !== undefined) return commit
  try { commit = execSync('git rev-parse --short HEAD', { cwd: repoRoot(), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null } catch { commit = null }
  return commit
}

export function isLoopback(req: IncomingMessage): boolean {
  const a = req.socket.remoteAddress ?? ''
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'
}

const slug = (s: unknown): string => String(s ?? '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'deck'

export interface ReviewFlag { at: number; turn: number; note: string }

/** write (or overwrite) one game's file; returns where it went */
export function saveLocalReplay(body: any): { status: number; body: Record<string, unknown> } {
  const dir = archiveDir()
  if (!dir) return { status: 404, body: { error: 'The local match archive is off.' } }
  const r = body?.replay
  if (!r || !Array.isArray(r.actions) || !Array.isArray(r.decks) || r.decks.length !== 2 || typeof r.createdAt !== 'number') {
    return { status: 400, body: { error: 'Not a replay.' } }
  }
  const flags: ReviewFlag[] = (Array.isArray(body.flags) ? body.flags : [])
    .filter((f: any) => f && Number.isFinite(f.at))
    .map((f: any) => ({ at: Math.max(0, Math.min(Number(f.at), r.actions.length)), turn: Number(f.turn) || 0, note: String(f.note ?? '').slice(0, 2000) }))
  const d = new Date(r.createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const difficulty = r.mode === 'bot' && body.botDifficulty ? `-${slug(body.botDifficulty)}` : ''
  const name = `${stamp}_${slug(r.mode)}${difficulty}_${slug(r.decks[0]?.name)}_vs_${slug(r.decks[1]?.name)}.json`
  const folder = flags.length ? 'review' : 'games'
  const other = flags.length ? 'games' : 'review'
  const record = {
    savedAt: new Date().toISOString(),
    codeCommit: codeCommit(),
    finished: !!body.finished,
    winner: body.finished ? (r.winner === 0 || r.winner === 1 ? r.names?.[r.winner] ?? `Player ${r.winner + 1}` : 'none') : null,
    turns: Number(body.turn) || null,
    botDifficulty: r.mode === 'bot' ? body.botDifficulty ?? null : null,
    flags,
    replay: r,
  }
  mkdirSync(join(dir, folder), { recursive: true })
  writeFileSync(join(dir, folder, name), JSON.stringify(record, null, 1))
  rmSync(join(dir, other, name), { force: true }) // a game flagged after an earlier save moves to the review queue
  return { status: 200, body: { ok: true, file: `${folder}/${name}`, flags: flags.length } }
}
