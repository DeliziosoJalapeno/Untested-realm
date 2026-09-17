// Secret-achievement progress for THIS browser/account. The engine detects unlocks and records them
// in game state (see shared/engine/achievements.ts); this module is the persistence + account-sync
// layer, mirroring collection.ts. Unlocks are additive and never revoked, so sign-in / multi-device
// is a simple UNION (earliest earned-timestamp wins).

import { ACHIEVEMENTS } from '@sorcery/shared'
import * as auth from './auth'

/** id → epoch ms first earned */
export type Unlocked = Record<string, number>

const KEY = 'sorcery-achievements'
const OWNER_KEY = 'sorcery-achievements-owner'
const VALID = new Set(ACHIEVEMENTS.map((a) => a.id))

export function loadUnlocked(): Unlocked {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (d && typeof d === 'object') {
      const out: Unlocked = {}
      for (const [id, t] of Object.entries(d)) if (VALID.has(id) && typeof t === 'number') out[id] = t
      return out
    }
  } catch { /* fresh */ }
  return {}
}

function writeLocal(u: Unlocked): void { localStorage.setItem(KEY, JSON.stringify(u)) }

export function unlockedCount(u: Unlocked = loadUnlocked()): number { return Object.keys(u).length }
export function isUnlocked(id: string, u: Unlocked = loadUnlocked()): boolean { return !!u[id] }

/**
 * Record earned achievement ids. Returns the ones that are NEWLY unlocked (weren't already earned),
 * so the caller can toast exactly those. Persists locally + mirrors to the account when signed in.
 */
export function markUnlocked(ids: string[], now: number = Date.now()): string[] {
  const u = loadUnlocked()
  const fresh: string[] = []
  for (const id of ids) {
    if (!VALID.has(id) || u[id]) continue
    u[id] = now
    fresh.push(id)
  }
  if (fresh.length) {
    writeLocal(u)
    if (auth.isSignedIn()) void auth.pushAchievements(u).catch(() => { /* offline / stale token */ })
  }
  return fresh
}

function union(a: Unlocked, b: Unlocked): Unlocked {
  const out: Unlocked = { ...a }
  for (const [id, t] of Object.entries(b)) {
    if (!VALID.has(id)) continue
    out[id] = out[id] ? Math.min(out[id], t) : t
  }
  return out
}

/** On sign-in, merge this browser's unlocks with the account's (union) so nothing is ever lost. */
export async function syncAchievementsOnSignIn(username: string): Promise<void> {
  const local = loadUnlocked()
  let server: Unlocked = {}
  try { server = (await auth.fetchAchievements()) ?? {} } catch { /* offline */ }
  const merged = union(server, local)
  writeLocal(merged)
  localStorage.setItem(OWNER_KEY, username)
  // push the union back so the account reflects any guest-earned unlocks
  if (Object.keys(merged).length > Object.keys(server).length) {
    try { await auth.pushAchievements(merged) } catch { /* offline */ }
  }
}

/** On logout, drop the account's unlocks from this browser (back to an empty guest slate). */
export function clearAchievementsOnLogout(): void {
  writeLocal({})
  localStorage.setItem(OWNER_KEY, 'guest')
}
