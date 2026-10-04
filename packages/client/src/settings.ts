// Client UI preferences, persisted in localStorage. Small in-memory cache so reads are cheap (safe to
// call from render effects). Sound (mute) lives in sfx.ts since it's needed at module-load; everything
// else lives here. Add new optional toggles to Settings + DEFAULTS and surface them in SettingsModal.
export interface Settings {
  /** show the big center popup when the opponent plays a card (off by default) */
  opponentPlayPopup: boolean
}

const DEFAULTS: Settings = {
  opponentPlayPopup: false,
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
