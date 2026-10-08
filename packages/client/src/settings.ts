// Client UI preferences, persisted in localStorage. Small in-memory cache so reads are cheap (safe to
// call from render effects). Sound (mute) lives in sfx.ts since it's needed at module-load; everything
// else lives here. Add new optional toggles to Settings + DEFAULTS and surface them in SettingsModal.
/** How board squares are named to the player, everywhere (board overlay, logs, prompts):
 *  - 'standard':  a single number 1–20, left→right then top→bottom (1 2 3 4 5 / 6 … / … 20) — the default
 *  - 'chess':     column letter + row number, a1–e4 (the engine-native format)
 *  - 'cartesian': a (column,row) pair, 1-indexed from the top-left — (1,1)–(5,4) */
export type CoordSystem = 'chess' | 'standard' | 'cartesian'

/** How much a replay reveals:
 *  - 'off'         → spectator view: both players' hands & collections hidden (the default)
 *  - 'perspective' → watch from one player's side (their cards visible, the opponent's hidden); flippable
 *  - 'on'          → reveal everything — both hands & collections (god view) */
export type ReplayVisibility = 'off' | 'perspective' | 'on'

/** Home-screen look: 'high' = the classic page (wizard hero art, serif title, side card-art rails);
 *  'low' = the hand-drawn "meme" cover. High by default. */
export type HomepageQuality = 'low' | 'boring' | 'high'

export interface Settings {
  /** show the big center popup when the opponent plays a card (off by default) */
  opponentPlayPopup: boolean
  /** how board squares are labelled to the player */
  coordSystem: CoordSystem
  /** how much a replay reveals (spectator / one side / everything) */
  replayVisibility: ReplayVisibility
  /** home-screen look (classic 'high' vs hand-drawn 'low') */
  homepageQuality: HomepageQuality
}

const DEFAULTS: Settings = {
  opponentPlayPopup: false,
  coordSystem: 'standard',
  replayVisibility: 'off',
  homepageQuality: 'high',
}

const KEY = 'sorcery-settings'

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

let cache: Settings = load()

// subscribers notified whenever a setting changes, so live UI (e.g. the home screen reacting to the
// 'homepageQuality' toggle) can re-render immediately rather than only on next mount.
const listeners = new Set<() => void>()
export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getSettings(): Settings {
  return cache
}
export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return cache[key]
}
// Whether the user has EXPLICITLY chosen a homepage look (vs. still on the auto default). Tracked with a
// dedicated key because setSetting persists the whole merged Settings object — so the presence of the
// `homepageQuality` field in storage can't distinguish "chosen" from "written alongside another toggle".
// Used so the home screen can default to 'boring' on mobile until the user actually picks.
const HOMEPAGE_EXPLICIT_KEY = 'sorcery-homepage-explicit'
export function homepageQualityChosen(): boolean {
  try { return localStorage.getItem(HOMEPAGE_EXPLICIT_KEY) === '1' } catch { return false }
}
export function markHomepageQualityChosen(): void {
  try { localStorage.setItem(HOMEPAGE_EXPLICIT_KEY, '1') } catch { /* storage blocked */ }
}
export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  cache = { ...cache, [key]: value }
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* storage blocked */ }
  for (const l of listeners) l()
}
