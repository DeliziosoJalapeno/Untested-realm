// Sorcery simulator server: HTTP (serves the built client) + WebSocket rooms.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import { users, sessions, decks as deckStore, collections as collectionStore, scenarios as scenarioStore, achievements as achievementStore, type UserRow } from './db'
import {
  hashPassword, verifyPassword, newSessionToken, sha256,
  validateUsername, validatePassword, rateAllow, rateReset, SESSION_TTL_MS,
} from './auth'
import {
  createGame,
  applyAction,
  viewFor,
  viewSeatFor,
  actingSeatFor,
  validateDeck,
  validateSealedDeck,
  autofillSealedDeck,
  generateSealedPacks,
  aggregatePool,
  PACK_EDITIONS,
  settleClock,
  runningSeat,
  flagFall,
  extractCuriosaDeckId,
  curiosaToDeck,
  extractSorceryDeckId,
  sorceryToDeck,
  builtinScenarios,
  applyAchievements,
  ACHIEVEMENTS,
  isTentativeActivate,
  type Action,
  type ClockConfig,
  type CuriosaEntry,
  type SorceryDeckRaw,
  type DeckList,
  type GameState,
  type PackEditionChoice,
  type PlayerId,
} from '@sorcery/shared'

const PORT = Number(process.env.PORT ?? 8787)
const CLIENT_DIST = resolve(import.meta.dirname, '../../client/dist')

// ---- rooms ----

interface Seat {
  token: string
  name: string
  /** the signed-in account username that owns this seat (null for guests). Lets a
   *  logged-in player rejoin their seat from ANY browser, not just the one holding the
   *  original rejoin token. */
  account: string | null
  deck: DeckList | null
  socket: WebSocket | null
}

/** Sealed (Limited) deckbuild phase state — present only while `mode === 'sealed'`. */
interface SealedState {
  edition: PackEditionChoice
  numPacks: number
  /** how long the deck-construction phase lasts, in ms */
  deckbuildMs: number
  /** wall-clock ms when deckbuild ends; null until both seats are present */
  deadline: number | null
  /** each seat's opened boosters (list of packs, each a list of card names) — secret
   *  to that seat; the aggregate pool is derived from these for validation/building */
  packs: [string[][] | null, string[][] | null]
  /** each seat's in-progress deck */
  decks: [DeckList | null, DeckList | null]
  ready: [boolean, boolean]
}

interface Room {
  code: string // short human-shareable code (typed to join); the rooms-map key
  id: string   // opaque UUID used in the /room/<id> share URL
  /** listed in the public lobby (browsable + join/spectate) when true */
  isPublic: boolean
  /** 'room' = hand-made; 'battle' = created by "find a battle" matchmaking */
  origin: 'room' | 'battle'
  /** 'standard' = bring-your-own-deck; 'sealed' = open packs + timed deckbuild */
  mode: 'standard' | 'sealed'
  /** sealed deckbuild bookkeeping (null for standard rooms) */
  sealed: SealedState | null
  seats: [Seat | null, Seat | null]
  spectators: Set<WebSocket>
  game: GameState | null
  createdAt: number
  /** JSON snapshots taken before each action (for opponent-approved undo) */
  history: string[]
  pendingUndo: PlayerId | null
  /** a seat whose just-cast card is held tentatively (visible ONLY to that seat)
   *  until they answer its first prompt; a go-back rolls it back with the opponent
   *  never having seen it. null = nothing tentative. */
  tentative: PlayerId | null
  /** 'play' = legacy tentative (commit on the first prompt answer). 'activate' = a tentative-until-
   *  resolved activation (Animist "cast a magic as a Spirit"): held across ALL its prompts, then
   *  committed only if it changed the game, else rolled back to `tentativeStart` (no trace). */
  tentativeKind?: 'play' | 'activate'
  /** pre-action snapshot + history length to roll a tentative-activate flow back to */
  tentativeStart?: string | null
  tentativeBase?: number
  /** a seat requesting editor (game-state tools) access, awaiting opponent reply */
  pendingEditor: PlayerId | null
  /** per-seat: has the opponent granted this seat editor access this game? */
  editorGrant: [boolean, boolean]
  /** chosen by the room creator; null = untimed */
  clock: ClockConfig | null
  /** last wall-clock ms we charged the running seat (for the chess clock) */
  lastTick: number
  // ---- rematch offer (post-game "play again?" handshake; rides in synced state like undo/editor) ----
  /** each seat's rematch vote while an offer is open (both true → immediate rematch) */
  rematchVote?: [boolean, boolean]
  /** wall-clock ms when the rematch offer expires; null = no open offer */
  rematchDeadline?: number | null
  /** true while the room is back at DECK SELECTION for an agreed rematch (game === null,
   *  awaiting both seats' fresh decks). Lets a reconnecting player recover the lobby. */
  rematchLobby?: boolean
  /** "Second Seer" optional rule: the second player gets the Seer's start-of-turn peek on turn 2. */
  secondSeer?: boolean
}

/** how long a post-game rematch offer stays open before it lapses. */
const REMATCH_WINDOW_MS = 60_000

/** accept a clock config from a client, clamped to sane bounds (or null). */
function sanitizeClock(c: any): ClockConfig | null {
  if (!c || typeof c.base !== 'number' || typeof c.inc !== 'number') return null
  const base = Math.min(Math.max(Math.floor(c.base), 0), 6 * 3600_000) // ≤ 6h
  const inc = Math.min(Math.max(Math.floor(c.inc), 0), 3600_000) // ≤ 1h
  if (base <= 0) return null
  return { base, inc }
}

/** accept a sealed-room config from a client, clamped to sane bounds. */
function sanitizeSealedConfig(c: any): { edition: PackEditionChoice; numPacks: number; deckbuildMs: number } {
  const editions = [...PACK_EDITIONS, 'Random'] as PackEditionChoice[]
  const edition = editions.includes(c?.edition) ? (c.edition as PackEditionChoice) : 'Random'
  const numPacks = Math.min(Math.max(Math.floor(Number(c?.numPacks) || 6), 1), 12)
  const mins = Math.floor(Number(c?.deckbuildMin) || 20)
  const deckbuildMs = Math.min(Math.max(mins, 1), 60) * 60_000 // 1–60 min
  return { edition, numPacks, deckbuildMs }
}

const rooms = new Map<string, Room>()

// A site-wide "server restarting soon" notice. Set by a loopback-only POST /api/announce
// (i.e. from inside the container: `docker exec … node -e fetch(127.0.0.1…)`), read by
// every client via GET /api/announce. In-memory, so a restart clears it.
let restartNotice: { deadline: number } | null = null

// autobattle: a single matchmaking queue. Clock is fixed so paired players agree.
const AUTOBATTLE_CLOCK: ClockConfig = { base: 25 * 60_000, inc: 30_000 } // 25 min + 30 s/turn
const matchQueue: { ws: WebSocket; name: string; deck: DeckList; account: string | null }[] = []
function dequeue(ws: WebSocket): void {
  const i = matchQueue.findIndex((e) => e.ws === ws)
  if (i >= 0) matchQueue.splice(i, 1)
}

// short, human-shareable room code (typed to join); unique among live rooms.
function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  let code = ''
  do {
    code = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  } while ([...rooms.values()].some((r) => r.code === code))
  return code
}
// opaque UUID used in the shareable /room/<id> URL (distinct from the short code)
function makeId(): string { return randomUUID() }
/** resolve a room by its short code (case-insensitive) OR its UUID id */
function findRoom(key: unknown): Room | undefined {
  const k = String(key ?? '')
  return rooms.get(k.toUpperCase()) ?? [...rooms.values()].find((r) => r.id === k.toLowerCase())
}

function makeToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

/** Notify everyone connected to a room, then close their sockets — used when the room is being torn down. */
function closeRoom(room: Room, reason: string): void {
  const drop = (sock: WebSocket | null | undefined) => {
    if (!sock) return
    try { send(sock, { t: 'chat', from: 'system', msg: reason }) } catch { /* ignore */ }
    try { sock.close() } catch { /* ignore */ }
  }
  for (const seat of room.seats) drop(seat?.socket)
  for (const spec of room.spectators) drop(spec)
}

