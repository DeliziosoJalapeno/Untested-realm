import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyAction,
  applyAchievements,
  createGame,
  starterDecks,
  viewFor,
  actingSeatFor,
  settleClock,
  runningSeat,
  flagFall,
  evaluate,
  DEFAULT_WEIGHTS,
  type Action,
  type ClockConfig,
  type DeckList,
  type GameState,
  type PlayerId,
  type PlayerView,
} from '@sorcery/shared'
import { Net, type ServerMsg, type SealedStateMsg, type SealedConfig } from './net'
import { botAction, botNeedsToAct, botActionKey } from './bot'
import type { BotReply } from './bot.worker'
import { useMobileMode } from './mobile'
import Home from './components/Home'
import DeckBuilder from './components/DeckBuilder'
import CollectionPage from './components/CollectionPage'
import ScenariosPage from './components/ScenariosPage'
import SealedDeckbuild from './components/SealedDeckbuild'
import Game from './components/Game'
import { loadCollection, ownedCopies, ripEriksCuriosa, syncCollectionOnSignIn, clearCollectionOnLogout, keepSealedPool } from './collection'
import { markUnlocked, syncAchievementsOnSignIn, clearAchievementsOnLogout } from './achievements'
import { AchievementToasts } from './components/Achievements'
import * as auth from './auth'

export interface Session {
  kind: 'online' | 'hotseat' | 'bot'
  seat: PlayerId | null
  view: PlayerView | null
  roomCode?: string
  send: (action: Action) => void
  /** ask to roll back the last action (opponent must approve online) */
  requestUndo?: () => void
  /** online: ask the opponent for permission to use the editor (game-state tools) */
  requestEditor?: () => void
  /** online creator, before an opponent joins: change your deck and/or the room clock */
  updateRoom?: (deck: DeckList, clock: ClockConfig | null) => void
  /** online: has the opponent granted this seat editor access? (always true offline) */
  editorAllowed?: boolean
  /** 'standard' bring-your-own-deck vs 'sealed' open-packs-and-build */
  mode?: 'standard' | 'sealed'
  /** suppress secret achievements for this session (scenario sandboxes — any board is constructible,
   *  so unlocks there would be trivially cheatable). Earned only in vs-computer / vs-player / hotseat. */
  noAchv?: boolean
  /** sealed only: push your in-progress deck + Ready flag during deckbuild */
  sealedSubmit?: (deck: DeckList, ready: boolean) => void
  /** hotseat/bot only: the full local state */
  local?: GameState
  /** bot only: pause after each bot action and wait for a manual "Next" click
   *  (kinder pace for players who find the real-time bot hard to follow) */
  stepBot?: boolean
  /** bot only: 'fast' = the instant procedural opponent; 'thinking' = the strong search bot, which
   *  plans in a Web Worker (see bot.worker.ts) while a "computer is thinking" indicator shows. */
  botDifficulty?: 'fast' | 'thinking'
  // ---- rematch (online): the post-game "play again?" offer + the deck-selection lobby ----
  /** answer the offer (both seats yes → rematch starts from deck selection) */
  rematchVote?: (yes: boolean) => void
  /** submit this seat's deck in the rematch deck-selection lobby */
  rematchDeck?: (deck: DeckList) => void
  /** wall-clock ms the current offer expires; null/absent = no open offer */
  rematchDeadline?: number | null
  /** this seat has voted yes */
  rematchYou?: boolean
  /** the opponent has voted yes */
  rematchOpp?: boolean
  /** true while the room is back at DECK SELECTION for an agreed rematch (view === null) */
  rematchLobby?: boolean
}

