// Client UI preferences, persisted in localStorage. Small in-memory cache so reads are cheap (safe to
// call from render effects). Sound (mute) lives in sfx.ts since it's needed at module-load; everything
// else lives here. Add new optional toggles to Settings + DEFAULTS and surface them in SettingsModal.
/** How board squares are named to the player, everywhere (board overlay, logs, prompts):
 *  - 'standard':  a single number 1–20, left→right then top→bottom (1 2 3 4 5 / 6 … / … 20) — the default
 *  - 'chess':     column letter + row number, a1–e4 (the engine-native format)
 *  - 'cartesian': a (column,row) pair, 1-indexed from the top-left — (1,1)–(5,4) */
export type CoordSystem = 'chess' | 'standard' | 'cartesian'

export interface Settings {
  /** show the big center popup when the opponent plays a card (off by default) */
  opponentPlayPopup: boolean
  /** how board squares are labelled to the player */
  coordSystem: CoordSystem
}

const DEFAULTS: Settings = {
  opponentPlayPopup: false,
  coordSystem: 'standard',
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

export function getSettings(): Settings {
  return cache
}
export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return cache[key]
}
export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  cache = { ...cache, [key]: value }
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* storage blocked */ }
}