// Room reaper: kill ANY room that has been alive for more than 12 hours — a finished game, a room that
// never started, or a stalled untimed game that's just sitting there. Whoever's still connected is told,
// their sockets are closed, and the room is dropped. Checked every 10 minutes.
const ROOM_MAX_AGE_MS = 12 * 3600 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_MAX_AGE_MS) {
      closeRoom(room, 'This room was closed automatically after 12 hours.')
      rooms.delete(code)
    }
  }
}, 10 * 60 * 1000).unref()

// ---- websocket protocol ----
// client → server: {t:'create', name, deck} | {t:'join', code, name, deck} |
//                  {t:'rejoin', code, token} | {t:'spectate', code} |
//                  {t:'action', action} | {t:'chat', msg}
// server → client: {t:'joined', code, seat, token} | {t:'state', view} |
//                  {t:'error', msg} | {t:'chat', from, msg}

interface ClientMeta {
  room: Room | null
  seat: PlayerId | null
}

const meta = new WeakMap<WebSocket, ClientMeta>()

function send(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
}

/** the `state` message for one viewer. Pending undo/editor REQUESTS ride along in
 *  every state message (not one-shot notifications) so they survive a tab switch /
 *  disconnect / reconnect: a client that missed the original ask still sees it on
 *  the next broadcast or on rejoin, and it clears everywhere once resolved. `seat`
 *  is null for spectators (no asks, no editor grant). A seat sees an ask only when
 *  the OTHER seat is the requester (i.e. it's this seat's to answer). */
function stateMsg(room: Room, seat: PlayerId | null): {
  t: 'state'; view: unknown; undoAsk: string | null; editorAsk: string | null; editorAllowed: boolean
  rematchDeadline: number | null; rematchYou: boolean; rematchOpp: boolean
} {
  const view = viewFor(room.game!, seat === null ? null : viewSeatFor(room.game!, seat))
  const askFrom = (pending: PlayerId | null) =>
    seat !== null && pending !== null && pending !== seat ? room.seats[pending]?.name ?? 'Opponent' : null
  return {
    t: 'state',
    view,
    undoAsk: askFrom(room.pendingUndo),
    editorAsk: askFrom(room.pendingEditor),
    editorAllowed: seat !== null ? room.editorGrant[seat] : false,
    // rematch offer (post-game) — rides in every state so it survives a reconnect. Spectators (seat
    // null) get no vote. `You`/`Opp` reflect the two seats' current votes so the prompt can show
    // "waiting for opponent…" the instant this seat has said yes.
    rematchDeadline: room.rematchDeadline ?? null,
    rematchYou: seat !== null ? !!room.rematchVote?.[seat] : false,
    rematchOpp: seat !== null ? !!room.rematchVote?.[(1 - seat) as PlayerId] : false,
  }
}

function broadcastState(room: Room): void {
  if (!room.game) return
  for (const pid of [0, 1] as PlayerId[]) {
    const socket = room.seats[pid]?.socket
    // Thaïs: a pilot sees the seat it currently controls (viewSeatFor) — the board
    // flips to that hand for the duration; normally viewSeatFor(pid) === pid.
    if (socket) send(socket, stateMsg(room, pid))
  }
  for (const ws of room.spectators) send(ws, stateMsg(room, null))
}

/** send the current state to ONE seat only — used to let a caster see their own
 *  tentative card play while the opponent is kept in the dark until it commits. */
function sendStateToSeat(room: Room, seat: PlayerId): void {
  if (!room.game) return
  const socket = room.seats[seat]?.socket
  if (socket) send(socket, stateMsg(room, seat))
}

function maybeStart(room: Room): void {
  if (room.game) return
  const [a, b] = room.seats
  if (a?.deck && b?.deck) {
    const seed = Math.floor(Math.random() * 0xffffffff)
    const first = Math.random() < 0.5 ? 0 : 1
    room.game = createGame([a.deck, b.deck], [a.name, b.name], seed, first as PlayerId, room.clock, { secondSeer: room.secondSeer })
    room.lastTick = Date.now()
    room.rematchLobby = false // a game is running again — leave the rematch deck-select lobby
    broadcastState(room)
  }
}

/** the game just ENDED → open a 60-second rematch offer to both seats. Called only on the
 *  game-over transition edge (from the action apply, an in-play flag-fall, or the clock ticker),
 *  so it's set once. The offer + each seat's vote ride in stateMsg → they survive a reconnect,
 *  exactly like the undo/editor asks. */
function offerRematch(room: Room): void {
  if (!room.game || room.game.phase !== 'over') return
  room.rematchVote = [false, false]
  room.rematchDeadline = Date.now() + REMATCH_WINDOW_MS
}

/** both seats agreed → tear the finished game down and return the room to DECK SELECTION.
 *  Standard rooms: clear the game + both decks and tell each client to pick a deck again
 *  (rematchLobby); the fresh game starts via maybeStart once BOTH resubmit. Sealed rooms:
 *  reset to a brand-new timed deckbuild with fresh packs. */
function startRematch(room: Room): void {
  room.rematchDeadline = null
  room.rematchVote = [false, false]
  room.game = null
  room.history = []
  room.pendingUndo = null
  room.pendingEditor = null
  room.editorGrant = [false, false]
  room.tentative = null
  room.tentativeKind = undefined
  room.tentativeStart = null
  room.tentativeBase = undefined
  room.lastTick = Date.now()
  if (room.mode === 'sealed' && room.sealed) {
    room.sealed.packs = [null, null]
    room.sealed.decks = [null, null]
    room.sealed.ready = [false, false]
    room.sealed.deadline = null
    room.rematchLobby = false // sealed uses its own deckbuild flow, not the standard lobby
    for (const seat of room.seats) if (seat?.socket) send(seat.socket, { t: 'rematchStart', mode: 'sealed' })
    startDeckbuild(room) // regenerates both pools + restarts the build clock
    return
  }
  if (room.seats[0]) room.seats[0]!.deck = null
  if (room.seats[1]) room.seats[1]!.deck = null
  room.rematchLobby = true
  for (const seat of room.seats) if (seat?.socket) send(seat.socket, { t: 'rematchStart', mode: 'standard' })
}

// ---- sealed (limited) deckbuild phase ----

function rndSeed(): number { return Math.floor(Math.random() * 0xffffffff) }

/** the per-seat deckbuild message — each seat sees ONLY its own opened pool. */
function sealedStateMsg(room: Room, seat: PlayerId | null): unknown {
  const s = room.sealed!
  const spectator = seat === null
  const myPacks = spectator ? [] : s.packs[seat] ?? []
  return {
    t: 'sealedState',
    seat,
    spectator,
    edition: s.edition,
    numPacks: s.numPacks,
    packs: myPacks,
    pool: spectator ? {} : aggregatePool(myPacks),
    deck: spectator ? null : s.decks[seat] ?? null,
    youReady: spectator ? false : s.ready[seat],
    oppReady: spectator ? s.ready[0] && s.ready[1] : s.ready[1 - seat],
    oppPresent: spectator ? room.seats.every(Boolean) : !!room.seats[1 - seat],
    deadline: s.deadline,
    deckbuildMs: s.deckbuildMs,
    playClock: room.clock,
  }
}

function broadcastSealed(room: Room): void {
  if (!room.sealed) return
  for (const pid of [0, 1] as PlayerId[]) {
    const sock = room.seats[pid]?.socket
    if (sock) send(sock, sealedStateMsg(room, pid))
  }
  for (const ws of room.spectators) send(ws, sealedStateMsg(room, null))
}

/** both seats are present → generate each seat's pool and start the deckbuild clock. */
function startDeckbuild(room: Room): void {
  const s = room.sealed
  if (!s || room.game || s.deadline !== null) return // already running / started
  s.packs = [generateSealedPacks(s.edition, s.numPacks, rndSeed()), generateSealedPacks(s.edition, s.numPacks, rndSeed())]
  s.deadline = Date.now() + s.deckbuildMs
  broadcastSealed(room)
}

