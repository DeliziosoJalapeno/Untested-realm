// SQLite persistence for accounts + saved decks. Uses Node's built-in
// `node:sqlite` (no native build, no extra dependency). One file on disk.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DB_PATH = process.env.SORCERY_DB ?? resolve(import.meta.dirname, '../data/sorcery.db')
mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

// migrate the pre-ID decks table (keyed by name) → keyed by a stable deck_id.
// Pre-launch, so no real data to preserve — drop the old-shape table if present.
{
  const cols = db.prepare("PRAGMA table_info(decks)").all() as { name: string }[]
  if (cols.length && !cols.some((c) => c.name === 'deck_id')) db.exec('DROP TABLE decks')
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash  TEXT NOT NULL,
    pass_salt  TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS decks (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deck_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, deck_id)
  );
  CREATE TABLE IF NOT EXISTS collections (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  -- secret achievements: { unlocked: { <id>: <first-earned epoch ms> } }
  CREATE TABLE IF NOT EXISTS achievements (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  -- saved board scenarios: full GameState snapshots. owner_id NULL = a built-in
  -- (seeded from the audit fixtures); is_public rows are visible to everyone.
  CREATE TABLE IF NOT EXISTS scenarios (
    id         TEXT PRIMARY KEY,
    owner_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    is_public  INTEGER NOT NULL DEFAULT 1,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scenarios_owner ON scenarios(owner_id);
  CREATE INDEX IF NOT EXISTS idx_scenarios_public ON scenarios(is_public);
`)

export interface UserRow { id: number; username: string; pass_hash: string; pass_salt: string; created_at: number }

const q = {
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (username, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?)'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
  sessionByHash: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  purgeExpired: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
  decksByUser: db.prepare('SELECT data FROM decks WHERE user_id = ? ORDER BY updated_at DESC'),
  upsertDeck: db.prepare(`
    INSERT INTO decks (user_id, deck_id, name, data, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, deck_id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`),
  deleteDeck: db.prepare('DELETE FROM decks WHERE user_id = ? AND deck_id = ?'),
  clearDecks: db.prepare('DELETE FROM decks WHERE user_id = ?'),
  getCollection: db.prepare('SELECT data FROM collections WHERE user_id = ?'),
  setCollection: db.prepare(`
    INSERT INTO collections (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
  getAchievements: db.prepare('SELECT data FROM achievements WHERE user_id = ?'),
  setAchievements: db.prepare(`
    INSERT INTO achievements (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
  // scenarios: list all public + the caller's own (pass -1 for a signed-out caller)
  scenListVisible: db.prepare(`
    SELECT id, owner_id, name, is_public, updated_at FROM scenarios
    WHERE is_public = 1 OR owner_id = ? ORDER BY updated_at DESC`),
  scenById: db.prepare('SELECT * FROM scenarios WHERE id = ?'),
  scenUpsert: db.prepare(`
    INSERT INTO scenarios (id, owner_id, name, is_public, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, is_public = excluded.is_public, data = excluded.data, updated_at = excluded.updated_at`),
  scenDelete: db.prepare('DELETE FROM scenarios WHERE id = ? AND owner_id = ?'),
  scenSeedBuiltin: db.prepare(`
    INSERT INTO scenarios (id, owner_id, name, is_public, data, updated_at) VALUES (?, NULL, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`),
}

export interface ScenarioRow { id: string; owner_id: number | null; name: string; is_public: number; data: string; updated_at: number }
/** list-facing metadata (no heavy `data` blob) */
export interface ScenarioMeta { id: string; name: string; isPublic: boolean; builtin: boolean; mine: boolean; updatedAt: number }

export const users = {
  byName: (name: string) => q.userByName.get(name) as UserRow | undefined,
  byId: (id: number) => q.userById.get(id) as UserRow | undefined,
  create: (username: string, passHash: string, passSalt: string) =>
    q.insertUser.run(username, passHash, passSalt, Date.now()),
}

export const sessions = {
  create: (tokenHash: string, userId: number, ttlMs: number) => {
    const now = Date.now()
    q.insertSession.run(tokenHash, userId, now, now + ttlMs)
  },
  get: (tokenHash: string) => q.sessionByHash.get(tokenHash) as { token_hash: string; user_id: number; expires_at: number } | undefined,
  drop: (tokenHash: string) => q.deleteSession.run(tokenHash),
  purgeExpired: () => q.purgeExpired.run(Date.now()),
}

export const decks = {
  list: (userId: number) => (q.decksByUser.all(userId) as { data: string }[]).map((r) => JSON.parse(r.data)),
  upsert: (userId: number, deckId: string, name: string, data: unknown) =>
    q.upsertDeck.run(userId, deckId, name, JSON.stringify(data), Date.now()),
  remove: (userId: number, deckId: string) => q.deleteDeck.run(userId, deckId),
  replaceAll: (userId: number, list: { id: string; name: string }[]) => {
    db.prepare('BEGIN').run()
    try {
      q.clearDecks.run(userId)
      const now = Date.now()
      for (const d of list) q.upsertDeck.run(userId, d.id, d.name, JSON.stringify(d), now)
      db.prepare('COMMIT').run()
    } catch (e) { db.prepare('ROLLBACK').run(); throw e }
  },
}

export const collections = {
  get: (userId: number): unknown | null => {
    const r = q.getCollection.get(userId) as { data: string } | undefined
    return r ? JSON.parse(r.data) : null
  },
  set: (userId: number, data: unknown) => q.setCollection.run(userId, JSON.stringify(data), Date.now()),
}

export const achievements = {
  get: (userId: number): Record<string, number> => {
    const r = q.getAchievements.get(userId) as { data: string } | undefined
    if (!r) return {}
    try { const d = JSON.parse(r.data); return d && typeof d === 'object' && d.unlocked ? d.unlocked : {} } catch { return {} }
  },
  set: (userId: number, unlocked: Record<string, number>) =>
    q.setAchievements.run(userId, JSON.stringify({ unlocked }), Date.now()),
}

export const scenarios = {
  /** metadata for every scenario the caller may see (all public + their own). */
  listVisible: (userId: number | null): ScenarioMeta[] =>
    (q.scenListVisible.all(userId ?? -1) as unknown as ScenarioRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      isPublic: !!r.is_public,
      builtin: r.owner_id === null,
      mine: userId != null && r.owner_id === userId,
      updatedAt: r.updated_at,
    })),
  get: (id: string): ScenarioRow | undefined => q.scenById.get(id) as unknown as ScenarioRow | undefined,
  upsert: (ownerId: number, id: string, name: string, isPublic: boolean, data: unknown) =>
    q.scenUpsert.run(id, ownerId, name, isPublic ? 1 : 0, JSON.stringify(data), Date.now()),
  remove: (ownerId: number, id: string) => q.scenDelete.run(id, ownerId),
  /** upsert a public, owner-less built-in (seeded from the audit fixtures). */
  seedBuiltin: (id: string, name: string, data: unknown) =>
    q.scenSeedBuiltin.run(id, name, JSON.stringify(data), Date.now()),
}
