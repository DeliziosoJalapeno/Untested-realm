// Card sound effects (Cockatrice open-source set, in public/sfx/). A tiny play-on-demand layer:
// preload one <audio> per cue, clone it to play so rapid repeats can overlap, and honour a
// persisted mute toggle. All failures (autoplay policy before the first gesture, missing file)
// are swallowed — sound is never allowed to break the game.
export type SfxKey = 'cuckoo' | 'draw' | 'error' | 'play' | 'rolldie' | 'shuffle' | 'tap' | 'untap'

const FILES: Record<SfxKey, string> = {
  cuckoo: '/sfx/cuckoo.wav',          // start of a turn
  draw: '/sfx/draw.wav',              // drawing card(s)
  error: '/sfx/error.wav',            // the red error message
  play: '/sfx/playcard.wav',          // a card is cast / played
  rolldie: '/sfx/rolldie.wav',        // any random outcome
  shuffle: '/sfx/shuffle.wav',        // shuffling
  tap: '/sfx/tap.wav',                // tapping
  untap: '/sfx/untap.wav',            // untapping
}

const VOLUME = 0.5
const STORE_KEY = 'sorcery-sfx'
let muted = (() => { try { return localStorage.getItem(STORE_KEY) === 'off' } catch { return false } })()

// one preloaded base element per cue; cloned on play so overlapping repeats don't cut each other off
const bases: Partial<Record<SfxKey, HTMLAudioElement>> = {}
function base(key: SfxKey): HTMLAudioElement {
  let b = bases[key]
  if (!b) { b = new Audio(FILES[key]); b.preload = 'auto'; b.volume = VOLUME; bases[key] = b }
  return b
}

/** Play a sound cue (no-op when muted). Safe to call from render effects. */
export function sfx(key: SfxKey): void {
  if (muted) return
  try {
    const a = base(key).cloneNode(true) as HTMLAudioElement
    a.volume = VOLUME
    void a.play().catch(() => { /* autoplay blocked until first gesture — ignore */ })
  } catch { /* ignore */ }
}

export function sfxMuted(): boolean { return muted }
export function setSfxMuted(m: boolean): void {
  muted = m
  try { localStorage.setItem(STORE_KEY, m ? 'off' : 'on') } catch { /* ignore */ }
}

/** Warm the cache so the first real cue has no fetch delay (call once, after mount). */
export function preloadSfx(): void {
  for (const k of Object.keys(FILES) as SfxKey[]) base(k)
}