/** end deckbuild and start the game — auto-filling any unfinished/absent deck from
 *  that seat's pool so we NEVER start with an illegal deck. */
function finalizeSealed(room: Room): void {
  if (room.game || !room.sealed) return
  const s = room.sealed
  const [a, b] = room.seats
  if (!a || !b) return
  const build = (i: PlayerId) => autofillSealedDeck(s.decks[i] ?? { name: `${room.seats[i]!.name}'s sealed`, avatar: '', spellbook: {}, atlas: {} }, aggregatePool(s.packs[i] ?? []))
  const seed = rndSeed()
  const first = Math.random() < 0.5 ? 0 : 1
  room.game = createGame([build(0), build(1)], [a.name, b.name], seed, first as PlayerId, room.clock, { secondSeer: room.secondSeer })
  room.lastTick = Date.now()
  s.deadline = null
  broadcastState(room)
}

// chess-clock ticker: charge the running seat in every live-clock room and end
// the game the instant a flag falls (even if the player just sits idle).
setInterval(() => {
  const now = Date.now()
  for (const room of rooms.values()) {
    // sealed deckbuild timer: when it runs out, auto-fill decks and start the game
    if (room.mode === 'sealed' && room.sealed && !room.game && room.sealed.deadline !== null && now >= room.sealed.deadline) {
      finalizeSealed(room)
      continue
    }
    // a lapsed rematch offer closes silently — the prompt just disappears for both.
    if (room.rematchDeadline != null && now > room.rematchDeadline) {
      room.rematchDeadline = null
      room.rematchVote = [false, false]
      if (room.game) broadcastState(room)
    }
    const g = room.game
    if (!g || !g.clock || g.phase === 'over') continue
    const seat = runningSeat(g)
    settleClock(g, room.lastTick, now)
    room.lastTick = now
    if (seat !== null && g.clock.remaining[seat] <= 0) {
      flagFall(g, seat)
      offerRematch(room) // the flag-fall ended the game → open the rematch offer
      broadcastState(room)
    }
  }
}, 500).unref()

// Online identity is tied to the account: a valid session token forces the
// player's name to their account username; a guest may use a free name UNLESS
// it belongs to a registered account (no impersonation).
/** the signed-in account username for an auth token, or null (guest / invalid / expired). */
function accountFromToken(authToken: unknown): string | null {
  if (typeof authToken === 'string' && authToken) {
    const sess = sessions.get(sha256(authToken))
    if (sess && sess.expires_at >= Date.now()) return users.byId(sess.user_id)?.username ?? null
  }
  return null
}

function resolvePlayerName(authToken: unknown, rawName: unknown, fallback: string): { name: string } | { error: string } {
  if (typeof authToken === 'string' && authToken) {
    const sess = sessions.get(sha256(authToken))
    if (sess && sess.expires_at >= Date.now()) {
      const u = users.byId(sess.user_id)
      if (u) return { name: u.username }
    }
  }
  const name = String(rawName || fallback).slice(0, 24).trim()
  if (!name) return { name: fallback }
  if (users.byName(name)) return { error: 'That name belongs to a registered account — sign in to play as them.' }
  return { name }
}

const wss = new WebSocketServer({ noServer: true })

// Heartbeat: ping every client periodically and terminate any that stopped responding.
// A silently-dead socket (laptop sleep, network drop with no FIN) otherwise lingers in the
// matchmaking queue and rooms — so "find a battle" could pair you with a ghost, or a queued
// player never gets matched. Terminating fires 'close', which dequeues + frees the seat.
setInterval(() => {
  for (const ws of wss.clients) {
    if ((ws as any).isAlive === false) { ws.terminate(); continue }
    ;(ws as any).isAlive = false
    try { ws.ping() } catch { /* already closing */ }
  }
}, 30_000).unref()