export function newDeckId(): string {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `d${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ---- online room persistence + URL (survives reload, tab close, and drops) ----
// The rejoin credential lives in localStorage (survives closing the tab, unlike
// sessionStorage) and the room lives in the URL as /room/<CODE> (shareable +
// bookmarkable + the source of truth on reload).
const ROOM_KEY = 'sorcery-room'
interface StoredRoom { id: string; code: string; token: string; seat: PlayerId }
function saveRoom(r: StoredRoom): void { localStorage.setItem(ROOM_KEY, JSON.stringify(r)) }
function loadRoom(): StoredRoom | null {
  try { const r = JSON.parse(localStorage.getItem(ROOM_KEY) ?? 'null'); return r?.id && r?.token ? r : null } catch { return null }
}
function clearRoom(): void { localStorage.removeItem(ROOM_KEY) }
/** the room id (UUID) from a /room/<id> URL, or null */
export function roomCodeFromUrl(): string | null {
  const m = location.pathname.match(/^\/room\/([0-9a-fA-F-]{8,40})\/?$/)
  return m ? m[1].toLowerCase() : null
}
function setRoomUrl(code: string): void {
  if (roomCodeFromUrl() !== code) history.replaceState(null, '', `/room/${code}`)
}
function clearRoomUrl(): void {
  if (location.pathname.startsWith('/room/')) history.replaceState(null, '', '/')
}

/** playing a CARD (a spell/minion/aura/artifact cast, or a site play) — the only
 *  actions that arm the "↩ Go back" free-undo on their first prompt. */
function isCardPlay(a: Action): boolean {
  return a.t === 'castSpell' || (a.t === 'avatarSite' && a.mode === 'play')
    // Animist "cast a magic as a Spirit" is held tentatively like a play (recorded only if it casts),
    // so its first prompt gets the same "↩ Go back" free-undo.
    || (a.t === 'activate' && a.ability === 'animate')
}
/** every deck carries a stable id; starters get a deterministic one */
function ensureDeckId(d: DeckList): DeckList {
  if (d.id) return d
  return { ...d, id: starterDecks.some((s) => s.name === d.name) ? `starter:${d.name}` : newDeckId() }
}
function isStarter(d: DeckList): boolean {
  return starterDecks.some((s) => s.name === d.name)
}
function localCustomDecks(): DeckList[] {
  try { return (JSON.parse(localStorage.getItem('sorcery-decks') ?? '[]') as DeckList[]) } catch { return [] }
}
function writeCustom(custom: DeckList[]): void {
  localStorage.setItem('sorcery-decks', JSON.stringify(custom))
}

export function loadDecks(): DeckList[] {
  let custom = localCustomDecks()
  // backfill ids on legacy decks and persist them once, so ids stay stable
  let changed = false
  custom = custom.map((d) => {
    if (!d.id) { changed = true; return ensureDeckId(d) }
    // A custom deck must never carry a `starter:` id — only the built-in starters
    // do. One that does is a legacy artifact of editing+renaming a starter; it
    // collides with the real starter in the picker (two options, same value, so
    // selecting one routes to the other). Remint it into its own distinct id.
    if (d.id.startsWith('starter:')) { changed = true; return { ...d, id: newDeckId() } }
    return d
  })
  if (changed) writeCustom(custom)
  const names = new Set(custom.map((d) => d.name))
  const starters = starterDecks.filter((d) => !names.has(d.name)).map(ensureDeckId)
  // pickers show YOUR decks first (alphabetical), then the built-in default decks (alphabetical)
  const byName = (a: DeckList, b: DeckList) => a.name.localeCompare(b.name)
  return [...custom.slice().sort(byName), ...starters.slice().sort(byName)]
}

/** save ONE deck (granular): upsert into local storage by id, and — when signed
 *  in — to the account via PUT /api/decks/<id>. Returns the deck with its id. */
export function saveDeck(deck: DeckList): DeckList {
  let d = ensureDeckId(deck)
  if (isStarter(d)) return d // built-in starter — nothing to persist
  // A deck derived from a starter still carries that starter's `starter:<name>`
  // id. Persisting under it makes the saved deck collide with the built-in
  // starter in the picker. Mint a fresh id so an edited/renamed starter becomes
  // its own distinct custom deck instead of shadowing the original.
  if (d.id?.startsWith('starter:')) d = { ...d, id: newDeckId() }
  writeCustom([...localCustomDecks().filter((x) => x.id !== d.id), d])
  if (auth.isSignedIn()) void auth.pushDeck(d).catch(() => { /* offline / stale */ })
  return d
}
/** delete ONE deck by id (local + account) */
export function deleteDeckById(id: string): void {
  writeCustom(localCustomDecks().filter((x) => x.id !== id))
  if (auth.isSignedIn()) void auth.deleteDeck(id).catch(() => { /* offline / stale */ })
}
/** bulk save (used by the first-sign-in migration) */
export function saveDecks(decks: DeckList[]): void {
  const custom = decks.filter((d) => !isStarter(d)).map(ensureDeckId)
  writeCustom(custom)
  if (auth.isSignedIn()) void auth.pushDecks(custom).catch(() => { /* offline / stale */ })
}

/** on sign-in, reconcile local and server decks: the account is the source of
 *  truth, but if it has none yet we migrate this browser's decks up. */
export async function syncDecksOnSignIn(): Promise<void> {
  const server = await auth.fetchDecks()
  if (server.length > 0) {
    writeCustom(server.filter((d) => !isStarter(d)).map(ensureDeckId))
  } else {
    const local = localCustomDecks().map(ensureDeckId)
    if (local.length > 0) await auth.pushDecks(local)
  }
}

/** a deck built in collection mode fetches from the player's owned pool; wire that
 *  owned pool into the deck's `collection` so in-game fetch effects (Silver Bullet,
 *  Toolbox…) draw from it. Other decks keep whatever collection they define. */
function withCollection(deck: DeckList): DeckList {
  if (!deck.fromCollection) return deck
  const col = loadCollection()
  const rec: Record<string, number> = {}
  for (const name of Object.keys(col.cards)) {
    const n = ownedCopies(col, name)
    if (n > 0) rec[name] = n
  }
  return { ...deck, collection: rec }
}

/** "3m 07s" / "45s" countdown for the restart banner */
function fmtRestart(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

export default function App() {
  const [page, setPage] = useState<'home' | 'decks' | 'game' | 'collection' | 'scenarios'>('home')
  const [session, setSession] = useState<Session | null>(null)
  const [username, setUsername] = useState<string | null>(auth.getUsername())
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false) // autobattle: waiting for an opponent
  const [undoAsk, setUndoAsk] = useState<string | null>(null)
  const [editorAsk, setEditorAsk] = useState<string | null>(null)
  const [sealed, setSealed] = useState<SealedStateMsg | null>(null) // sealed deckbuild phase
  const netRef = useRef<Net | null>(null)
  const leavingRef = useRef(false) // true while deliberately leaving a room (suppresses reconnect toast)
  // a shared /room link opened without a matching seat token → prefill Home's join box.
  // Computed synchronously so Home mounts already prefilled (its `code` state seeds once).
  const [pendingJoin, setPendingJoin] = useState<string | null>(() => {
    const urlId = roomCodeFromUrl()
    const stored = loadRoom()
    return urlId && !(stored && stored.id === urlId) ? urlId : null
  })
  // true while a just-played card's FIRST prompt is open → its "↩ Go back" free undo
  // is available (armed on a card play, disarmed on any answer/other action).
  const [playPending, setPlayPending] = useState(false)
  const localHistory = useRef<string[]>([])
  // chess clock (local modes only — online is server-authoritative): last wall-clock
  // ms we charged the running seat; `clockNow` just drives a 4Hz display re-render.
  const localClockTick = useRef(0)
  const viewAtRef = useRef(0) // when the latest online view arrived (for smooth extrapolation)
  const [clockNow, setClockNow] = useState(0)
  const [decksRev, setDecksRev] = useState(0) // bump to force Home to re-read decks after a server sync
  // site-wide "server restarting soon" notice (polled on every page); a top-center banner
  const [restartAt, setRestartAt] = useState<number | null>(null)
  const [restartNow, setRestartNow] = useState(Date.now())
  const [restartDismissed, setRestartDismissed] = useState<number | null>(null)

  // on load: if a token is stored, confirm it's still valid and pull the account's decks
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const me = await auth.fetchMe()
      if (cancelled) return
      setUsername(me)
      if (me) {
        try { await syncDecksOnSignIn() } catch { /* offline / stale */ }
        try { await syncCollectionOnSignIn(me) } catch { /* offline / stale */ }
        if (!cancelled) setDecksRev((r) => r + 1)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // poll the site-wide restart notice on EVERY page (there's no ws when just browsing),
  // and tick a 1s countdown while one is pending.
  useEffect(() => {
    let stop = false
    const poll = () => { void auth.fetchAnnounce().then((a) => { if (!stop) setRestartAt(a.deadline) }).catch(() => { /* offline */ }) }
    poll()
    const id = setInterval(poll, 5000)
    return () => { stop = true; clearInterval(id) }
  }, [])
  useEffect(() => {
    if (!restartAt) return
    setRestartNow(Date.now())
    const id = setInterval(() => setRestartNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [restartAt])

  // called by Home after a successful login/register (user) or logout (null)
  async function onAuth(user: string | null) {
    setUsername(user)
    if (user) {
      try { await syncDecksOnSignIn() } catch { /* offline */ }
      try { await syncCollectionOnSignIn(user) } catch { /* offline */ }
      try { await syncAchievementsOnSignIn(user) } catch { /* offline */ }
    } else {
      clearCollectionOnLogout() // don't leave the previous account's cards in this browser
      clearAchievementsOnLogout()
    }
    setDecksRev((r) => r + 1)
  }
  // Live handle on the mutable local GameState. The engine mutates it in place,
  // so we drive applyAction OUTSIDE the setSession updater and keep this ref as
  // the source of truth. (setSession updaters must be pure — React StrictMode
  // double-invokes them in dev, which double-applied every action and produced
  // spurious "That is not the active prompt" errors on the phantom second run.)
  const localRef = useRef<GameState | null>(null)

  // ── "Thinking" bot: the strong search runs in a Web Worker so its (up to 30s) planning never blocks
  //    the UI. A persistent worker keeps the search's turn-plan cache warm across messages. ──
  const botWorkerRef = useRef<Worker | null>(null)
  const botBusyRef = useRef(false) // a request is out to the worker; don't dispatch another
  const botReqIdRef = useRef(0) // stamps each request; a reply with a stale id (undo/leave) is ignored
  const botThinkTimerRef = useRef<number | null>(null) // delays the spinner so instant plan-replays don't flash it
  // anti-loop ward: main-phase actions the bot took THIS turn that left its score unchanged. Such an
  // action is EXCLUDED from the bot's next search (botAction skips it), so it picks the next-best move
  // instead of re-taking a score-neutral action forever. Cleared when the bot's turn ends.
  const botBannedRef = useRef<Set<string>>(new Set())
  const [botThinking, setBotThinking] = useState(false)

  // ── secret achievements: unlocks earned mid-game surface as dismissable toasts ──
  const [achvToasts, setAchvToasts] = useState<{ key: number; id: string }[]>([])
  const achvToastKey = useRef(0)

  function ensureBotWorker(): Worker {
    if (!botWorkerRef.current) {
      const w = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<BotReply>) => {
        const { id, action, error } = e.data
        botBusyRef.current = false
        if (botThinkTimerRef.current !== null) { clearTimeout(botThinkTimerRef.current); botThinkTimerRef.current = null }
        setBotThinking(false)
        if (id !== botReqIdRef.current) return // superseded by an undo / new game / leave — drop it
        const local = localRef.current
        if (!local || !botNeedsToAct(local, 1)) return
        applyBotAction(local, error || !action ? { t: 'endTurn' } : action)
      }
      botWorkerRef.current = w
    }
    return botWorkerRef.current
  }

  /** invalidate any in-flight worker computation (its reply will be dropped) and clear the spinner. */
  function invalidateBotThink() {
    botReqIdRef.current++
    botBusyRef.current = false
    if (botThinkTimerRef.current !== null) { clearTimeout(botThinkTimerRef.current); botThinkTimerRef.current = null }
    setBotThinking(false)
  }

  /** tear down the worker (fresh module state — and thus a fresh plan cache — for the next bot game). */
  function disposeBotWorker() {
    invalidateBotThink()
    botWorkerRef.current?.terminate()
    botWorkerRef.current = null
  }

  /** apply one resolved bot action (seat 1) with the same legal-fallback ladder used everywhere. */
  const botScore = (s: GameState): number => { try { return evaluate(s, 1, DEFAULT_WEIGHTS) } catch { return 0 } }
  function applyBotAction(local: GameState, action: Action) {
    // ANTI-LOOP WARD (main-phase actions only — prompts have their own guard): measure the bot's score
    // before and after; if a main action leaves the score UNCHANGED, exclude it from the bot's search
    // for the rest of this turn (below) so it can't be re-taken in a loop.
    const isMain = action.t !== 'prompt' && action.t !== 'endTurn' && local.prompts.length === 0 && local.phase === 'main'
    const scoreBefore = botScore(local)
    const snapshot = JSON.stringify(local)
    const res = applyAction(local, 1, action)
    if (!res.ok) {
      const fallback: Action = local.prompts[0]?.player === 1
        ? { t: 'prompt', promptId: local.prompts[0].id, choice: null }
        : local.phase === 'mulligan'
          ? { t: 'keepHand' }
          : { t: 'endTurn' }
      const res2 = applyAction(local, 1, fallback)
      if (!res2.ok) applyAction(local, 1, { t: 'concede' })
    }
    // if this main action didn't move the bot's score, BAN it from the bot's search for the rest of
    // the turn (so it isn't re-picked in a loop). endTurn clears the ban set for the next turn.
    if (action.t === 'endTurn') botBannedRef.current.clear()
    else if (isMain && botScore(local) === scoreBefore) botBannedRef.current.add(botActionKey(action))
    // the bot's move may earn the human an observer achievement (e.g. "Roll sanity")
    try { applyAchievements(JSON.parse(snapshot), local, 1, action) } catch { /* cosmetic */ }
    bumpSession()
  }

  /** publish a re-render for an in-place local mutation (pure updater). */
  function bumpSession() {
    setSession((cur) => (cur ? { ...cur } : cur))
  }

  /** Charge the running seat for elapsed real time (local modes). Returns true if
   *  a flag fell (the game just ended on time) so callers can stop. */
  function chargeLocalClock(): boolean {
    const local = localRef.current
    if (!local?.clock || local.phase === 'over') return false
    const now = Date.now()
    const seat = runningSeat(local)
    settleClock(local, localClockTick.current, now)
    localClockTick.current = now
    if (seat !== null && local.clock.remaining[seat] <= 0) {
      flagFall(local, seat)
      return true
    }
    return false
  }

  /** apply one local action as `actor`, mutating localRef in place, then render. */
  function runLocal(actor: PlayerId, action: Action): boolean {
    const local = localRef.current
    if (!local) return false
    if (chargeLocalClock()) { bumpSession(); return false } // flag fell first
    const snapshot = JSON.stringify(local)
    const result = applyAction(local, actor, action)
    if (!result.ok) {
      setError(result.error ?? 'Illegal action')
      return false
    }
    if (!session?.noAchv) { try { applyAchievements(JSON.parse(snapshot), local, actor, action) } catch { /* cosmetic */ } }
    pushLocalHistory0(snapshot)
    bumpSession()
    return true
  }

  // clear transient errors after a few seconds
  useEffect(() => {
    if (!error) return
    const id = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(id)
  }, [error])

  // ✂ Erik's Curiosa permanence: if MY collection deck rips it, that copy is gone forever
  const myDeckFromCollection = useRef(false)
  const lastRipHandled = useRef('')
  useEffect(() => {
    const view = session?.kind === 'online' ? session.view : hotseatView
    if (!view || !myDeckFromCollection.current) return
    const myName = session?.seat !== null && session?.seat !== undefined ? view.players[session.seat]?.name : view.players[0]?.name
    const line = view.log[view.log.length - 1]?.msg ?? ''
    const key = `${view.log.length}:${line}`
    if (line.includes('✂') && line.includes(`${myName} rips Erik's Curiosa`) && lastRipHandled.current !== key) {
      lastRipHandled.current = key
      if (ripEriksCuriosa(loadCollection())) {
        setError("✂ That Erik's Curiosa is gone from your collection. Forever.")
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  function localUndo() {
    if (!localRef.current || localHistory.current.length === 0) return
    invalidateBotThink() // a rolled-back position must not be answered by a stale worker reply
    const restored = JSON.parse(localHistory.current.pop()!) as GameState
    localRef.current = restored
    setSession((cur) => (cur?.local ? { ...cur, local: restored } : cur))
  }

  // arm/disarm the "↩ Go back" free undo: a card play arms it (its first prompt can
  // be undone free); answering that prompt — or any other action — disarms it.
  function armGoBack(action: Action) { setPlayPending(isCardPlay(action)) }
  /** discard a just-played card while its first prompt is open. Local: restore the
   *  pre-cast snapshot. Online: ask the server to roll back the tentative cast (which
   *  the opponent never saw). */
  function freeGoBack() {
    if (session?.kind === 'online') netRef.current?.cancelCast()
    else localUndo()
    setPlayPending(false)
  }

  /** begin a local pass-and-play (hotseat) session from a ready GameState. Shared by
   *  a fresh game (startHotseat) and a loaded scenario (startScenario). */
  function beginHotseatState(state: GameState, noAchv = false) {
    localHistory.current = []
    localClockTick.current = Date.now()
    const sess: Session = {
      kind: 'hotseat',
      seat: null,
      local: state,
      view: null,
      noAchv,
      requestUndo: localUndo, // both players share the screen: undo is by consent
      send: (action: Action) => {
        // in hotseat the acting player is whoever the UI says is acting
        armGoBack(action)
        const local = localRef.current
        if (!local) return
        runLocal(actingPlayer(local, action), action)
      },
    }
    localRef.current = state
    setSession(sess)
    setPage('game')
    // DEV-only debug bridge: lets a harness inject a board state and drive actions
    // to exercise flows that can't be reached through normal play. Stripped from
    // production builds.
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>
      w.__game = () => localRef.current
      w.__bump = () => bumpSession()
      w.__apply = (actor: PlayerId, action: Action) => {
        const l = localRef.current
        if (l) { applyAction(l, actor, action); bumpSession() }
      }
    }
  }

  function startHotseat(deckA: DeckList, deckB: DeckList, clock: ClockConfig | null = null, secondSeer = false) {
    myDeckFromCollection.current = !!deckA.fromCollection || !!deckB.fromCollection
    const state = createGame(
      [withCollection(deckA), withCollection(deckB)],
      ['Player 1', 'Player 2'],
      Math.floor(Math.random() * 0xffffffff),
      Math.random() < 0.5 ? 0 : 1,
      clock,
      { secondSeer },
    )
    beginHotseatState(state)
  }

  /** load a saved scenario snapshot into a fresh local hotseat game. Deep-cloned so
   *  editing the board never mutates the cached scenario. */
  function startScenario(state: GameState) {
    myDeckFromCollection.current = false
    // scenarios are sandboxes (any board is constructible) → no achievements here
    beginHotseatState(JSON.parse(JSON.stringify(state)) as GameState, true)
  }

  /** snapshot the CURRENT local game as a new scenario and save it to the account. */
  async function saveScenarioFromCurrent(name: string, isPublic: boolean): Promise<void> {
    const state = localRef.current
    if (!state) throw new Error('No local game to save.')
    if (!auth.isSignedIn()) throw new Error('Sign in to save scenarios.')
    const clone = JSON.parse(JSON.stringify(state)) as GameState
    await auth.pushScenario({ id: newDeckId(), name, isPublic, data: clone })
  }

  function pushLocalHistory0(snapshot: string) {
    localHistory.current.push(snapshot)
    if (localHistory.current.length > 80) localHistory.current.shift()
  }

  function startVsBot(myDeck: DeckList, botDeck: DeckList, clock: ClockConfig | null = null, stepBot = false, difficulty: 'fast' | 'thinking' = 'fast', secondSeer = false) {
    myDeckFromCollection.current = !!myDeck.fromCollection
    localHistory.current = []
    disposeBotWorker() // fresh worker (and plan cache) for the new game
    const state = createGame(
      [withCollection(myDeck), withCollection(botDeck)],
      ['You', 'Computer'],
      Math.floor(Math.random() * 0xffffffff),
      Math.random() < 0.5 ? 0 : 1,
      clock,
      { secondSeer },
    )
    localClockTick.current = Date.now()
    const sess: Session = {
      kind: 'bot',
      seat: 0,
      local: state,
      view: null,
      stepBot,
      botDifficulty: difficulty,
      requestUndo: localUndo, // the computer is a gracious opponent
      send: (action: Action) => {
        armGoBack(action)
        runLocal(0, action)
      },
    }
    localRef.current = state
    setSession(sess)
    setPage('game')
  }

  // apply exactly ONE bot action (seat 1). Shared by the auto-timer and the
  // manual "Next bot action" button used in step mode. Mutates the live state
  // OUTSIDE any setState updater (the engine mutates in place; doing it in an
  // updater double-applies under StrictMode), then bumps for a re-render.
  function runBotStep() {
    const local = localRef.current
    if (!local || !botNeedsToAct(local, 1)) return
    if (chargeLocalClock()) { bumpSession(); return } // bot flagged while thinking
    // "Thinking" difficulty: hand the position to the search worker and wait for its reply. Only the
    // first action of the turn actually thinks; the rest are instant plan-replays (hence the delayed
    // spinner). The worker's clock keeps charging seat 1 via the heartbeat while it plans.
    if (session?.botDifficulty === 'thinking') {
      if (botBusyRef.current) return // already waiting on the worker
      botBusyRef.current = true
      const id = ++botReqIdRef.current
      if (botThinkTimerRef.current !== null) clearTimeout(botThinkTimerRef.current)
      botThinkTimerRef.current = window.setTimeout(() => setBotThinking(true), 350)
      ensureBotWorker().postMessage({ id, state: JSON.stringify(local), seat: 1, timeBudgetMs: 30000, banned: [...botBannedRef.current] })
      return
    }
    // "Fast" difficulty: the instant procedural bot, computed inline. Score-neutral actions taken
    // earlier this turn are excluded from its search (the anti-loop ward).
    let action: Action
    try {
      action = botAction(local, 1, botBannedRef.current)
    } catch {
      action = { t: 'endTurn' }
    }
    applyBotAction(local, action)
  }

  // the bot (seat 1) acts whenever the game waits on it, with a small delay —
  // UNLESS step mode is on, where it waits for the manual "Next bot action" click.
  useEffect(() => {
    if (session?.kind !== 'bot' || !session.local) return
    if (!botNeedsToAct(session.local, 1)) return
    if (session.stepBot) return // manual advance only
    let cancelled = false
    const id = setTimeout(() => { if (!cancelled) runBotStep() }, 1000)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // terminate the search worker when the app unmounts (frees the background thread).
  useEffect(() => () => { botWorkerRef.current?.terminate(); botWorkerRef.current = null }, [])

  // chess-clock heartbeat: charge the running seat in local modes (server does it
  // online) and drive a 4Hz re-render so the clocks visibly count down.
  useEffect(() => {
    if (!session) return
    const hasClock = session.kind === 'online' ? !!session.view?.clock : !!localRef.current?.clock
    if (!hasClock) return
    const id = setInterval(() => {
      if (session.kind !== 'online') {
        if (chargeLocalClock()) { bumpSession(); return }
      }
      setClockNow(Date.now())
    }, 250)
    return () => clearInterval(id)
  }, [session])

  // one message handler for BOTH a fresh connection and an auto-reconnect/rejoin.
  function onNetMessage(net: Net, msg: ServerMsg): void {
    if (msg.t === 'error') {
      setError(msg.msg); setSearching(false)
      // the room is gone (server restarted / room expired) — drop the stale creds + URL
      if (/room not found|invalid token/i.test(msg.msg)) {
        leavingRef.current = true
        clearRoom(); clearRoomUrl()
        net.close(); if (netRef.current === net) netRef.current = null
        setSession(null); setPage('home')
      }
      return
    }
    if (msg.t === 'searching') { setSearching(true); return }
    if (msg.t === 'undoAsk') setUndoAsk(msg.from)
    if (msg.t === 'editorAsk') setEditorAsk(msg.from)
    if (msg.t === 'editorGranted') setSession((cur) => (cur ? { ...cur, editorAllowed: true } : cur))
    if (msg.t === 'chat') setError(`${msg.from}: ${msg.msg}`)
    if (msg.t === 'joined') {
      setSearching(false)
      setRoomUrl(msg.id) // the URL uses the opaque UUID; the short code is for typing/sharing
      // a seated player remembers its rejoin token + how to reconnect; a spectator
      // just re-spectates on reconnect (no token to store). Reconnect by UUID.
      if (msg.token != null && msg.seat !== null) {
        const id = msg.id, token = msg.token
        saveRoom({ id, code: msg.code, token, seat: msg.seat })
        net.onReopen = () => net.rejoin(id, token, auth.getToken())
      } else {
        const id = msg.id
        net.onReopen = () => net.spectate(id)
      }
      setSession((cur) => ({
        kind: 'online',
        seat: msg.seat,
        view: cur?.view ?? null,
        roomCode: msg.code,
        mode: msg.mode ?? 'standard',
        send: (action: Action) => { armGoBack(action); net.action(action) },
        requestUndo: () => net.send({ t: 'undoRequest' }),
        requestEditor: () => net.send({ t: 'editorRequest' }),
        updateRoom: (deck: DeckList, clock: ClockConfig | null) => net.roomConfig(withCollection(deck), clock),
        sealedSubmit: (deck: DeckList, ready: boolean) => net.sealedDeck(deck, ready),
        rematchVote: (yes: boolean) => net.rematchVote(yes),
        rematchDeck: (deck: DeckList) => net.rematchDeck(withCollection(deck)),
        editorAllowed: cur?.editorAllowed ?? false,
        rematchDeadline: cur?.rematchDeadline ?? null,
        rematchLobby: cur?.rematchLobby ?? false,
      }))
      setPage('game')
    }
    if (msg.t === 'rematchStart') {
      // both players agreed → the room is back at DECK SELECTION. Drop the finished board (view=null,
      // which routes to the waiting screen) and flag the rematch lobby so it shows a deck picker for
      // BOTH seats. Sealed rooms re-enter their own deckbuild via the sealedState message instead.
      setUndoAsk(null); setEditorAsk(null)
      if (msg.mode !== 'sealed') {
        setSession((cur) => (cur ? { ...cur, view: null, rematchLobby: true, rematchDeadline: null, rematchYou: false, rematchOpp: false } : cur))
      }
    }
    if (msg.t === 'sealedState') {
      // "players keep all the cards they open" — credit your pool to your collection
      // once per room (guarded so a reconnect doesn't double it).
      if (!msg.spectator) keepSealedPool(loadRoom()?.id ?? '', msg.pool, msg.numPacks)
      setSealed(msg)
      setPage('game')
    }
    if (msg.t === 'state') {
      viewAtRef.current = Date.now() // anchor for smooth clock extrapolation
      setSealed(null) // deckbuild is over — the game has begun
      // pending undo/editor asks ride in synced state (not one-shot), so they show
      // even after a tab switch / disconnect / reconnect and clear once resolved.
      if (msg.undoAsk !== undefined) setUndoAsk(msg.undoAsk)
      if (msg.editorAsk !== undefined) setEditorAsk(msg.editorAsk)
      setSession((cur) =>
        cur
          ? {
              ...cur,
              view: msg.view,
              editorAllowed: msg.editorAllowed ?? cur.editorAllowed,
              // rematch offer rides in synced state (survives reconnect); a fresh non-over game
              // clears the lobby flag so the board shows instead of the deck picker.
              rematchDeadline: msg.rematchDeadline !== undefined ? msg.rematchDeadline : cur.rematchDeadline,
              rematchYou: msg.rematchYou ?? false,
              rematchOpp: msg.rematchOpp ?? false,
              rematchLobby: (msg.view as PlayerView | null) ? false : cur.rematchLobby,
            }
          : cur,
      )
    }
  }

  /** attach the shared message handler + a reconnect toast to a Net. */
  function wireNet(net: Net): void {
    net.onMessage = (msg: ServerMsg) => onNetMessage(net, msg)
    net.onClose = () => { if (!leavingRef.current && net.onReopen) setError('⚠ Connection lost — reconnecting…') }
  }

  function startOnline(mode: 'create' | 'join' | 'spectate' | 'matchmake' | 'rejoin', name: string, deck: DeckList | null, code?: string, clock?: ClockConfig | null, isPublic?: boolean, secondSeer?: boolean) {
    myDeckFromCollection.current = !!deck?.fromCollection
    leavingRef.current = false
    const net = new Net()
    netRef.current = net
    wireNet(net)
    net.onOpen = () => {
      const authToken = auth.getToken() // when signed in, the server uses the account username
      if (mode === 'create') net.create(name, withCollection(deck!), clock ?? null, !!isPublic, authToken, !!secondSeer)
      else if (mode === 'spectate') net.spectate(code!)
      else if (mode === 'matchmake') net.matchmake(name, withCollection(deck!), authToken)
      // rejoin one of YOUR games (from anywhere): use the stored per-room token if this
      // browser has it, otherwise fall back to account-based rejoin (server matches by
      // account). `code` is the room id.
      else if (mode === 'rejoin') { const st = loadRoom(); net.rejoin(code!, st && st.id === code ? st.token : '', authToken) }
      else net.join(code!, name, withCollection(deck!), authToken)
    }
    net.connect()
  }
  function cancelMatchmaking() {
    netRef.current?.cancelMatch()
    netRef.current?.close()
    netRef.current = null
    setSearching(false)
  }

  /** create or join a SEALED room (no deck up front — packs open in the deckbuild phase). */
  function startSealed(mode: 'create' | 'join', name: string, opts: { cfg?: SealedConfig; code?: string; clock?: ClockConfig | null; isPublic?: boolean; secondSeer?: boolean }) {
    myDeckFromCollection.current = false
    leavingRef.current = false
    const net = new Net()
    netRef.current = net
    wireNet(net)
    net.onOpen = () => {
      const authToken = auth.getToken()
      if (mode === 'create') net.createSealed(name, opts.cfg!, opts.clock ?? null, !!opts.isPublic, authToken, !!opts.secondSeer)
      else net.joinSealed(opts.code!, name, authToken)
    }
    net.connect()
  }

  // If a waiting player wandered off to browse (created a room / matchmaking), pull them back
  // into the game the instant it actually starts — i.e. the online view goes absent → present.
  const hadOnlineViewRef = useRef(false)
  useEffect(() => {
    const hasView = session?.kind === 'online' && !!session.view
    if (hasView && !hadOnlineViewRef.current && page !== 'game') setPage('game')
    hadOnlineViewRef.current = hasView
  }, [session, page])

  // on load: reconnect a seated player from their stored token + /room URL, or send a
  // fresh visitor of a shared /room/<CODE> link to Home with the code prefilled.
  useEffect(() => {
    if (session) return
    const urlId = roomCodeFromUrl()
    const stored = loadRoom()
    // a stored token (matching the URL room, if any) → seated reconnect (by UUID)
    if (stored && (!urlId || urlId === stored.id)) {
      leavingRef.current = false
      const net = new Net()
      netRef.current = net
      wireNet(net)
      net.onOpen = () => net.rejoin(stored.id, stored.token, auth.getToken())
      net.onReopen = () => net.rejoin(stored.id, stored.token, auth.getToken())
      net.connect()
      setRoomUrl(stored.id)
      return
    }
    // shared link opened without a seat token → offer join/spectate on Home
    if (urlId) { setPendingJoin(urlId); clearRoom() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hotseatView = useMemo(() => {
    if ((session?.kind !== 'hotseat' && session?.kind !== 'bot') || !session.local) return null
    if (import.meta.env.DEV) (window as any).__sorc = session.local
    // in bot mode the human is always seat 0; in hotseat the viewpoint follows the action
    return viewFor(session.local, session.kind === 'bot' ? botDisplaySeat(session.local) : hotseatViewpoint(session.local))
  }, [session])

  // Harvest any achievements the current state records for the seats THIS browser controls
  // (hotseat = both, vs-bot = seat 0, online = your seat), persist them, and toast the new ones.
  // markUnlocked de-dupes against what's already earned, so re-running on every state update is safe.
  useEffect(() => {
    if (!session || session.noAchv) return // scenarios earn nothing
    const seats: PlayerId[] =
      session.kind === 'hotseat' ? [0, 1]
        : session.kind === 'bot' ? [0]
          : session.seat !== null ? [session.seat] : []
    if (!seats.length) return
    const flow: any = session.kind === 'online' ? session.view?.flow : session.local?.flow
    const list = flow?.achievements as { id: string; seat: PlayerId }[] | undefined
    if (!list?.length) return
    const fresh = markUnlocked(list.filter((u) => seats.includes(u.seat)).map((u) => u.id))
    if (fresh.length) setAchvToasts((cur) => [...cur, ...fresh.map((id) => ({ key: achvToastKey.current++, id }))])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // Mobile GUI mode: auto-on for real phones (a "redirect" that also marks the URL
  // with ?mobile so it's shareable), forcible on desktop via /mobile or ?mobile for a
  // phone-frame preview. See src/mobile.ts.
  const mm = useMobileMode()
  useEffect(() => {
    if (mm.mobile && !mm.simulated) {
      try {
        const u = new URL(location.href)
        if (!u.searchParams.has('mobile') && !/^\/mobile(\/|$)/.test(u.pathname)) {
          u.searchParams.set('mobile', '1')
          history.replaceState(null, '', u.pathname + u.search)
        }
      } catch { /* ignore */ }
    }
  }, [mm.mobile, mm.simulated])

  // Real mobile: the browser's chrome (URL/nav bar) both SHRINKS the visible area and
  // OFFSETS it (a top bar pushes the visible region down). `100dvh`/`top:0` ignore both,
  // so content clips behind the bar. `visualViewport` gives the true visible RECT — publish
  // its offset + size as CSS vars and pin the game container exactly to it. Recomputed on
  // resize, orientation change, and toolbar show/hide (visualViewport resize/scroll).
  useEffect(() => {
    if (!mm.mobile || mm.simulated) return
    const vv = window.visualViewport
    const set = () => {
      const s = document.documentElement.style
      s.setProperty('--vv-top', `${Math.round(vv?.offsetTop ?? 0)}px`)
      s.setProperty('--vv-left', `${Math.round(vv?.offsetLeft ?? 0)}px`)
      s.setProperty('--vv-width', `${Math.round(vv?.width ?? window.innerWidth)}px`)
      s.setProperty('--vv-height', `${Math.round(vv?.height ?? window.innerHeight)}px`)
    }
    set()
    vv?.addEventListener('resize', set)
    vv?.addEventListener('scroll', set)
    window.addEventListener('resize', set)
    window.addEventListener('orientationchange', set)
    return () => {
      vv?.removeEventListener('resize', set)
      vv?.removeEventListener('scroll', set)
      window.removeEventListener('resize', set)
      window.removeEventListener('orientationchange', set)
      const s = document.documentElement.style
      s.removeProperty('--vv-top'); s.removeProperty('--vv-left')
      s.removeProperty('--vv-width'); s.removeProperty('--vv-height')
    }
  }, [mm.mobile, mm.simulated])

  // the mobile frame is PORTRAIT for menus (scrollable) and LANDSCAPE only for the game.
  // The SEALED deckbuild phase runs while page === 'game' but before there's a board (no view yet);
  // it's really a menu, so it must NOT get the fixed landscape 866×400 overflow-hidden game frame
  // (that clipped the whole builder) — treat it as a scrollable portrait menu instead.
  const inSealedBuild = !!(sealed && session?.kind === 'online' && !session?.view)
  const atGame = page === 'game' && !inSealedBuild
  const appClass = `app${mm.mobile ? ' mobile' : ''}${mm.simulated ? ' mobile-sim' : ''}${mm.mobile && atGame ? ' at-game' : ''}${mm.mobile && mm.portrait && !mm.simulated ? ' portrait' : ''}${!mm.mobile && page === 'game' ? ' at-game-desktop' : ''}`

  return (
    <div className={appClass}>
      {restartAt && restartAt > restartNow && restartDismissed !== restartAt && (
        <div className="restart-banner" data-restart>
          <span>⚠ Server restarts in {fmtRestart(restartAt - restartNow)} — all ongoing battles will end.</span>
          <button className="restart-x" title="Dismiss" onClick={() => setRestartDismissed(restartAt)}>✕</button>
        </div>
      )}
      {error && <div className="toast error">{error}</div>}
      <AchievementToasts toasts={achvToasts} onDismiss={(key) => setAchvToasts((c) => c.filter((t) => t.key !== key))} />
      {/* Non-blocking so you can keep browsing (decks, collection…) while you queue. */}
      {searching && !session && (
        <div className="waitbanner">
          <span className="spinner">⚔</span>
          <span>Looking for an opponent… <span className="wb-sub">you'll be matched with the next player who queues</span></span>
          <button onClick={cancelMatchmaking}>Cancel</button>
        </div>
      )}
      {/* Created a room and wandered off to browse: a non-blocking banner to jump back or bail. */}
      {session?.kind === 'online' && !session.view && page !== 'game' && (
        <div className="waitbanner">
          <span className="spinner">⏳</span>
          <span>Waiting for an opponent in your room…</span>
          <button onClick={() => setPage('game')}>Return to room</button>
          <button onClick={() => {
            leavingRef.current = true
            netRef.current?.close(); netRef.current = null
            clearRoom(); clearRoomUrl(); setSession(null)
          }}>Leave</button>
        </div>
      )}
      {undoAsk && (
        <div className="modal" style={{ zIndex: 120 }}>
          <h3>↩ {undoAsk} asks to undo the last action</h3>
          <button
            onClick={() => {
              netRef.current?.send({ t: 'undoReply', ok: true })
              setUndoAsk(null)
            }}
          >
            Allow
          </button>
          <button
            onClick={() => {
              netRef.current?.send({ t: 'undoReply', ok: false })
              setUndoAsk(null)
            }}
          >
            Decline
          </button>
        </div>
      )}
      {editorAsk && (
        <div className="modal" style={{ zIndex: 120 }}>
          <h3>✎ {editorAsk} asks to use the Editor</h3>
          <p style={{ opacity: 0.75, maxWidth: 380 }}>
            The Editor lets them directly change the game state (life, mana, cards on the board, and more) to
            resolve card text manually. Allow only if you trust them — every use is logged.
          </p>
          <button
            onClick={() => {
              netRef.current?.send({ t: 'editorReply', ok: true })
              setEditorAsk(null)
            }}
          >
            Allow
          </button>
          <button
            onClick={() => {
              netRef.current?.send({ t: 'editorReply', ok: false })
              setEditorAsk(null)
            }}
          >
            Decline
          </button>
        </div>
      )}
      {page === 'home' && (
        <Home
          key={`home-${decksRev}-${pendingJoin ?? ''}`}
          username={username}
          onAuth={onAuth}
          onHotseat={startHotseat}
          onOnline={startOnline}
          onSealed={startSealed}
          onVsBot={startVsBot}
          onDecks={() => setPage('decks')}
          onCollection={() => setPage('collection')}
          onScenarios={() => setPage('scenarios')}
          initialRoomCode={pendingJoin}
        />
      )}
      {page === 'decks' && <DeckBuilder onBack={() => setPage('home')} />}
      {page === 'collection' && <CollectionPage onBack={() => setPage('home')} />}
      {page === 'scenarios' && (
        <ScenariosPage
          username={username}
          onBack={() => setPage('home')}
          onLoad={(state) => startScenario(state)}
        />
      )}
      {page === 'game' && session && session.kind === 'online' && !session.view && sealed && (
        <SealedDeckbuild
          pool={sealed.pool}
          packs={sealed.packs}
          edition={sealed.edition}
          numPacks={sealed.numPacks}
          deadline={sealed.deadline}
          oppReady={sealed.oppReady}
          oppPresent={sealed.oppPresent}
          youReady={sealed.youReady}
          initialDeck={sealed.deck}
          spectator={sealed.spectator}
          roomKey={loadRoom()?.id ?? session.roomCode ?? ''}
          onSubmit={(deck, ready) => session.sealedSubmit?.(deck, ready)}
          onLeave={() => {
            leavingRef.current = true
            netRef.current?.close()
            netRef.current = null
            clearRoom(); clearRoomUrl()
            setSealed(null); setSession(null); setPage('home')
          }}
        />
      )}
      {page === 'game' && session && !(session.kind === 'online' && !session.view && sealed) && (
        <>
          <Game
            session={session}
            view={session.kind === 'online' ? session.view : hotseatView}
            hotseatViewpoint={session.kind === 'bot' && session.local ? botDisplaySeat(session.local) : session.kind === 'hotseat' && session.local ? hotseatViewpoint(session.local) : null}
            clockNow={clockNow}
            clockAnchorAt={viewAtRef.current}
            onSaveScenario={session.kind !== 'online' ? saveScenarioFromCurrent : undefined}
            onGoBack={playPending ? freeGoBack : undefined}
            mobile={mm.mobile}
            botControl={session.kind === 'bot' && localRef.current ? {
              stepMode: !!session.stepBot,
              canAdvance: botNeedsToAct(localRef.current, 1),
              onAuto: () => setSession((cur) => (cur ? { ...cur, stepBot: false } : cur)),
              onStep: () => setSession((cur) => (cur ? { ...cur, stepBot: true } : cur)),
              onNext: runBotStep,
            } : undefined}
            onLeave={() => {
              leavingRef.current = true
              netRef.current?.close()
              netRef.current = null
              disposeBotWorker()
              clearRoom(); clearRoomUrl()
              setSession(null)
              setPage('home')
            }}
            // keep the online session alive and just switch pages, so a player waiting for an
            // opponent (created room / matchmaking) can browse the rest of the site meanwhile.
            onBrowse={session.kind === 'online' && !session.view ? () => setPage('home') : undefined}
          />
          {!mm.mobile && session.kind === 'bot' && localRef.current && (session.stepBot ? botNeedsToAct(localRef.current, 1) : true) && (
            <div className="botstepbar">
              {session.stepBot ? (
                <>
                  <span>🤖 Computer's turn — paused</span>
                  <button className="botstep-next" title="Next computer action (D)" onClick={runBotStep}>▶ Next action</button>
                  <button className="botstep-auto" onClick={() => setSession((cur) => (cur ? { ...cur, stepBot: false } : cur))}>⏩ Resume auto</button>
                </>
              ) : (
                // fast-forward is running — let the player drop back into step mode at any time
                <button className="botstep-step" onClick={() => setSession((cur) => (cur ? { ...cur, stepBot: true } : cur))}>⏸ Step through actions</button>
              )}
            </div>
          )}
          {botThinking && (
            <div className="bot-thinking" role="status" aria-live="polite">
              <span className="bot-thinking-spinner" aria-hidden="true" />
              <span>Computer is thinking…</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** whose BOARD the hotseat device shows right now (pass-and-play). During a Thaïs
 *  turn this is the CONTROLLED seat — the device flips to the hand being played, and
 *  the same person pilots it (act-permission maps to the controller via actingSeatFor). */
export function hotseatViewpoint(state: GameState): PlayerId {
  if (state.prompts.length > 0) return state.prompts[0].player
  if (state.phase === 'mulligan') {
    if (!state.players[0].keptHand) return 0
    return 1
  }
  return state.activePlayer
}

/** whose BOARD the vs-Computer human (seat 0) sees. Normally their own seat; but when
 *  Thaïs hands the human control of the computer's turn, the board flips to seat 1 so
 *  they can see (and play) that hand. (When the computer controls the human's turn it
 *  just plays it and the human watches from seat 0.) */
export function botDisplaySeat(state: GameState): PlayerId {
  if (state.phase === 'mulligan') return 0
  const decision = state.prompts[0]?.player ?? state.activePlayer
  return actingSeatFor(state, decision) === 0 ? decision : 0
}

export function actingPlayer(state: GameState, action: Action): PlayerId {
  if (action.t === 'mulligan' || action.t === 'keepHand') {
    return !state.players[0].keptHand ? 0 : 1
  }
  // gifting time to a seat's clock is done BY the other seat
  if (action.t === 'addTime') return (1 - action.player) as PlayerId
  // Thaïs: the decision's owner may be piloted by the other seat — send as the seat
  // that actually decides so the local apply is legal (dispatch also remaps).
  const decision = action.t === 'prompt' ? (state.prompts[0]?.player ?? state.activePlayer) : state.activePlayer
  return actingSeatFor(state, decision)
}
