// Client-side account state + API. The session token lives in localStorage and
// is sent as a Bearer header; decks sync to the server when signed in.
import type { DeckList, GameState } from '@sorcery/shared'

/** list-facing metadata for a saved scenario (no heavy state blob) */
export interface ScenarioMeta { id: string; name: string; isPublic: boolean; builtin: boolean; mine: boolean; updatedAt: number }
/** a scenario with its full GameState snapshot */
export interface ScenarioFull extends Omit<ScenarioMeta, 'updatedAt'> { data: GameState }

const TOKEN_KEY = 'sorcery-token'
const USER_KEY = 'sorcery-username'

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY) }
export function getUsername(): string | null { return localStorage.getItem(USER_KEY) }
export function isSignedIn(): boolean { return !!getToken() }

function setAuth(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, username)
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const token = getToken()
  const res = await fetch(path, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

export async function register(username: string, password: string): Promise<string> {
  const r = await api('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) })
  setAuth(r.token, r.user.username)
  return r.user.username
}
export async function login(username: string, password: string): Promise<string> {
  const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) })
  setAuth(r.token, r.user.username)
  return r.user.username
}
export async function logout(): Promise<void> {
  try { await api('/api/logout', { method: 'POST' }) } catch { /* best effort */ }
  clearAuth()
}
/** verify the stored token is still valid; returns the username or null */
export async function fetchMe(): Promise<string | null> {
  if (!getToken()) return null
  try { const r = await api('/api/me'); return r.user.username } catch { clearAuth(); return null }
}
export async function fetchDecks(): Promise<DeckList[]> {
  const r = await api('/api/decks')
  return r.decks as DeckList[]
}
/** bulk replace-all (first-sign-in migration) */
export async function pushDecks(decks: DeckList[]): Promise<void> {
  if (!getToken()) return
  await api('/api/decks', { method: 'PUT', body: JSON.stringify({ decks }) })
}
/** upsert ONE deck by id */
export async function pushDeck(deck: DeckList): Promise<void> {
  if (!getToken() || !deck.id) return
  await api(`/api/decks/${encodeURIComponent(deck.id)}`, { method: 'PUT', body: JSON.stringify({ deck }) })
}
/** delete ONE deck by id */
export async function deleteDeck(id: string): Promise<void> {
  if (!getToken()) return
  await api(`/api/decks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ---- scenarios (DB-backed board snapshots; public browse needs no sign-in) ----
export async function fetchScenarios(): Promise<ScenarioMeta[]> {
  const r = await api('/api/scenarios')
  return (r.scenarios ?? []) as ScenarioMeta[]
}
export async function fetchScenario(id: string): Promise<ScenarioFull> {
  const r = await api(`/api/scenarios/${encodeURIComponent(id)}`)
  return r.scenario as ScenarioFull
}
/** create/update one of your own scenarios (requires sign-in) */
export async function pushScenario(s: { id: string; name: string; isPublic: boolean; data: GameState }): Promise<void> {
  await api(`/api/scenarios/${encodeURIComponent(s.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ name: s.name, isPublic: s.isPublic, data: s.data }),
  })
}
export async function deleteScenario(id: string): Promise<void> {
  await api(`/api/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ---- public lobby (browse active public rooms + battles; no sign-in needed) ----
export interface RoomInfo {
  id: string   // UUID (share URL)
  code: string // short human code
  host: string
  opponent: string | null
  players: number
  inProgress: boolean
  joinable: boolean
  clock: { base: number; inc: number } | null
  origin: 'room' | 'battle'
  mode?: 'standard' | 'sealed'
  sealed?: { edition: string; numPacks: number; deckbuilding: boolean } | null
  createdAt: number
}
export async function fetchRooms(): Promise<RoomInfo[]> {
  const r = await api('/api/rooms')
  return (r.rooms ?? []) as RoomInfo[]
}

/** the site-wide server-restart notice (deadline in epoch ms), or null if none. */
export async function fetchAnnounce(): Promise<{ deadline: number | null }> {
  const r = await api('/api/announce')
  return { deadline: (r?.deadline ?? null) as number | null }
}

/** a live room this signed-in account holds a seat in (public OR private) — for rejoin. */
export interface MyRoomInfo {
  id: string
  code: string
  mode?: 'standard' | 'sealed'
  inProgress: boolean
  seat: number
  opponent: string | null
  createdAt: number
}
export async function fetchMyRooms(): Promise<MyRoomInfo[]> {
  if (!isSignedIn()) return []
  try {
    const r = await api('/api/my-rooms')
    return (r.rooms ?? []) as MyRoomInfo[]
  } catch {
    return []
  }
}

export async function fetchCollection(): Promise<any | null> {
  const r = await api('/api/collection')
  return r.collection ?? null
}
export async function pushCollection(collection: unknown): Promise<void> {
  if (!getToken()) return
  await api('/api/collection', { method: 'PUT', body: JSON.stringify({ collection }) })
}

export async function fetchAchievements(): Promise<Record<string, number> | null> {
  const r = await api('/api/achievements')
  return r.unlocked ?? null
}
export async function pushAchievements(unlocked: Record<string, number>): Promise<Record<string, number> | null> {
  if (!getToken()) return null
  const r = await api('/api/achievements', { method: 'PUT', body: JSON.stringify({ unlocked }) })
  return r.unlocked ?? null
}