wss.on('connection', (ws) => {
  meta.set(ws, { room: null, seat: null })
  ;(ws as any).isAlive = true
  ws.on('pong', () => { (ws as any).isAlive = true })

  ws.on('message', (raw) => {
    let msg: any
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return send(ws, { t: 'error', msg: 'Bad JSON.' })
    }
    const m = meta.get(ws)!

    try {
      switch (msg.t) {
        case 'create': {
          const problems = validateDeck(msg.deck).filter((p) => p.level === 'error')
          if (problems.length) return send(ws, { t: 'error', msg: problems.map((p) => p.msg).join(' | ') })
          const who = resolvePlayerName(msg.authToken, msg.name, 'Player 1')
          if ('error' in who) return send(ws, { t: 'error', msg: who.error })
          const room: Room = {
            code: makeCode(),
            id: makeId(),
            isPublic: msg.isPublic === true,
            origin: 'room',
            mode: 'standard',
            sealed: null,
            seats: [
              { token: makeToken(), name: who.name, account: accountFromToken(msg.authToken), deck: msg.deck, socket: ws },
              null,
            ],
            spectators: new Set(),
            game: null,
            createdAt: Date.now(),
            history: [],
            pendingUndo: null,
            tentative: null,
            pendingEditor: null,
            editorGrant: [false, false],
            clock: sanitizeClock(msg.clock),
            lastTick: Date.now(),
            secondSeer: msg.secondSeer === true,
          }
          rooms.set(room.code, room)
          m.room = room
          m.seat = 0
          send(ws, { t: 'joined', code: room.code, id: room.id, seat: 0, token: room.seats[0]!.token, mode: room.mode })
          break
        }
        case 'createSealed': {
          // no deck up front — players build during the timed deckbuild phase
          const who = resolvePlayerName(msg.authToken, msg.name, 'Player 1')
          if ('error' in who) return send(ws, { t: 'error', msg: who.error })
          const cfg = sanitizeSealedConfig(msg)
          const room: Room = {
            code: makeCode(),
            id: makeId(),
            isPublic: msg.isPublic === true,
            origin: 'room',
            mode: 'sealed',
            sealed: { ...cfg, deadline: null, packs: [null, null], decks: [null, null], ready: [false, false] },
            seats: [
              { token: makeToken(), name: who.name, account: accountFromToken(msg.authToken), deck: null, socket: ws },
              null,
            ],
            spectators: new Set(),
            game: null,
            createdAt: Date.now(),
            history: [],
            pendingUndo: null,
            tentative: null,
            pendingEditor: null,
            editorGrant: [false, false],
            clock: sanitizeClock(msg.clock), // the PLAY clock (deckbuild has its own timer)
            lastTick: Date.now(),
            secondSeer: msg.secondSeer === true,
          }
          rooms.set(room.code, room)
          m.room = room
          m.seat = 0
          send(ws, { t: 'joined', code: room.code, id: room.id, seat: 0, token: room.seats[0]!.token, mode: room.mode })
          break
        }
        case 'join': {
          const room = findRoom(msg.code)
          if (!room) return send(ws, { t: 'error', msg: 'Room not found.' })
          if (room.seats[1]) return send(ws, { t: 'error', msg: 'Room is full.' })
          const who = resolvePlayerName(msg.authToken, msg.name, 'Player 2')
          if ('error' in who) return send(ws, { t: 'error', msg: who.error })
          if (room.mode === 'sealed') {
            // sealed rooms need no deck up front — seat, then open both pools & start the clock
            room.seats[1] = { token: makeToken(), name: who.name, account: accountFromToken(msg.authToken), deck: null, socket: ws }
            m.room = room
            m.seat = 1
            send(ws, { t: 'joined', code: room.code, id: room.id, seat: 1, token: room.seats[1]!.token, mode: room.mode })
            startDeckbuild(room)
            break
          }
          const problems = validateDeck(msg.deck).filter((p) => p.level === 'error')
          if (problems.length) return send(ws, { t: 'error', msg: problems.map((p) => p.msg).join(' | ') })
          room.seats[1] = { token: makeToken(), name: who.name, account: accountFromToken(msg.authToken), deck: msg.deck, socket: ws }
          m.room = room
          m.seat = 1
          send(ws, { t: 'joined', code: room.code, id: room.id, seat: 1, token: room.seats[1]!.token, mode: room.mode })
          maybeStart(room)
          break
        }
        case 'sealedDeck': {
          if (!m.room || m.seat === null || m.room.mode !== 'sealed' || !m.room.sealed)
            return send(ws, { t: 'error', msg: 'Not in a sealed deckbuild.' })
          if (m.room.game) return send(ws, { t: 'error', msg: 'The game has already started.' })
          const s = m.room.sealed
          const seat = m.seat
          const pool = aggregatePool(s.packs[seat] ?? [])
          if (msg.deck && typeof msg.deck === 'object') s.decks[seat] = msg.deck as DeckList
          if (msg.ready) {
            const errs = validateSealedDeck(s.decks[seat] ?? { name: '', avatar: '', spellbook: {}, atlas: {} }, pool).filter((p) => p.level === 'error')
            if (errs.length) {
              s.ready[seat] = false
              send(ws, { t: 'error', msg: 'Deck not ready: ' + errs.map((p) => p.msg).join(' | ') })
              send(ws, sealedStateMsg(m.room, seat))
              break
            }
            s.ready[seat] = true
          } else {
            s.ready[seat] = false
          }
          broadcastSealed(m.room)
          if (s.ready[0] && s.ready[1]) finalizeSealed(m.room)
          break
        }
        case 'rejoin': {
          const room = findRoom(msg.code)
          if (!room) return send(ws, { t: 'error', msg: 'Room not found.' })
          let seat = room.seats.findIndex((s) => s?.token === msg.token) as PlayerId | -1
          if (seat === -1) {
            // account-based rejoin: a signed-in player may reclaim THEIR OWN seat from any
            // browser/device, even without the original per-browser rejoin token.
            const acct = accountFromToken(msg.authToken)
            if (acct) seat = room.seats.findIndex((s) => s?.account === acct) as PlayerId | -1
          }
          if (seat === -1 || !room.seats[seat]) return send(ws, { t: 'error', msg: 'Invalid token.' })
          const st = room.seats[seat]!
          st.socket = ws
          m.room = room
          m.seat = seat
          // return the seat's real token so the new browser can store it too
          send(ws, { t: 'joined', code: room.code, id: room.id, seat, token: st.token, mode: room.mode })
          // rejoin carries any still-pending undo/editor ask, so a reconnecting player
          // recovers a request they missed while away; a sealed rejoin recovers the pool.
          if (room.game) send(ws, stateMsg(room, seat))
          else if (room.mode === 'sealed' && room.sealed) send(ws, sealedStateMsg(room, seat))
          else if (room.rematchLobby) send(ws, { t: 'rematchStart', mode: 'standard' }) // recover the rematch deck-select
          break
        }
        case 'spectate': {
          const room = findRoom(msg.code)
          if (!room) return send(ws, { t: 'error', msg: 'Room not found.' })
          room.spectators.add(ws)
          m.room = room
          m.seat = null
          send(ws, { t: 'joined', code: room.code, id: room.id, seat: null, token: null, mode: room.mode })
          if (room.game) send(ws, stateMsg(room, null))
          else if (room.mode === 'sealed' && room.sealed) send(ws, sealedStateMsg(room, null))
          break
        }
        case 'matchmake': {
          const problems = validateDeck(msg.deck).filter((p) => p.level === 'error')
          if (problems.length) return send(ws, { t: 'error', msg: problems.map((p) => p.msg).join(' | ') })
          // Matchmaking is casual: a GUEST whose chosen name happens to match a registered
          // account must still be queued (resolvePlayerName would otherwise error and block
          // them — "unlogged accounts don't get queued"). Fall back to a guest display name so
          // they never impersonate the real account but still find a battle.
          const resolved = resolvePlayerName(msg.authToken, msg.name, 'Player')
          const who = 'error' in resolved ? { name: 'Guest' } : resolved
          if (matchQueue.some((e) => e.ws === ws) || m.room) return // already queued / in a room
          // pull the next waiting opponent with a live socket (skip stale ones)
          let partner: { ws: WebSocket; name: string; deck: DeckList; account: string | null } | undefined
          while (matchQueue.length) {
            const cand = matchQueue.shift()!
            if (cand.ws !== ws && cand.ws.readyState === WebSocket.OPEN) { partner = cand; break }
          }
          if (partner) {
            const room: Room = {
              code: makeCode(),
              id: makeId(),
              isPublic: true, // battles are public — spectators can watch from the lobby
              origin: 'battle',
              mode: 'standard',
              sealed: null,
              seats: [
                { token: makeToken(), name: partner.name, account: partner.account, deck: partner.deck, socket: partner.ws },
                { token: makeToken(), name: who.name, account: accountFromToken(msg.authToken), deck: msg.deck, socket: ws },
              ],
              spectators: new Set(), game: null, createdAt: Date.now(), history: [],
              pendingUndo: null, tentative: null, pendingEditor: null, editorGrant: [false, false],
              clock: AUTOBATTLE_CLOCK, lastTick: Date.now(),
            }
            rooms.set(room.code, room)
            const pm = meta.get(partner.ws)
            if (pm) { pm.room = room; pm.seat = 0 }
            send(partner.ws, { t: 'joined', code: room.code, id: room.id, seat: 0, token: room.seats[0]!.token })
            m.room = room; m.seat = 1
            send(ws, { t: 'joined', code: room.code, id: room.id, seat: 1, token: room.seats[1]!.token })
            maybeStart(room)
          } else {
            matchQueue.push({ ws, name: who.name, deck: msg.deck, account: accountFromToken(msg.authToken) })
            send(ws, { t: 'searching' })
          }
          break
        }
        case 'cancelMatch': {
          dequeue(ws)
          send(ws, { t: 'matchCancelled' })
          break
        }
        case 'roomConfig': {
          // while you're alone in a room (no opponent, not started) you may change
          // your deck and/or the clock. Creator-only; both are applied when the game
          // begins (maybeStart reads seats[0].deck + room.clock).
          if (!m.room || m.seat !== 0) return send(ws, { t: 'error', msg: 'Only the room creator can change settings.' })
          if (m.room.seats[1] || m.room.game) return send(ws, { t: 'error', msg: 'The game has already started.' })
          if (msg.deck != null) {
            const problems = validateDeck(msg.deck).filter((p) => p.level === 'error')
            if (problems.length) return send(ws, { t: 'error', msg: problems.map((p) => p.msg).join(' | ') })
            m.room.seats[0]!.deck = msg.deck
          }
          m.room.clock = sanitizeClock(msg.clock)
          send(ws, { t: 'chat', from: 'system', msg: '⚙ Room settings updated.' })
          break
        }
        case 'action': {
          if (!m.room || m.seat === null) return send(ws, { t: 'error', msg: 'Not seated.' })
          if (!m.room.game) return send(ws, { t: 'error', msg: 'Game not started.' })
          // the editor (game-state tools) rewrites shared state, so online it is
          // gated: a seat may only send judge/editor actions once its opponent has
          // granted access this game. Enforced here, not just in the UI.
          if ((msg.action as Action).t === 'judge' && !m.room.editorGrant[m.seat])
            return send(ws, { t: 'error', msg: 'Editor access must be granted by your opponent first.' })
          // charge the acting seat for its thinking time, and end the game if it
          // already ran out before this action landed
          if (m.room.game.clock) {
            const now = Date.now()
            const seat = runningSeat(m.room.game)
            settleClock(m.room.game, m.room.lastTick, now)
            m.room.lastTick = now
            if (seat !== null && m.room.game.clock.remaining[seat] <= 0) {
              flagFall(m.room.game, seat)
              offerRematch(m.room) // clock ran out → game over → open the rematch offer
              broadcastState(m.room)
              break
            }
          }
          const wasOver = m.room.game.phase === 'over'
          const histLenBefore = m.room.history.length
          const snapshot = JSON.stringify(m.room.game)
          const inner = msg.action as Action
          const result = applyAction(m.room.game, m.seat, inner)
          if (!result.ok) return send(ws, { t: 'error', msg: result.error })
          // the action just ENDED the game (a lethal blow, a concede…) → open the rematch offer so it
          // rides in the broadcast(s) below. Only on the transition edge, so it's set exactly once.
          if (!wasOver && m.room.game.phase === 'over') offerRematch(m.room)
          // record any secret achievements this action earned (rides in synced state, redacted per seat)
          try { applyAchievements(JSON.parse(snapshot), m.room.game, m.seat, inner) } catch { /* cosmetic */ }
          m.room.history.push(snapshot)
          if (m.room.history.length > 80) m.room.history.shift()
          m.room.lastTick = Date.now()
          // Revealing to the opponent (and the shared log) is deferred while a play is still being
          // resolved. Two flavors:
          //  • PLAY (castSpell / avatarSite-play): held only until the FIRST prompt is answered.
          //  • tentative-ACTIVATE (Animist "cast a magic as a Spirit"): held across ALL its prompts,
          //    then committed only if it actually changed the game — else rolled back with NO trace,
          //    so the opponent never saw it and it isn't recorded unless a Spirit was really cast.
          // The tentative hold belongs to whoever PLAYED it — under Thaïs that's the pilot (real seat).
          const pending = m.room.game.prompts[0]
          const actorHasPrompt = !!pending && actingSeatFor(m.room.game, pending.player) === m.seat
          if (m.room.tentative === m.seat && m.room.tentativeKind === 'activate') {
            if (actorHasPrompt) {
              sendStateToSeat(m.room, m.seat) // still choosing — keep it private
            } else {
              // flow resolved: commit if it did something, else erase every trace of it
              if (!tentativeChanged(m.room.tentativeStart ?? snapshot, m.room.game) && m.room.tentativeStart) {
                m.room.game = JSON.parse(m.room.tentativeStart)
                if (m.room.tentativeBase !== undefined && m.room.tentativeBase <= m.room.history.length) m.room.history.length = m.room.tentativeBase
              }
              m.room.tentative = null; m.room.tentativeKind = undefined; m.room.tentativeStart = null
              broadcastState(m.room)
            }
          } else {
            const isPlay = inner.t === 'castSpell' || (inner.t === 'avatarSite' && inner.mode === 'play')
            const isTentAct = isTentativeActivate(m.room.game, inner)
            if (m.room.tentative === null && (isPlay || isTentAct) && actorHasPrompt) {
              m.room.tentative = m.seat
              m.room.tentativeKind = isTentAct ? 'activate' : 'play'
              if (isTentAct) { m.room.tentativeStart = snapshot; m.room.tentativeBase = histLenBefore }
              sendStateToSeat(m.room, m.seat)
            } else {
              m.room.tentative = null; m.room.tentativeKind = undefined; m.room.tentativeStart = null
              broadcastState(m.room)
            }
          }
          break
        }
        case 'cancelCast': {
          // free go-back from a card's first prompt: only valid while YOUR own play is
          // tentative. Rolls back the cast; the opponent never saw it, so nothing leaks.
          if (!m.room || m.seat === null || !m.room.game) return
          if (m.room.tentative !== m.seat) return send(ws, { t: 'error', msg: 'Nothing to go back from.' })
          if (m.room.tentativeStart) {
            // a tentative-activate (Animist) may span several prompts — roll the WHOLE flow back
            m.room.game = JSON.parse(m.room.tentativeStart)
            if (m.room.tentativeBase !== undefined && m.room.tentativeBase <= m.room.history.length) m.room.history.length = m.room.tentativeBase
          } else {
            if (m.room.history.length === 0) return
            m.room.game = JSON.parse(m.room.history.pop()!)
          }
          m.room.tentative = null; m.room.tentativeKind = undefined; m.room.tentativeStart = null
          m.room.lastTick = Date.now() // don't bill the aborted cast's think time twice
          broadcastState(m.room)
          break
        }
        case 'undoRequest': {
          if (!m.room || m.seat === null || !m.room.game) return
          if (m.room.history.length === 0) return send(ws, { t: 'error', msg: 'Nothing to undo.' })
          if (m.room.pendingUndo !== null) return send(ws, { t: 'error', msg: 'An undo request is already pending.' })
          m.room.pendingUndo = m.seat
          // the ask now lives in synced state (stateMsg) — broadcast so it shows, and
          // survives a tab switch / reconnect. The one-shot is a belt-and-braces nudge.
          const other = m.room.seats[1 - m.seat]?.socket
          if (other) send(other, { t: 'undoAsk', from: m.room.seats[m.seat]?.name ?? 'Opponent' })
          broadcastState(m.room)
          break
        }
        case 'undoReply': {
          if (!m.room || m.seat === null || !m.room.game) return
          if (m.room.pendingUndo === null || m.room.pendingUndo === m.seat) return
          const requester = m.room.pendingUndo
          m.room.pendingUndo = null
          if (msg.ok && m.room.history.length > 0) {
            m.room.game = JSON.parse(m.room.history.pop()!)
            m.room.lastTick = Date.now() // don't bill the running seat for the undo negotiation
            for (const seat of m.room.seats) if (seat?.socket) send(seat.socket, { t: 'chat', from: 'system', msg: '↩ Undo accepted — one action rolled back.' })
            broadcastState(m.room)
          } else {
            const reqSock = m.room.seats[requester]?.socket
            if (reqSock) send(reqSock, { t: 'chat', from: 'system', msg: 'Undo declined.' })
            broadcastState(m.room) // clear the (now-resolved) ask everywhere
          }
          break
        }
        case 'editorRequest': {
          if (!m.room || m.seat === null || !m.room.game) return
          if (m.room.editorGrant[m.seat]) return send(ws, { t: 'error', msg: 'You already have editor access.' })
          if (m.room.pendingEditor !== null) return send(ws, { t: 'error', msg: 'An editor request is already pending.' })
          m.room.pendingEditor = m.seat
          const other = m.room.seats[1 - m.seat]?.socket
          if (other) send(other, { t: 'editorAsk', from: m.room.seats[m.seat]?.name ?? 'Opponent' })
          broadcastState(m.room) // ask rides in synced state → survives reconnect
          break
        }
        case 'editorReply': {
          if (!m.room || m.seat === null || !m.room.game) return
          if (m.room.pendingEditor === null || m.room.pendingEditor === m.seat) return
          const requester = m.room.pendingEditor
          m.room.pendingEditor = null
          const reqSock = m.room.seats[requester]?.socket
          if (msg.ok) {
            m.room.editorGrant[requester] = true
            if (reqSock) send(reqSock, { t: 'editorGranted' })
            for (const seat of m.room.seats) if (seat?.socket) send(seat.socket, { t: 'chat', from: 'system', msg: `✎ Editor access granted to ${m.room.seats[requester]?.name ?? 'a player'}.` })
          } else if (reqSock) {
            send(reqSock, { t: 'chat', from: 'system', msg: 'Editor access declined.' })
          }
          // sync: clears pendingEditor, and (on grant) carries editorAllowed so editor
          // access itself survives a reconnect too.
          broadcastState(m.room)
          break
        }
        case 'rematchVote': {
          // a seat answers the post-game "play again?" offer. Both yes → rematch immediately (no
          // waiting out the minute). Either no → the offer closes for both.
          if (!m.room || m.seat === null) return
          if (!m.room.game || m.room.game.phase !== 'over') return send(ws, { t: 'error', msg: 'No game to rematch.' })
          if (m.room.rematchDeadline == null) return send(ws, { t: 'error', msg: 'The rematch offer has closed.' })
          if (!msg.yes) {
            m.room.rematchDeadline = null
            m.room.rematchVote = [false, false]
            for (const seat of m.room.seats) if (seat?.socket) send(seat.socket, { t: 'chat', from: 'system', msg: 'Rematch declined.' })
            broadcastState(m.room)
            break
          }
          m.room.rematchVote = m.room.rematchVote ?? [false, false]
          m.room.rematchVote[m.seat] = true
          if (m.room.rematchVote[0] && m.room.rematchVote[1]) startRematch(m.room)
          else broadcastState(m.room) // reflect "you're in — waiting for your opponent"
          break
        }
        case 'rematchDeck': {
          // a seat submits its deck in the rematch DECK-SELECTION lobby (works for BOTH seats,
          // unlike the creator-only roomConfig). The fresh game starts once both have submitted.
          if (!m.room || m.seat === null) return
          if (m.room.game) return send(ws, { t: 'error', msg: 'The game has already started.' })
          if (!m.room.rematchLobby) return send(ws, { t: 'error', msg: 'Not in a rematch lobby.' })
          const problems = validateDeck(msg.deck).filter((p) => p.level === 'error')
          if (problems.length) return send(ws, { t: 'error', msg: problems.map((p) => p.msg).join(' | ') })
          m.room.seats[m.seat]!.deck = msg.deck
          send(ws, { t: 'chat', from: 'system', msg: '✔ Deck locked in — waiting for your opponent.' })
          maybeStart(m.room) // starts the rematch once BOTH seats have a deck
          break
        }
        case 'chat': {
          if (!m.room) return
          const from = m.seat !== null ? m.room.seats[m.seat]?.name : 'spectator'
          const payload = { t: 'chat', from, msg: String(msg.msg ?? '').slice(0, 500) }
          for (const seat of m.room.seats) if (seat?.socket) send(seat.socket, payload)
          for (const spec of m.room.spectators) send(spec, payload)
          break
        }
        default:
          send(ws, { t: 'error', msg: `Unknown message type ${msg.t}` })
      }
    } catch (err) {
      console.error(err)
      send(ws, { t: 'error', msg: 'Server error: ' + (err as Error).message })
    }
  })

  ws.on('close', () => {
    dequeue(ws) // drop from matchmaking if they were waiting
    const m = meta.get(ws)
    if (!m?.room) return
    if (m.seat !== null && m.room.seats[m.seat]?.socket === ws) {
      m.room.seats[m.seat]!.socket = null
    }
    m.room.spectators.delete(ws)
  })
})

