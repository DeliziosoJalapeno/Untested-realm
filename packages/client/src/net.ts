// WebSocket client with auto-reconnect + rejoin.

import type { Action, ClockConfig, DeckList, PlayerId } from '@sorcery/shared'
import type { PlayerView } from '@sorcery/shared'

/** creator's choices when opening a Sealed room (the play clock is separate). */
export interface SealedConfig {
  edition: string // 'Alpha' | 'Beta' | 'Arthurian Legends' | 'Gothic' | 'Random'
  numPacks: number
  deckbuildMin: number // deck-construction timer, minutes
}

/** the per-seat sealed deckbuild snapshot (each seat sees only its own pool). */
export interface SealedStateMsg {
  t: 'sealedState'
  seat: PlayerId | null
  spectator: boolean
  edition: string
  numPacks: number
  packs: string[][] // each seat's opened boosters (secret to that seat), for pack-by-pack opening
  pool: Record<string, number>
  deck: DeckList | null
  youReady: boolean
  oppReady: boolean
  oppPresent: boolean
  deadline: number | null
  deckbuildMs: number
  playClock: ClockConfig | null
}

export type ServerMsg =
  | { t: 'joined'; code: string; id: string; seat: PlayerId | null; token: string | null; mode?: 'standard' | 'sealed' }
  | {
      t: 'state'; view: PlayerView; undoAsk?: string | null; editorAsk?: string | null; editorAllowed?: boolean
      // post-game rematch offer (rides in every state so it survives a reconnect):
      rematchDeadline?: number | null; rematchYou?: boolean; rematchOpp?: boolean
    }
  | SealedStateMsg
  | { t: 'error'; msg: string }
  | { t: 'chat'; from: string; msg: string }
  | { t: 'undoAsk'; from: string }
  | { t: 'editorAsk'; from: string }
  | { t: 'editorGranted' }
  | { t: 'searching' }
  | { t: 'matchCancelled' }
  // both players agreed to a rematch → the room is back at DECK SELECTION; pick a deck again.
  | { t: 'rematchStart'; mode: 'standard' | 'sealed' }

export class Net {
  private ws: WebSocket | null = null
  private url: string
  onMessage: (msg: ServerMsg) => void = () => {}
  /** called on the FIRST successful connect (initial create/join/matchmake/rejoin). */
  onOpen: () => void = () => {}
  onClose: () => void = () => {}
  /** called on each AUTOMATIC reconnect to re-establish the session (e.g. rejoin).
   *  When null, a dropped socket is NOT retried. Set it once you're in a room. */
  onReopen: (() => void) | null = null
  private deliberate = false // true after close() — suppresses auto-reconnect
  private opened = false      // has the first connect succeeded?
  private attempts = 0        // consecutive reconnect attempts (for backoff)
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    this.url = `${proto}://${location.host}/ws`
  }

  connect(): void {
    this.deliberate = false
    this.ws = new WebSocket(this.url)
    this.ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data))
      } catch {
        // ignore malformed frames
      }
    }
    this.ws.onopen = () => {
      this.attempts = 0
      if (!this.opened) { this.opened = true; this.onOpen() }
      else if (this.onReopen) this.onReopen()
    }
    this.ws.onclose = () => {
      this.onClose()
      if (!this.deliberate && this.onReopen) this.scheduleReconnect()
    }
  }

  /** retry the connection with exponential backoff (capped), giving up eventually. */
  private scheduleReconnect(): void {
    if (this.attempts >= 12) return // ~a couple of minutes of retries, then stop
    const delay = Math.min(1000 * 2 ** this.attempts, 15000)
    this.attempts++
    this.timer = setTimeout(() => this.connect(), delay)
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data))
  }

  create(name: string, deck: DeckList, clock: ClockConfig | null = null, isPublic = false, authToken: string | null = null, secondSeer = false): void {
    this.send({ t: 'create', name, deck, clock, isPublic, authToken, secondSeer })
  }
  join(code: string, name: string, deck: DeckList, authToken: string | null = null): void {
    this.send({ t: 'join', code, name, deck, authToken })
  }
  /** open a Sealed room (no deck — players build during the timed deckbuild phase). */
  createSealed(name: string, cfg: SealedConfig, clock: ClockConfig | null = null, isPublic = false, authToken: string | null = null, secondSeer = false): void {
    this.send({ t: 'createSealed', name, ...cfg, clock, isPublic, authToken, secondSeer })
  }
  /** join a Sealed room (no deck up front). */
  joinSealed(code: string, name: string, authToken: string | null = null): void {
    this.send({ t: 'join', code, name, authToken })
  }
  /** submit / update your in-progress sealed deck, and (un)set your Ready flag. */
  sealedDeck(deck: DeckList, ready: boolean): void {
    this.send({ t: 'sealedDeck', deck, ready })
  }
  rejoin(code: string, token: string, authToken: string | null = null): void {
    // authToken lets a signed-in player reclaim their seat from a browser that lacks the
    // per-room token (account-based rejoin).
    this.send({ t: 'rejoin', code, token, authToken })
  }
  spectate(code: string): void {
    this.send({ t: 'spectate', code })
  }
  matchmake(name: string, deck: DeckList, authToken: string | null = null): void {
    this.send({ t: 'matchmake', name, deck, authToken })
  }
  cancelMatch(): void {
    this.send({ t: 'cancelMatch' })
  }
  /** free go-back from a card's first prompt (rolls back the tentative cast). */
  cancelCast(): void {
    this.send({ t: 'cancelCast' })
  }
  /** creator-only, pre-start: change your deck and/or the room clock. */
  roomConfig(deck: DeckList | null, clock: ClockConfig | null): void {
    this.send({ t: 'roomConfig', deck, clock })
  }
  /** answer the post-game "play again?" offer. Both seats yes → rematch starts immediately. */
  rematchVote(yes: boolean): void {
    this.send({ t: 'rematchVote', yes })
  }
  /** submit this seat's deck in the rematch deck-selection lobby (either seat, unlike roomConfig). */
  rematchDeck(deck: DeckList): void {
    this.send({ t: 'rematchDeck', deck })
  }
  close(): void {
    this.deliberate = true
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.ws?.close()
  }
  action(action: Action): void {
    this.send({ t: 'action', action })
  }
}