// ---- http ----

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp', // all card/token/back art is WebP — must not be octet-stream
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
}

// ---- curiosa.io deck import ----
// curiosa's tRPC API enforces an Origin check (403 "Invalid origin") and the
// browser can't set Origin / would be CORS-blocked, so the fetch lives here.
async function curiosaProc<T>(proc: string, id: string): Promise<T> {
  const input = encodeURIComponent(JSON.stringify({ '0': { json: { id } } }))
  const r = await fetch(`https://curiosa.io/api/trpc/${proc}?batch=1&input=${input}`, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      origin: 'https://curiosa.io',
      referer: `https://curiosa.io/decks/${id}`,
    },
  })
  const body = (await r.json()) as any
  const entry = Array.isArray(body) ? body[0] : body
  if (entry?.error) throw new Error(entry.error?.json?.message ?? `curiosa ${proc} failed`)
  return entry?.result?.data?.json as T
}

async function importCuriosaDeck(id: string): Promise<DeckList> {
  // metadata (name) + avatar + main decklist + sideboard(=collection), in parallel
  const [meta, avatar, decklist, sideboard] = await Promise.all([
    curiosaProc<{ name?: string }>('deck.getById', id),
    curiosaProc<CuriosaEntry | null>('deck.getAvatarById', id),
    curiosaProc<CuriosaEntry[]>('deck.getDecklistById', id),
    curiosaProc<CuriosaEntry[]>('deck.getSideboardById', id).catch(() => [] as CuriosaEntry[]),
  ])
  return curiosaToDeck({ name: meta?.name, avatar, decklist, sideboard })
}

// ---- sorcerytcg.com deck import (the official builder; successor to curiosa.io) ----
// api.sorcerytcg.com serves a clean, already-bucketed deck payload. Fetched server-side to dodge any CORS
// and to keep the import path identical to curiosa's.
async function importSorceryDeck(id: string): Promise<DeckList> {
  const r = await fetch(`https://api.sorcerytcg.com/api/decks/${id}`, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (r.status === 404) throw new Error('not found')
  if (!r.ok) throw new Error(`sorcerytcg ${r.status}`)
  const raw = (await r.json()) as SorceryDeckRaw
  if (raw?.visibility && raw.visibility.toLowerCase() !== 'public') throw new Error('Deck is not public.')
  return sorceryToDeck(raw)
}

// ---- accounts API (SQLite-backed) ----

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim()
  return req.socket.remoteAddress ?? 'unknown'
}
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  })
  res.end(JSON.stringify(body))
}
function readJsonBody(req: IncomingMessage, limitBytes = 256 * 1024): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limitBytes) { reject(new Error('Payload too large')); req.destroy() }
      else chunks.push(c)
    })
    req.on('end', () => {
      if (!chunks.length) return resolvePromise({})
      try { resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}
/** resolve the Bearer token to a live user, or null */
function userFromReq(req: IncomingMessage): UserRow | null {
  const auth = req.headers['authorization']
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null
  const sess = sessions.get(sha256(auth.slice(7)))
  if (!sess || sess.expires_at < Date.now()) return null
  return users.byId(sess.user_id) ?? null
}
function publicUser(u: UserRow) { return { username: u.username } }

/** a deck must have a stable id + name and the two card maps (public-facing) */
function validDeck(d: any): d is { id: string; name: string; avatar: string; spellbook: object; atlas: object } {
  return !!d && typeof d === 'object'
    && typeof d.id === 'string' && d.id.length > 0 && d.id.length <= 64
    && typeof d.name === 'string' && d.name.trim().length > 0
    && typeof d.avatar === 'string'
    && d.spellbook && typeof d.spellbook === 'object'
    && d.atlas && typeof d.atlas === 'object'
    && JSON.stringify(d).length <= 200_000
}

// the set of legal achievement ids (anything else a client sends is dropped)
const VALID_ACHV = new Set(ACHIEVEMENTS.map((a) => a.id))

/** Did a tentative-activate flow (Animist "cast a magic as a Spirit") actually change the game, or
 *  resolve to nothing? Compares a cast-relevant signature — units, hand sizes, mana, cemetery/banish
 *  counts — so a real Spirit summon commits while a declined/cancelled flow rolls back. Ignores
 *  log / version / transient flow state. */
function tentativeChanged(startJson: string, game: GameState): boolean {
  try {
    const sig = (g: GameState) => JSON.stringify({
      u: Object.keys(g.units).sort(),
      h: g.players.map((p) => p.hand.length),
      m: g.players.map((p) => p.mana),
      c: g.players.map((p) => p.cemetery.length),
      b: g.players.map((p) => p.banished.length),
    })
    return sig(JSON.parse(startJson) as GameState) !== sig(game)
  } catch {
    return true // can't tell → commit (never silently swallow a real cast)
  }
}

// harden the stored collection: clamp counts, drop junk, cap size (public-facing)
function clampInt(n: unknown): number { const x = Math.floor(Number(n)); return Number.isFinite(x) ? Math.max(0, Math.min(10_000_000, x)) : 0 }
function sanitizeCollection(input: any): { cards: Record<string, { std: number; foil: number; curio: number }>; packsOpened: number; ripped: number } {
  const out = { cards: {} as Record<string, { std: number; foil: number; curio: number }>, packsOpened: 0, ripped: 0 }
  if (input && typeof input === 'object') {
    const cards = input.cards
    if (cards && typeof cards === 'object') {
      let count = 0
      for (const name of Object.keys(cards)) {
        if (count++ >= 5000 || typeof name !== 'string') break
        const e = cards[name]
        if (!e || typeof e !== 'object') continue
        const std = clampInt(e.std), foil = clampInt(e.foil), curio = clampInt(e.curio)
        if (std || foil || curio) out.cards[name.slice(0, 80)] = { std, foil, curio }
      }
    }
    out.packsOpened = clampInt(input.packsOpened)
    out.ripped = clampInt(input.ripped)
  }
  return out
}

/** a scenario's stored payload must look like a GameState snapshot (public-facing). */
function validScenarioState(s: any): boolean {
  return !!s && typeof s === 'object'
    && Array.isArray(s.players) && s.players.length === 2
    && s.units && typeof s.units === 'object'
    && s.sites && typeof s.sites === 'object'
    && s.cards && typeof s.cards === 'object'
    && JSON.stringify(s).length <= 500_000
}

// seed the public built-in scenarios (the DOM/audit fixtures) once at startup;
// stable ids mean a reseed updates in place rather than duplicating.
try {
  for (const s of builtinScenarios()) scenarioStore.seedBuiltin(s.id, s.name, s.state)
} catch (e) { console.error('scenario seed failed:', e) }

async function handleApi(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  const method = req.method ?? 'GET'
  if (method === 'OPTIONS') { sendJson(res, 204, {}); return }
  try {
    // --- register / login (rate-limited per IP) ---
    if (path === '/api/register' && method === 'POST') {
      const ipKey = `reg:${clientIp(req)}`
      if (!rateAllow(ipKey)) return sendJson(res, 429, { error: 'Too many attempts. Try again later.' })
      const body = await readJsonBody(req)
      const username = String(body.username ?? '').trim()
      const uErr = validateUsername(username) ?? validatePassword(body.password)
      if (uErr) return sendJson(res, 400, { error: uErr })
      if (users.byName(username)) return sendJson(res, 409, { error: 'That username is taken.' })
      const { hash, salt } = hashPassword(body.password)
      const info = users.create(username, hash, salt)
      const uid = Number(info.lastInsertRowid)
      const { token, hash: th } = newSessionToken()
      sessions.create(th, uid, SESSION_TTL_MS)
      rateReset(ipKey)
      return sendJson(res, 201, { token, user: { username } })
    }
    if (path === '/api/login' && method === 'POST') {
      const ipKey = `login:${clientIp(req)}`
      if (!rateAllow(ipKey)) return sendJson(res, 429, { error: 'Too many attempts. Try again later.' })
      const body = await readJsonBody(req)
      const username = String(body.username ?? '').trim()
      const u = users.byName(username)
      // constant-ish work + generic error → no user enumeration
      const ok = u ? verifyPassword(String(body.password ?? ''), u.pass_hash, u.pass_salt) : verifyPassword('x', '00', '00')
      if (!u || !ok) return sendJson(res, 401, { error: 'Invalid username or password.' })
      const { token, hash: th } = newSessionToken()
      sessions.create(th, u.id, SESSION_TTL_MS)
      rateReset(ipKey)
      return sendJson(res, 200, { token, user: publicUser(u) })
    }

    // --- everything below needs a valid session ---
    const user = userFromReq(req)
    if (path === '/api/logout' && method === 'POST') {
      const auth = req.headers['authorization']
      if (typeof auth === 'string' && auth.startsWith('Bearer ')) sessions.drop(sha256(auth.slice(7)))
      return sendJson(res, 200, { ok: true })
    }
    // --- scenarios: browsing/loading public scenarios needs NO sign-in ---
    if (path === '/api/scenarios' && method === 'GET')
      return sendJson(res, 200, { scenarios: scenarioStore.listVisible(user?.id ?? null) })
    if (path.startsWith('/api/scenarios/') && method === 'GET') {
      const id = decodeURIComponent(path.slice('/api/scenarios/'.length))
      const row = id ? scenarioStore.get(id) : undefined
      if (!row) return sendJson(res, 404, { error: 'No such scenario.' })
      if (!row.is_public && row.owner_id !== (user?.id ?? -1)) return sendJson(res, 403, { error: 'That scenario is private.' })
      return sendJson(res, 200, {
        scenario: {
          id: row.id, name: row.name, isPublic: !!row.is_public,
          builtin: row.owner_id === null, mine: user != null && row.owner_id === user.id,
          data: JSON.parse(row.data),
        },
      })
    }

    // --- public lobby: active public rooms + battles (no sign-in needed) ---
    if (path === '/api/rooms' && method === 'GET') {
      const list = [...rooms.values()]
        .filter((r) => r.isPublic && !(r.game && r.game.phase === 'over'))
        .map((r) => ({
          id: r.id,
          code: r.code,
          host: r.seats[0]?.name ?? 'Player',
          opponent: r.seats[1]?.name ?? null,
          players: r.seats.filter(Boolean).length,
          inProgress: !!r.game,
          joinable: !r.seats[1] && !r.game,
          clock: r.clock,
          origin: r.origin,
          mode: r.mode,
          sealed: r.mode === 'sealed' && r.sealed
            ? { edition: r.sealed.edition, numPacks: r.sealed.numPacks, deckbuilding: r.sealed.deadline !== null }
            : null,
          createdAt: r.createdAt,
        }))
        .sort((a, b) => b.createdAt - a.createdAt)
      return sendJson(res, 200, { rooms: list })
    }

    // --- operational status (for `docker exec … battles`): how many battles are
    // live right now. Aggregate counts are public & harmless; per-battle detail
    // (codes, player names, turn/phase) is revealed ONLY to loopback callers —
    // i.e. a shell INSIDE the container (`docker exec … curl 127.0.0.1`). Tunnel
    // and browser traffic arrives from the proxy's network IP, never loopback,
    // so the detail stays off the public URL with no token to manage. We read
    // the raw socket address, NOT clientIp()/X-Forwarded-For (that's spoofable). ---
    if (path === '/api/status' && method === 'GET') {
      const all = [...rooms.values()]
      const active = all.filter((r) => r.game && r.game.phase !== 'over')
      const waiting = all.filter((r) => !r.game && r.seats.some(Boolean))
      const base = {
        now: Date.now(),
        totalRooms: all.length,
        activeBattles: active.length,
        waitingRooms: waiting.length,
        spectators: all.reduce((n, r) => n + r.spectators.size, 0),
      }
      const ra = req.socket.remoteAddress ?? ''
      const isLocal = ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1'
      if (!isLocal) return sendJson(res, 200, base)
      return sendJson(res, 200, {
        ...base,
        battles: active.map((r) => ({
          code: r.code,
          origin: r.origin, // 'room' | 'battle'
          public: r.isPublic,
          players: r.seats.map((s) => s?.name ?? null),
          connected: r.seats.map((s) => !!s?.socket),
          spectators: r.spectators.size,
          turn: r.game!.turn,
          phase: r.game!.phase,
          activePlayer: r.game!.activePlayer,
          waitingOn: runningSeat(r.game!), // whose clock is ticking (null = untimed/over)
          clockRemaining: r.game!.clock?.remaining ?? null,
          ageSec: Math.round((Date.now() - r.createdAt) / 1000),
        })),
        waiting: waiting.map((r) => ({
          code: r.code,
          host: r.seats[0]?.name ?? null,
          public: r.isPublic,
          ageSec: Math.round((Date.now() - r.createdAt) / 1000),
        })),
      })
    }

    // --- site-wide restart notice ---
    // GET is public (every client polls it to show the banner). POST is LOOPBACK-ONLY —
    // only a shell inside the container can set it (`docker exec … node -e fetch(127.0.0.1…)`),
    // never a browser/tunnel caller (their IP is the proxy's, not loopback). Body {minutes}:
    // >0 sets a deadline that many minutes out; ≤0 (or absent) clears the notice.
    if (path === '/api/announce') {
      if (method === 'GET') {
        if (restartNotice && restartNotice.deadline < Date.now() - 15_000) restartNotice = null // auto-clear ~15s past
        return sendJson(res, 200, { deadline: restartNotice?.deadline ?? null })
      }
      if (method === 'POST') {
        const ra = req.socket.remoteAddress ?? ''
        const isLocal = ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1'
        if (!isLocal) return sendJson(res, 403, { error: 'Local-only (run from inside the container).' })
        const body = await readJsonBody(req)
        const minutes = Number(body.minutes)
        if (!Number.isFinite(minutes) || minutes <= 0) { restartNotice = null; return sendJson(res, 200, { ok: true, cleared: true }) }
        restartNotice = { deadline: Date.now() + Math.min(minutes, 1440) * 60_000 }
        return sendJson(res, 200, { ok: true, deadline: restartNotice.deadline })
      }
      return sendJson(res, 405, { error: 'Method not allowed.' })
    }

    if (!user) return sendJson(res, 401, { error: 'Not signed in.' })

    if (path === '/api/me' && method === 'GET') return sendJson(res, 200, { user: publicUser(user) })

    // rooms where THIS account holds a seat (public OR private), still live — so a signed-in
    // player can rejoin their own games from any browser/device.
    if (path === '/api/my-rooms' && method === 'GET') {
      const mine = [...rooms.values()]
        .filter((r) => r.seats.some((s) => s?.account === user.username) && !(r.game && r.game.phase === 'over'))
        .map((r) => ({
          id: r.id,
          code: r.code,
          mode: r.mode,
          inProgress: !!r.game,
          seat: r.seats.findIndex((s) => s?.account === user.username),
          opponent: r.seats.find((s) => s && s.account !== user.username)?.name ?? null,
          createdAt: r.createdAt,
        }))
        .sort((a, b) => b.createdAt - a.createdAt)
      return sendJson(res, 200, { rooms: mine })
    }

    if (path === '/api/decks' && method === 'GET') return sendJson(res, 200, { decks: deckStore.list(user.id) })

    // bulk replace-all (used for first-sign-in migration of a browser's decks)
    if (path === '/api/decks' && method === 'PUT') {
      const body = await readJsonBody(req)
      const list = Array.isArray(body.decks) ? body.decks : null
      if (!list) return sendJson(res, 400, { error: 'Expected { decks: [...] }.' })
      if (list.length > 200) return sendJson(res, 400, { error: 'Too many decks.' })
      const clean = list.filter(validDeck) as { id: string; name: string }[]
      deckStore.replaceAll(user.id, clean)
      return sendJson(res, 200, { ok: true, saved: clean.length })
    }

    // per-deck upsert / delete by stable id: /api/decks/<id>
    if (path.startsWith('/api/decks/')) {
      const deckId = decodeURIComponent(path.slice('/api/decks/'.length))
      if (!deckId) return sendJson(res, 400, { error: 'Missing deck id.' })
      if (method === 'PUT') {
        const body = await readJsonBody(req)
        const d = body.deck
        if (!validDeck(d)) return sendJson(res, 400, { error: 'Invalid deck.' })
        if (d.id !== deckId) return sendJson(res, 400, { error: 'Deck id mismatch.' })
        deckStore.upsert(user.id, deckId, d.name, d)
        return sendJson(res, 200, { ok: true })
      }
      if (method === 'DELETE') {
        deckStore.remove(user.id, deckId)
        return sendJson(res, 200, { ok: true })
      }
      return sendJson(res, 405, { error: 'Method not allowed.' })
    }

    if (path === '/api/collection' && method === 'GET')
      return sendJson(res, 200, { collection: collectionStore.get(user.id) })

    if (path === '/api/collection' && method === 'PUT') {
      const body = await readJsonBody(req)
      collectionStore.set(user.id, sanitizeCollection(body.collection))
      return sendJson(res, 200, { ok: true })
    }

    if (path === '/api/achievements' && method === 'GET')
      return sendJson(res, 200, { unlocked: achievementStore.get(user.id) })

    // Merge (union) the client's earned set into the account — the earliest timestamp wins so a
    // reinstall / second device can't reset an unlock date. Unknown ids are dropped.
    if (path === '/api/achievements' && method === 'PUT') {
      const body = await readJsonBody(req)
      const incoming = body.unlocked && typeof body.unlocked === 'object' ? body.unlocked : {}
      const merged = achievementStore.get(user.id)
      for (const id of VALID_ACHV) {
        const t = incoming[id]
        if (typeof t !== 'number' || !isFinite(t)) continue
        merged[id] = merged[id] ? Math.min(merged[id], t) : t
      }
      achievementStore.set(user.id, merged)
      return sendJson(res, 200, { unlocked: merged })
    }

    // --- scenarios: save / delete your own (built-ins are read-only) ---
    if (path.startsWith('/api/scenarios/')) {
      const id = decodeURIComponent(path.slice('/api/scenarios/'.length))
      if (!id) return sendJson(res, 400, { error: 'Missing scenario id.' })
      if (method === 'PUT') {
        const body = await readJsonBody(req, 512 * 1024)
        const name = String(body.name ?? '').trim()
        if (!name) return sendJson(res, 400, { error: 'A scenario needs a name.' })
        if (name.length > 120) return sendJson(res, 400, { error: 'Scenario name too long.' })
        if (!validScenarioState(body.data)) return sendJson(res, 400, { error: 'Invalid scenario state.' })
        const existing = scenarioStore.get(id)
        if (existing && existing.owner_id !== user.id) return sendJson(res, 403, { error: 'That scenario is not yours.' })
        scenarioStore.upsert(user.id, id, name, body.isPublic !== false, body.data)
        return sendJson(res, 200, { ok: true })
      }
      if (method === 'DELETE') {
        const existing = scenarioStore.get(id)
        if (existing && existing.owner_id !== user.id) return sendJson(res, 403, { error: 'That scenario is not yours.' })
        scenarioStore.remove(user.id, id)
        return sendJson(res, 200, { ok: true })
      }
      return sendJson(res, 405, { error: 'Method not allowed.' })
    }

    return sendJson(res, 404, { error: 'Unknown API route.' })
  } catch (e: any) {
    return sendJson(res, e?.message === 'Payload too large' ? 413 : 400, { error: e?.message ?? 'Bad request' })
  }
}

const server = createServer((req, res) => {
  const url = req.url ?? '/'
  const pathname = url.split('?')[0]
  // accounts + decks API
  if (pathname.startsWith('/api/')) { void handleApi(req, res, pathname); return }
  // deck import endpoint (GET /import-deck?url=<sorcerytcg or curiosa link, or bare id>)
  if (url.split('?')[0] === '/import-deck') {
    const q = new URL(url, 'http://x').searchParams
    const input = q.get('url') ?? q.get('id') ?? ''
    // sorcerytcg.com is the current builder (bare ids default here); curiosa.io is the retired fallback.
    const sorceryId = extractSorceryDeckId(input)
    const curiosaId = sorceryId ? null : extractCuriosaDeckId(input)
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' }
    if (!sorceryId && !curiosaId) {
      res.writeHead(400, cors)
      res.end(JSON.stringify({ error: 'Not a deck link. Expected e.g. https://sorcerytcg.com/decks/<id> (or a curiosa.io link).' }))
      return
    }
    const id = (sorceryId ?? curiosaId)!
    const importer = sorceryId ? importSorceryDeck(sorceryId) : importCuriosaDeck(curiosaId!)
    importer.then(
      (deck) => { res.writeHead(200, cors); res.end(JSON.stringify({ deck })) },
      (e) => {
        console.error(`[import-deck] ${id}:`, e?.message ?? e)
        const raw = String(e?.message ?? e)
        // both sites report bad/private ids differently (curiosa: verbose Prisma; sorcerytcg: 404)
        const msg = /not found|findFirst|does not exist|not public/i.test(raw)
          ? 'Deck not found — check the link and that the deck is public.'
          : `Could not import deck: ${raw.slice(0, 160)}`
        res.writeHead(502, cors)
        res.end(JSON.stringify({ error: msg }))
      },
    )
    return
  }

  if (!existsSync(CLIENT_DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('Sorcery simulator server running. Build the client (npm run build) or use the Vite dev server.')
    return
  }
  let path = (req.url ?? '/').split('?')[0]
  if (path === '/') path = '/index.html'
  let file = join(CLIENT_DIST, path)
  const safe = file.startsWith(CLIENT_DIST)
  if (!safe || !existsSync(file) || !statSync(file).isFile()) {
    // A concrete asset request (one with a file extension) that doesn't exist is a
    // real 404 — never mask it with index.html. Doing so returns HTML for e.g. a
    // missing .webp, which silently breaks CSS background-images and slows the
    // <img> CDN fallback. Only EXTENSIONLESS paths are client routes → SPA shell.
    if (safe && extname(path)) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('Not found')
      return
    }
    file = join(CLIENT_DIST, 'index.html') // SPA fallback for client routes
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})

server.on('upgrade', (req, socket, head) => {
  if ((req.url ?? '').startsWith('/ws')) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  } else {
    socket.destroy()
  }
})

server.listen(PORT, () => {
  console.log(`Sorcery simulator server listening on http://localhost:${PORT} (ws: /ws)`)
})
