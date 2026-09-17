import { Children, cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  GRID_H,
  GRID_W,
  squareLabel,
  affinity,
  allCards,
  affordable,
  canCast,
  cardSupport,
  effAttack,
  effDefence,
  effKeywords,
  isSummoningSick,
  unitsAt,
  findCard,
  findPath,
  inBounds,
  getScript,
  getCard,
  isEvilCardNameFor,
  isWaterSite,
  siteAt,
  orthAdjacentWrapped,
  directionReach,
  grantedAbilities,
  cemeteryActivations,
  isDisabled,
  legalSiteSquares,
  reachableLocations,
  loopRoutes,
  siteSilenced,
  artifactSilenced,
  enumeratePaths,
  legalStepsFrom,
  isFreeStep,
  maxSteps,
  spellMorphName,
  validateSummonAt,
  validateTarget,
  printingsFor,
  abilityAnchor,
  canActivate,
  isEvilUnit,
  isCarriableArtifact,
  carriedInside,
  occupiedSquares,
  occupies,
  coneSquares,
  areaDamagePreview,
  type Action,
  type AreaDamageParams,
  type BlowDirection,
  type ClockConfig,
  type DeckList,
  type PlayerId,
  type PlayerView,
  type Region,
  type Step,
  type UnitState,
  actingSeatFor,
  runningSeat,
} from '@sorcery/shared'
import { loadDecks, type Session } from '../App'
import CardImg, { CardHover, CardBack } from './CardImg'
import { QuakeArrange } from './QuakeArrange'
import { hasFaq, faqFor } from '../faq'
import {
  presentViews,
  viewLabel,
  unitMatchesView,
  siteMatchesView,
  artMatchesView,
  handMatchesView,
} from '../subtypeView'

// What a route picker does once the ROUTE is chosen. `undefined` = a plain relocation
// (just send the move). The attack/move chooser runs BEFORE the route pick, so an attack
// choice defers its strike here: the route is chosen, THEN the attack fires along it.
type MovePending =
  | { kind: 'attack'; attack: { unit: string } | { site: string } }
  | { kind: 'pick'; candidates: string[]; name: string } // several same-name enemies → click one after

type Mode =
  | { m: 'idle' }
  | { m: 'artifact'; artifactId: string }
  | { m: 'unit'; unitId: string }
  | { m: 'site'; siteId: string }
  | { m: 'placeSite'; cardId: string }
  // The player picks WHO casts a spell when >1 controlled unit is a legal caster
  // (rulebook: the Spellcaster and its location are by whom/where the spell is cast).
  // The chosen casterId is then threaded through the type-routing below. `casters`
  // is the engine's legal-caster set (every u with canCast(...,u.id).ok).
  | { m: 'chooseCaster'; cardId: string; casters: string[] }
  // Animist avatar: a magic in hand may be cast normally, or animated into a Spirit
  // (via the avatar's `animate` ability). This picks which.
  | { m: 'animistChoice'; cardId: string }
  // Every cast-flow mode carries the chosen casterId so region-anchoring, adjacency,
  // 'here'/'nearby' targets and the damage-grid origin follow the caster, not the avatar.
  | { m: 'summon'; cardId: string; casterId: string }
  | { m: 'conjure'; cardId: string; casterId: string }
  | { m: 'aura'; cardId: string; casterId: string }
  | { m: 'editAura'; auraId: string } // Editor: a placed aura selected for hand-editing
  | { m: 'magic'; cardId: string; casterId: string; picked: string[] }
  | { m: 'siteOrSpell'; cardId: string; morph: string; casterId: string }
  | { m: 'genesisTargets'; cardId: string; casterId: string; at: { x: number; y: number; region?: Region }; picked: string[] }
  | { m: 'shoot'; unitId: string; casterId?: string }
  // move/attack disambiguation when the destination holds enemies and/or an enemy site. A `pick` choice
  // aggregates several same-named co-located enemies — selecting it opens the pickTargetUnit follow-up.
  | { m: 'moveChoice'; unitId: string; path: Step[]; choices: { label: string; attack?: { unit: string } | { site: string }; path?: Step[]; pick?: string[] }[] }
  // follow-up after choosing to attack a NAME shared by several co-located enemies: click which one
  | { m: 'pickTargetUnit'; unitId: string; path: Step[]; candidates: string[]; name: string }
  // a multi-step relocation with MORE THAN ONE shortest route to the destination — the
  // player picks which route (it matters for departed-location effects: Giant Shark, Root
  // Spider, Blaze). Only opened when >1 path exists (a single route auto-resolves).
  | { m: 'pathChoice'; unitId: string; dest: Step; paths: Step[][]; after?: MovePending }
  // too-complex route sets (region changes, or ≥10 candidate routes) skip the arrows:
  // 'howMove' asks Auto vs Manual; 'manualMove' walks one legal step at a time (≤ n+1),
  // with `stuck` = ran out of steps / stopped short of the stated destination.
  | { m: 'howMove'; unitId: string; dest: Step; paths: Step[][]; after?: MovePending }
  | { m: 'manualMove'; unitId: string; dest: Step; steps: Step[]; budget: number; after?: MovePending; stuck?: boolean; atDest?: boolean }
  // a summon square that is legal in more than one region (Submerge/Burrowing minions)
  | { m: 'summonRegion'; cardId: string; casterId: string; x: number; y: number; regions: Region[] }
  // reaching a destination in more than one region (dive vs surface). siteId set ⇒
  // the destination is an enemy site: after picking, route to the attack prompt if
  // surface was chosen (only a site's surface can be attacked).
  | { m: 'moveRegion'; unitId: string; x: number; y: number; regions: Region[]; siteId?: string }
  // an activated ability that declares target specs (Savior's ward...)
  | { m: 'abilityTargets'; sourceId: string; abilityKey: string; specs: any[]; picked: string[] }
  | { m: 'promptTargets'; promptId: string; picked: string[] }
  // Chaos Twister: pick the minion, the blow origin, the direction, confirm the cone
  | { m: 'blowTarget'; cardId: string; casterId: string }
  | { m: 'blowOrigin'; cardId: string; casterId: string; targetId: string }
  | { m: 'blowDir'; cardId: string; casterId: string; targetId: string; origin: { x: number; y: number } }
  | { m: 'blowConfirm'; cardId: string; casterId: string; targetId: string; origin: { x: number; y: number }; dir: BlowDirection }
  // judge scenario-creation: click a square to place/summon/move via judge ops
  | { m: 'judgePlace'; op: 'summonUnit' | 'placeSite' | 'spawnArtifact' | 'move' | 'moveArtifact'; name?: string; player: PlayerId; unitId?: string; artifactId?: string; region: Region; noGenesis?: boolean }
  // final-confirmation panel for a "printed area" damage spell: the resolved damage
  // grid is overlaid on the board (big numbers, tinted by element) with Cast/Cancel.
  // `commit` is the exact action to send once the player confirms.
  | { m: 'areaConfirm'; name: string; element: string; cells: { x: number; y: number; dmg: number }[]; commit: Action }
  // Multi-select card menu for picking up / dropping artifacts, opened only when a unit
  // can pick up (or can drop) MORE THAN ONE artifact. Each candidate is listed
  // separately (no de-duping of same-named artifacts); `picked` holds the chosen ids.
  | { m: 'chooseArts'; kind: 'pickup' | 'drop'; unitId: string; artIds: string[]; picked: string[] }

/** shown while a room creator waits alone: change your deck and/or the clock; the
 *  chosen setup is applied the moment an opponent joins (server-side maybeStart). */
function RoomConfigControls({ onUpdate }: { onUpdate: (deck: DeckList, clock: ClockConfig | null) => void }) {
  const decks = loadDecks()
  const [deckId, setDeckId] = useState(decks[0]?.id ?? '')
  const [clockOn, setClockOn] = useState(false)
  const [baseMin, setBaseMin] = useState(15)
  const [incSec, setIncSec] = useState(30)
  const [msg, setMsg] = useState<string | null>(null)
  const deck = decks.find((d) => d.id === deckId) ?? decks[0]
  return (
    <div className="roomconfig" data-roomconfig>
      <b>Change your setup while you wait:</b>
      <label>
        Deck{' '}
        <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
          {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label><input type="checkbox" checked={clockOn} onChange={(e) => setClockOn(e.target.checked)} /> ⏱ Clock</label>
      {clockOn && (
        <span>
          <input type="number" min={0} value={baseMin} onChange={(e) => setBaseMin(Number(e.target.value))} style={{ width: '3.5em' }} /> min +{' '}
          <input type="number" min={0} value={incSec} onChange={(e) => setIncSec(Number(e.target.value))} style={{ width: '3.5em' }} /> s/turn
        </span>
      )}
      <button
        data-roomconfig-update
        disabled={!deck}
        onClick={() => {
          if (!deck) return
          onUpdate(deck, clockOn && baseMin > 0 ? { base: Math.round(baseMin * 60000), inc: Math.round(Math.max(0, incSec) * 1000) } : null)
          setMsg('Updated ✓')
        }}
      >
        Update
      </button>
      {msg && <span className="jp-hint">{msg}</span>}
    </div>
  )
}

/** the rematch deck-selection lobby (both agreed to play again): pick a deck and lock it in.
 *  Unlike RoomConfigControls this shows for BOTH seats and submits via net.rematchDeck. */
function RematchDeckSelect({ onPick }: { onPick: (deck: DeckList) => void }) {
  const decks = loadDecks()
  const [deckId, setDeckId] = useState(decks[0]?.id ?? '')
  const [locked, setLocked] = useState(false)
  const deck = decks.find((d) => d.id === deckId) ?? decks[0]
  if (locked) return <div className="roomconfig" data-rematch-deck><b>✔ Deck locked in — waiting for your opponent to choose…</b></div>
  return (
    <div className="roomconfig" data-rematch-deck>
      <b>Choose your deck for the rematch:</b>
      <label>
        Deck{' '}
        <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
          {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <button data-rematch-lockin disabled={!deck} onClick={() => { if (deck) { onPick(deck); setLocked(true) } }}>
        Lock in deck
      </button>
    </div>
  )
}

/** the post-game "play again?" prompt shown on the game-over screen. Self-contained countdown so
 *  it ticks without touching GameInner's state. Once THIS seat has voted yes it flips to a waiting
 *  indicator; both-yes is handled server-side (a rematchStart message then swaps the whole screen). */
function RematchPrompt({ deadline, you, opp, onVote }: { deadline: number; you: boolean; opp: boolean; onVote: (yes: boolean) => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id) }, [])
  const secs = Math.max(0, Math.ceil((deadline - now) / 1000))
  if (you) {
    return (
      <div className="rematch-offer" data-rematch-offer>
        <b>Rematch requested ✓</b>
        <span>{opp ? 'Starting a new game…' : `Waiting for your opponent… (${secs}s)`}</span>
      </div>
    )
  }
  return (
    <div className="rematch-offer" data-rematch-offer>
      <b>{opp ? '🔁 Your opponent wants a rematch!' : 'Play again?'}</b>
      <div className="rematch-btns">
        <button data-rematch-yes onClick={() => onVote(true)}>🔁 Rematch ({secs}s)</button>
        <button data-rematch-no onClick={() => onVote(false)}>No thanks</button>
      </div>
    </div>
  )
}

export default function Game({
  session,
  view,
  hotseatViewpoint,
  clockNow,
  clockAnchorAt,
  onSaveScenario,
  onGoBack,
  onLeave,
  onBrowse,
  mobile,
  botControl,
}: {
  session: Session
  view: PlayerView | null
  hotseatViewpoint: PlayerId | null
  clockNow?: number
  clockAnchorAt?: number
  onSaveScenario?: (name: string, isPublic: boolean) => Promise<void>
  onGoBack?: () => void
  onLeave: () => void
  /** leave the waiting room ON SCREEN but keep the online session alive in the background,
   *  so a player who created a room / is matchmaking can browse decks & the rest of the site
   *  while they wait for an opponent (App shows a "return to your game" banner). */
  onBrowse?: () => void
  mobile?: boolean
  botControl?: BotControl
}) {
  if (!view) {
    // rematch deck-selection lobby (both players agreed to play again)
    if (session.rematchLobby && session.rematchDeck) {
      return (
        <div className="waiting">
          <h2>Rematch! 🔁</h2>
          <p>Both players agreed to a rematch. Pick your deck to start a fresh game.</p>
          <RematchDeckSelect onPick={session.rematchDeck} />
          <div className="waitbtns"><button onClick={onLeave}>Leave</button></div>
        </div>
      )
    }
    return (
      <div className="waiting">
        <h2>Waiting for opponent…</h2>
        {session.roomCode && (
          <p>
            Room code: <b className="roomcode">{session.roomCode}</b> — share it with your opponent, or send the link:
            <br />
            <b className="roomcode">{`${location.origin}${location.pathname}`}</b>
            <button
              style={{ marginLeft: 8 }}
              onClick={() => { try { void navigator.clipboard?.writeText(`${location.origin}${location.pathname}`) } catch { /* clipboard blocked */ } }}
            >
              📋 Copy link
            </button>
          </p>
        )}
        {session.kind === 'online' && session.seat === 0 && session.updateRoom && (
          <RoomConfigControls onUpdate={session.updateRoom} />
        )}
        <div className="waitbtns">
          {onBrowse && <button onClick={onBrowse}>🔎 Browse while you wait</button>}
          <button onClick={onLeave}>Leave</button>
        </div>
      </div>
    )
  }
  return <GameInner session={session} view={view} hotseatViewpoint={hotseatViewpoint} clockNow={clockNow} clockAnchorAt={clockAnchorAt} onSaveScenario={onSaveScenario} onGoBack={onGoBack} onLeave={onLeave} mobile={mobile} botControl={botControl} />
}

// Mobile-only control for the vs-computer step/auto ("slow/fast") toggle, surfaced as two
// icon buttons on the left rail instead of the desktop bottom bar.
export interface BotControl {
  stepMode: boolean      // true = paused/step-through (slow); false = auto (fast)
  canAdvance: boolean    // the bot is waiting to act, so "next action" is meaningful
  onAuto: () => void     // resume automatic play (fast)
  onStep: () => void     // switch to step-through (slow)
  onNext: () => void     // advance one bot action while stepping
}

function GameInner({
  session,
  view,
  hotseatViewpoint,
  clockNow,
  clockAnchorAt,
  onSaveScenario,
  onGoBack,
  onLeave,
  mobile = false,
  botControl,
}: {
  session: Session
  view: PlayerView
  hotseatViewpoint: PlayerId | null
  clockNow?: number
  clockAnchorAt?: number
  onSaveScenario?: (name: string, isPublic: boolean) => Promise<void>
  onGoBack?: () => void
  onLeave: () => void
  mobile?: boolean
  botControl?: BotControl
}) {
  const [mode, setMode] = useState<Mode>({ m: 'idle' })
  const [routeHover, setRouteHover] = useState<Step[] | null>(null) // pathChoice: preview a route
  const [dirHover, setDirHover] = useState<string | null>(null) // direction picker: preview a direction's conveyor lane
  const [handOpen, setHandOpen] = useState(false) // mobile: the hand overlay is toggled over the board
  const [hover, setHover] = useState<string | null>(null)
  const [hoveredDefender, setHoveredDefender] = useState<string | null>(null) // combat: which defender option is hovered
  const [hoveredChoice, setHoveredChoice] = useState<number | null>(null) // move/attack menu: which option is hovered
  // a double-faced unit (flipped Druid, Vivien…) shows its BACK face in the detail panel
  // while hovered — track the hovered thing's flip so the panel matches the board.
  const [hoverFlip, setHoverFlip] = useState(false)
  // the hovered card's chosen alternative art (so the detail panel shows the same printing as the board)
  const [hoverArt, setHoverArt] = useState<string | undefined>(undefined)
  const showHover = (name: string | null, flipped = false, art?: string) => { setHover(name); setHoverFlip(!!flipped); setHoverArt(art) }
  // a card the opponent just played takes over the detail panel until you hover
  // something else (or they play another). Shown when you aren't actively hovering.
  const [oppPlay, setOppPlay] = useState<string | null>(null)
  // big center pop-ups when the opponent plays cards. They STACK (several can be up
  // at once when the opponent chains plays); each auto-dismisses after 3s (paused on
  // hover) or via its ▶ continue button. `n` (the play counter) keys each one.
  const [bigPops, setBigPops] = useState<{ name: string; n: number }[]>([])
  const lastPlayN = useRef(0)
  // opponent publicly revealed card(s) (Common Sense, Black Mass…) → a close-only popup that
  // lists them and links each to the detail panel. Fed from view.flow.reveals, de-duped by n.
  const [revealPops, setRevealPops] = useState<{ names: string[]; n: number }[]>([])
  const seenReveals = useRef<Set<number>>(new Set())
  // GUI convenience: after YOU (piloting a Savior) successfully cast a minion, offer to ward it
  // via the Savior's EXISTING "(1) → Ward a minion summoned this turn" ability. Queue of unit ids.
  const [saviorOffers, setSaviorOffers] = useState<string[]>([])
  const seenSavior = useRef<Set<string>>(new Set())
  const [mullSel, setMullSel] = useState<string[]>([])
  const [zoneView, setZoneView] = useState<{ pid: PlayerId; zone: 'cemetery' | 'banished' | 'collection' } | null>(null)
  const [barInfo, setBarInfo] = useState<PlayerId | null>(null) // expandable player detail popup (thresholds, zones…)
  const [confirmConcede, setConfirmConcede] = useState(false) // concede asks first (it ends the game)
  const [confirmKeep, setConfirmKeep] = useState(false) // keeping the opening hand asks first (mulligan doesn't)
  const [addTimeOpen, setAddTimeOpen] = useState(false) // gift-time-to-opponent chooser (click their clock)
  const [logsOpen, setLogsOpen] = useState(false) // mobile: the log is a toggleable overlay panel
  const zoneDrag = useDraggable() // the cemetery/banished/collection card viewer is draggable off the board
  const [subView, setSubView] = useState(false)
  const [showJudge, setShowJudge] = useState(false)
  const [editorAsked, setEditorAsked] = useState(false)
  const [showSymbols, setShowSymbols] = useState(false) // GUI symbol legend (Q / ❔ button)
  const [faqView, setFaqView] = useState(false) // FAQ view (F / 📖 button): greys the board, cards
  // with a FAQ get a golden border, hovering/tapping one shows its FAQ text (action panels off)
  // Subtype view (Z / 🏷 button): dims the board & hand, glows every unit/site/artifact/hand
  // card of the selected subtype. A top-of-board dropdown cycles the present subtypes.
  // Defaults to 'Spellcaster' (which includes avatars). Mutually exclusive with faqView.
  const [stView, setStView] = useState(false)
  const [stKey, setStKey] = useState('Spellcaster')
  const [stOpen, setStOpen] = useState(false) // dropdown expanded?
  // Which multi-square body (amoeba / Rack-stretched avatar) is hovered — its connective
  // tissue + copies rise above other minions while hovered or selected (see body overlay).
  const [bodyHover, setBodyHover] = useState<string | null>(null)
  const [rip, setRip] = useState<string | null>(null)
  // draggable mulligan modal — offset from its default (centered) position; null = centered
  const [mullPos, setMullPos] = useState<{ x: number; y: number } | null>(null)
  // Pathfinder easier-blaze (GUI-only): the void square the player clicked to lay a site into
  // (drives the yes/no confirm), and the square whose blaze `chooseSquare` prompt we auto-answer.
  const [blazeAsk, setBlazeAsk] = useState<{ unitId: string; x: number; y: number } | null>(null)
  const [blazePending, setBlazePending] = useState<{ x: number; y: number } | null>(null)
  // top-center log toasts: each appended log entry flashes briefly then fades out
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([])
  const lastLogLen = useRef(view.log.length)
  const toastSeq = useRef(0)
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  // responsive board scaling (mobile / narrow windows)
  const [boardScale, setBoardScale] = useState(1)
  // MOBILE: the whole game is laid out at a FIXED design size (see MOBILE_DESIGN) and then
  // uniformly scaled to fit the visible viewport — so NOTHING (board, rails, menu, hand
  // button, panel) can ever clip; extra space becomes letterbox padding. 1 = no scaling.
  const [uiScale, setUiScale] = useState(1)
  // DESKTOP: the canvas fills the whole viewport (no letterbox). Height is the fixed design
  // reference (DESKTOP_DESIGN_H) so the topbar/board/hand vertical layout never squishes; the
  // WIDTH is dynamic (designW) to match the viewport aspect, and the sidebar (1fr) absorbs it.
  const [designW, setDesignW] = useState(DESKTOP_DESIGN_W)
  const gameRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  // ---- board ZOOM (client-only; never synced/persisted — resets to 1 on reload) ----
  // A user-controlled magnifier on JUST the 20-site board canvas: the .boardviewport clips at the
  // FITTED size while its inner .boardzoom inflates to fit×zoom, so panning is native overflow-scroll
  // (no scrollbars at 1×). Every board overlay/hit-test derives its scale live from the board's own
  // getBoundingClientRect, so this extra transform folds in automatically — no coordinate-math changes.
  const ZOOM_MIN = 1, ZOOM_MAX = 4, ZOOM_STEP = 0.25, PAN_STEP = 90
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  const boardViewRef = useRef<HTMLDivElement>(null)
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
  // Anchor the scroll adjustment behind the zoom change: we can't set scrollLeft until the inner
  // .boardzoom has actually resized (React commit), so stash the pre-zoom scroll + anchor and apply
  // it in a layout effect keyed on `zoom` (runs after the DOM grows, so the browser clamps correctly).
  const pendingAnchor = useRef<{ z0: number; ax: number; ay: number; sl: number; stp: number } | null>(null)
  // The whole game sits inside a uiScale transform, so a client-space point/delta must be divided
  // by the viewport's on-screen scale (rendered width ÷ content width) to reach scrollLeft space.
  const viewScale = (v: HTMLDivElement) => (v.getBoundingClientRect().width / (v.clientWidth || 1)) || 1
  const applyZoom = useCallback((nz: number, anchor?: { x: number; y: number }) => {
    const v = boardViewRef.current
    const z0 = zoomRef.current
    const z1 = clampZoom(nz)
    if (z1 === z0) return
    if (v) {
      const rect = v.getBoundingClientRect()
      const s = viewScale(v)
      const ax = (anchor ? anchor.x - rect.left : rect.width / 2) / s
      const ay = (anchor ? anchor.y - rect.top : rect.height / 2) / s
      pendingAnchor.current = { z0, ax, ay, sl: v.scrollLeft, stp: v.scrollTop }
    }
    zoomRef.current = z1
    setZoom(z1)
  }, [])
  useLayoutEffect(() => {
    const p = pendingAnchor.current
    pendingAnchor.current = null
    const v = boardViewRef.current
    if (!p || !v) return
    const z1 = zoomRef.current
    v.scrollLeft = (p.sl + p.ax) / p.z0 * z1 - p.ax
    v.scrollTop = (p.stp + p.ay) / p.z0 * z1 - p.ay
  }, [zoom])
  const panBoard = useCallback((dx: number, dy: number) => {
    const v = boardViewRef.current
    if (!v) return
    v.scrollLeft += dx
    v.scrollTop += dy
  }, [])
  // ctrl/⌘ + wheel over the board = zoom toward the cursor (plain wheel keeps normal scrolling)
  useEffect(() => {
    const v = boardViewRef.current
    if (!v) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      applyZoom(zoomRef.current + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), { x: e.clientX, y: e.clientY })
    }
    v.addEventListener('wheel', onWheel, { passive: false })
    return () => v.removeEventListener('wheel', onWheel)
  }, [applyZoom])
  // mobile touch: two-finger pinch = zoom (anchored at the pinch midpoint); one-finger drag = pan
  // (only once zoomed in, and only past a small threshold so a tap still selects a square).
  useEffect(() => {
    const v = boardViewRef.current
    if (!v) return
    const TAP = 8
    const st: { mode: 'none' | 'maybepan' | 'pan' | 'pinch'; d0: number; z0: number; x0: number; y0: number; sl: number; stp: number } =
      { mode: 'none', d0: 0, z0: 1, x0: 0, y0: 0, sl: 0, stp: 0 }
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 })
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        st.mode = 'pinch'; st.d0 = dist(e.touches); st.z0 = zoomRef.current
        e.preventDefault()
      } else if (e.touches.length === 1) {
        st.mode = 'maybepan'; st.x0 = e.touches[0].clientX; st.y0 = e.touches[0].clientY
        st.sl = v.scrollLeft; st.stp = v.scrollTop
      }
    }
    const onMove = (e: TouchEvent) => {
      if (st.mode === 'pinch' && e.touches.length >= 2) {
        const m = mid(e.touches)
        applyZoom(st.z0 * (dist(e.touches) / (st.d0 || 1)), m)
        e.preventDefault()
      } else if ((st.mode === 'maybepan' || st.mode === 'pan') && e.touches.length === 1) {
        const dx = e.touches[0].clientX - st.x0, dy = e.touches[0].clientY - st.y0
        if (st.mode === 'maybepan' && Math.hypot(dx, dy) < TAP) return
        if (zoomRef.current <= 1) return // nothing to pan at standard zoom — leave it a tap
        st.mode = 'pan'
        const s = viewScale(v)
        v.scrollLeft = st.sl - dx / s
        v.scrollTop = st.stp - dy / s
        e.preventDefault()
      }
    }
    const onEnd = (e: TouchEvent) => { if (e.touches.length === 0) st.mode = 'none' }
    v.addEventListener('touchstart', onStart, { passive: false })
    v.addEventListener('touchmove', onMove, { passive: false })
    v.addEventListener('touchend', onEnd)
    return () => {
      v.removeEventListener('touchstart', onStart)
      v.removeEventListener('touchmove', onMove)
      v.removeEventListener('touchend', onEnd)
    }
  }, [applyZoom])
  // Connective tissue for multi-square bodies (amoeba / Rack-stretched avatar): each segment is
  // measured from the ACTUAL rendered card-chip centroids (which tile/shift when a square holds
  // other minions), not the geometric square centres. Recomputed after layout — see the effect.
  const [bodyLines, setBodyLines] = useState<{ key: string; ax: number; ay: number; bx: number; by: number; mine: boolean; z: number }[]>([])
  useEffect(() => {
    const boardW = GRID_W * (SQ_W + GAP)
    const boardH = GRID_H * (SQ_H + GAP)
    const fit = () => {
      if (mobile) {
        // Board fits inside the FIXED design box (constants match the .game.mobile CSS:
        // 866×400 canvas, 44px left menu, 240px right panel, 40px topbar). Since the whole
        // canvas is a constant size, boardScale is constant too — the outer uiScale does
        // the device fitting.
        const LEFT = 44 // left icon menu
        const TOP = 40
        const PAD = 8
        const panel = 240 // right card panel
        const availW = MOBILE_DESIGN_W - LEFT - panel - PAD
        const availH = MOBILE_DESIGN_H - TOP - PAD
        setBoardScale(Math.max(0.12, Math.min(availW / boardW, availH / boardH)))
        // Scale the ENTIRE fixed-size canvas to the visible viewport. Prefer the true
        // visible height (visualViewport) so the browser chrome bar can't cause a clip;
        // fall back to the parent box (the phone-frame simulator). Reserve a small gutter.
        const parent = gameRef.current?.parentElement
        const vv = window.visualViewport
        const simulated = !!parent && parent.classList.contains('mobile-sim')
        const availUW = (simulated ? parent!.clientWidth : (vv?.width ?? window.innerWidth)) - 12
        const availUH = (simulated ? parent!.clientHeight : (vv?.height ?? window.innerHeight)) - 12
        setUiScale(Math.max(0.1, Math.min(availUW / MOBILE_DESIGN_W, availUH / MOBILE_DESIGN_H)))
        return
      }
      // DESKTOP: fill the whole viewport with NO letterbox. Fix the design HEIGHT (so the
      // vertical layout is constant) and scale by vh/DESIGN_H; the canvas WIDTH is then dynamic
      // (designW) to exactly match the viewport aspect. The board column is pinned to the board's
      // own width (flush, no lateral padding) via the grid template, and the sidebar (1fr) grows
      // to fill the remaining width — a bigger log/preview on wider screens.
      const vv = window.visualViewport
      const vw = vv?.width ?? window.innerWidth
      const vh = vv?.height ?? window.innerHeight
      const scale = vh / DESKTOP_DESIGN_H // fill height exactly (uniform) → also fills width via designW
      const canvasW = vw / scale // logical width that fills the viewport horizontally
      setUiScale(scale)
      setDesignW(canvasW)
      // The board gets all the vertical space not taken by the topbar/bars/hand, and all the
      // horizontal space not taken by the left rail + a compact sidebar. It scales UP past its
      // natural size if there's room (no cap at 1) — the site art has plenty of resolution.
      const availH = DESKTOP_DESIGN_H - NONBOARD_V
      const availW = canvasW - RAIL_W - SIDEBAR_MIN - 2 * COL_GAP - SCROLLBAR_W - BOARD_SCROLL_GAP
      setBoardScale(Math.min(availW / boardW, availH / boardH))
    }
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    const vv = window.visualViewport
    vv?.addEventListener('resize', fit)
    vv?.addEventListener('scroll', fit)
    let ro: ResizeObserver | null = null
    if (mobile && typeof ResizeObserver !== 'undefined' && gameRef.current?.parentElement) {
      ro = new ResizeObserver(fit)
      ro.observe(gameRef.current.parentElement)
    }
    return () => {
      window.removeEventListener('resize', fit)
      window.removeEventListener('orientationchange', fit)
      vv?.removeEventListener('resize', fit)
      vv?.removeEventListener('scroll', fit)
      ro?.disconnect()
    }
  }, [mobile])

  // keep the module-level drag scale in sync so modal/mulligan drags track the finger 1:1
  // under the mobile canvas scale (see dragScale + useDraggable).
  useEffect(() => { dragScale.current = uiScale }, [uiScale])

  // Make prompt BANNERS and the floating minion/site/artifact ACTION menu draggable (PC and
  // mobile alike). Modals already drag by their header, but the board-targeting banners
  // (chooseTargets/chooseSquare/moveRegion/pathChoice/…) and the `.actionfloat` menu can sit
  // over a site, minion or artifact the player must click — so let them be shoved aside by
  // dragging anywhere on their background (buttons still tap through). One delegated
  // pointerdown on the game root covers every current & future such element (pointer events
  // → mouse + touch). Banners are centered via CSS translateX(-50%); the action menu is
  // absolutely placed via left/top, so its drag transform has no centering prefix.
  useEffect(() => {
    const root = gameRef.current
    if (!root) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      const el = t.closest?.('.promptbanner, .actionfloat') as HTMLElement | null
      if (!el) return
      if (t.closest('button, input, select, textarea, a, label, [role="button"]')) return // let controls tap
      // the action menu drags ONLY by its title (a <b>), so its scrollable body can pan freely
      if (el.classList.contains('actionfloat') && !t.closest('b')) return
      e.preventDefault()
      const centered = el.classList.contains('promptbanner')
      const s = dragScale.current || 1
      const startX = e.clientX, startY = e.clientY
      // the running offset lives in data-* so it accumulates across successive drags.
      const baseX = parseFloat(el.dataset.dragx || '0'), baseY = parseFloat(el.dataset.dragy || '0')
      const startTop = el.getBoundingClientRect().top
      const move = (ev: PointerEvent) => {
        const x = baseX + (ev.clientX - startX) / s
        const y = clampDragTop(el, startTop, baseY, baseY + (ev.clientY - startY) / s, s)
        el.dataset.dragx = String(x); el.dataset.dragy = String(y)
        el.style.transform = centered ? `translate(calc(-50% + ${x}px), ${y}px)` : `translate(${x}px, ${y}px)`
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    }
    root.addEventListener('pointerdown', onDown)
    return () => root.removeEventListener('pointerdown', onDown)
  }, [])

  // React reuses the .promptbanner DOM node across different prompts, so each NEW prompt must
  // start centered rather than inherit the previous drag offset (see the banner-drag effect).
  useEffect(() => {
    const banner = gameRef.current?.querySelector('.promptbanner') as HTMLElement | null
    if (banner) { banner.style.transform = ''; delete banner.dataset.dragx; delete banner.dataset.dragy }
  }, [mobile, mode.m, view.prompts[0]?.id])

  // Likewise the `.actionfloat` menu DOM node is reused as the selection changes; recompute
  // its left/top for the new entity and drop any leftover drag offset so it re-anchors there.
  useEffect(() => {
    const af = gameRef.current?.querySelector('.actionfloat') as HTMLElement | null
    if (af) { af.style.transform = ''; delete af.dataset.dragx; delete af.dataset.dragy }
  }, [mode.m, (mode as any).unitId, (mode as any).siteId, (mode as any).artifactId])

  // Measure the SELECTED minion's actual on-board rect (in board-content coordinates), so the
  // floating action panel spawns out of the MINION itself — not the square edge. Minions now sit
  // at varying spots inside a square (the tiled 1–6 layout), so we read the real DOM position and
  // undo the board's scale. useLayoutEffect → set before paint (no flash). Deps exclude the anchor
  // itself, so setting it never re-triggers this effect (no loop).
  const [unitAnchor, setUnitAnchor] = useState<{ left: number; right: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (mode.m !== 'unit') { setUnitAnchor(null); return }
    const board = gameRef.current?.querySelector('.board') as HTMLElement | null
    const el = gameRef.current?.querySelector(`[data-unit="${mode.unitId}"]`) as HTMLElement | null
    if (!board || !el) { setUnitAnchor(null); return }
    const br = board.getBoundingClientRect()
    const er = el.getBoundingClientRect()
    const boardW = GRID_W * (SQ_W + GAP)
    const scale = br.width / boardW || 1
    const next = { left: (er.left - br.left) / scale, right: (er.right - br.left) / scale, top: (er.top - br.top) / scale }
    setUnitAnchor((prev) => (prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.right - next.right) < 0.5 ? prev : next))
  }, [mode, view])

  // Place the move/attack ("moveChoice") banner UNDER the move/attack DESTINATION square, so it
  // reads as coming from where the unit is heading. The banner is position:fixed → screen coords.
  const [moveChoicePos, setMoveChoicePos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (mode.m !== 'moveChoice') { setMoveChoicePos(null); return }
    const attacker = view.units[mode.unitId]
    const last = mode.path.length ? mode.path[mode.path.length - 1] : (attacker ? { x: attacker.x, y: attacker.y } : null)
    const sq = last ? (gameRef.current?.querySelector(`[data-sq="${last.x},${last.y}"]`) as HTMLElement | null) : null
    if (!sq) { setMoveChoicePos(null); return }
    const r = sq.getBoundingClientRect()
    // below the square, unless that would run off the bottom of the screen → put it above instead
    const nearBottom = r.bottom > window.innerHeight - 90
    const next = { left: r.left + r.width / 2, top: nearBottom ? Math.max(8, r.top - 52) : r.bottom + 8 }
    setMoveChoicePos((prev) => (prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 ? prev : next))
  }, [mode, view])

  // Place the route picker ("pathChoice") banner UNDER the movement ARRIVAL square (mode.dest),
  // so it reads as coming from where the unit is heading — same treatment as moveChoice. It's a
  // .promptbanner, so the delegated drag handler already lets the player shove it aside.
  const [pathChoicePos, setPathChoicePos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const routeDest = mode.m === 'pathChoice' || mode.m === 'howMove' || mode.m === 'manualMove' ? mode.dest : null
    if (!routeDest) { setPathChoicePos(null); return }
    const sq = gameRef.current?.querySelector(`[data-sq="${routeDest.x},${routeDest.y}"]`) as HTMLElement | null
    if (!sq) { setPathChoicePos(null); return }
    const r = sq.getBoundingClientRect()
    const nearBottom = r.bottom > window.innerHeight - 90
    const next = { left: r.left + r.width / 2, top: nearBottom ? Math.max(8, r.top - 52) : r.bottom + 8 }
    setPathChoicePos((prev) => (prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 ? prev : next))
  }, [mode, view])

  // Spell-cast reveal: when a magic (or area-damage ability) resolves, the engine records it in
  // view.flow.areaReveal (synced to BOTH players): the caster (golden glow), the spell name, and
  // EITHER a numbered damage grid (multi-location damage) OR red-glowing affected sites (a single-
  // target spell). Full brightness 2s, fades over the next 3s. Keyed on `seq` → fires once.
  const [areaFx, setAreaFx] = useState<
    | { cells: { x: number; y: number; dmg: number }[]; redSites: { x: number; y: number }[]; element: string; name: string; casterId: string; caster: { x: number; y: number } | null; id: number }
    | null
  >(null)
  const areaFxSeen = useRef<number>(-1)
  const areaSeq = (view as any).flow?.areaReveal?.seq
  useEffect(() => {
    const rev = (view as any).flow?.areaReveal
    const seqNow = rev?.seq ?? 0
    if (seqNow < areaFxSeen.current) areaFxSeen.current = seqNow // UNDO re-arm (see moveFx)
    if (!rev || rev.seq === areaFxSeen.current) return
    areaFxSeen.current = rev.seq
    // one number per site (keep the largest)
    const byLoc = new Map<string, { x: number; y: number; dmg: number }>()
    for (const c of (rev.cells ?? []) as { x: number; y: number; dmg: number }[]) {
      const k = `${c.x},${c.y}`; const prev = byLoc.get(k)
      if (!prev || c.dmg > prev.dmg) byLoc.set(k, c)
    }
    const cells = [...byLoc.values()]
    const redSites = (rev.redSites ?? []) as { x: number; y: number }[]
    const cu = rev.casterId ? (view.units[rev.casterId] ?? (view.artifacts as any)?.[rev.casterId]) : null
    const caster = cu ? { x: cu.x, y: cu.y } : null
    // show for genuine multi-location damage, a single-target/summon spell that touched a site,
    // OR ANY magic cast / activated ability (the golden caster + writing always animate, even if
    // nothing was affected — an ability always lights its own caster site, see sealAbilityReveal)
    if (cells.length < 2 && redSites.length < 1 && !((rev.spell || rev.ability) && caster)) { setAreaFx(null); return }
    setAreaFx({ cells, redSites, element: rev.element ?? 'none', name: rev.name ?? '', casterId: rev.casterId ?? '', caster, id: rev.seq })
    const t = setTimeout(() => setAreaFx((cur) => (cur && cur.id === rev.seq ? null : cur)), 5000)
    return () => clearTimeout(t)
  }, [areaSeq])

  // Battle reveal: after a battle resolves the engine records flow.battleReveal (synced to BOTH
  // players) — the attacker-side + defender-side affected units (damage / died), the site, and the
  // battle log. Show a two-sided panel for 5s, skippable (click / Skip button).
  type BattleUnit = { name: string; died: boolean; dmg: number }
  const [battleFx, setBattleFx] = useState<{ site: string; attackers: BattleUnit[]; defenders: BattleUnit[]; logs: string[]; id: number } | null>(null)
  const battleFxSeen = useRef<number>(-1)
  const battleSeq = (view as any).flow?.battleReveal?.seq
  // A Move & Attack records BOTH the attacker's walk (moveAnim) and this battle in one state update. The
  // battle popup is a centred fixed panel that would cover the board the instant it opens — hiding the walk.
  // So if a walk just landed in this same update (a moveAnim newer than the move effect has consumed —
  // moveFxSeen, which the LATER move effect hasn't advanced yet), hold the popup until that walk finishes,
  // letting you SEE the courser walk up to its quarry before the battle resolves.
  useEffect(() => {
    const rev = (view as any).flow?.battleReveal
    // UNDO re-arm (see moveFx): undo rolls the battle seq back (or clears it); drop the watermark to match so
    // a re-done battle re-opens the panel instead of being treated as already-shown.
    const seqNow = rev?.seq ?? 0
    if (seqNow < battleFxSeen.current) battleFxSeen.current = seqNow
    if (!rev || rev.seq === battleFxSeen.current) return
    battleFxSeen.current = rev.seq
    const moves = ((view as any).flow?.moveAnim ?? []) as { squares: unknown[]; seq: number }[]
    const freshWalk = moves.filter((m) => m.seq > moveFxSeen.current)
    const walkMs = freshWalk.length ? Math.max(...freshWalk.map((m) => m.squares.length)) * DWELL : 0
    const show = () => {
      setBattleFx({ site: rev.site ?? '', attackers: rev.attackers ?? [], defenders: rev.defenders ?? [], logs: rev.logs ?? [], id: rev.seq })
      // auto-dismiss after 5s; no effect-cleanup clear so a following battle can't cancel this timer
      window.setTimeout(() => setBattleFx((cur) => (cur && cur.id === rev.seq ? null : cur)), 5000)
    }
    if (walkMs <= 0) show()
    else window.setTimeout(show, walkMs)
  }, [battleSeq])

  // Mana-gain floats: every time a source PROVIDES mana the engine appends to flow.manaGains
  // (seq-stamped, synced to both seats). Float a "+n ◆" over each source square for ~1s. A
  // start-of-turn burst appends many at once (all animate together); a single tap appends one.
  const [manaFx, setManaFx] = useState<{ x: number; y: number; amount: number; id: number }[]>([])
  const manaFxSeen = useRef<number>(0)
  const manaSeq = (view as any).flow?.manaGainSeq ?? 0
  useEffect(() => {
    if (manaSeq < manaFxSeen.current) manaFxSeen.current = manaSeq // UNDO re-arm (see moveFx)
    const gains = ((view as any).flow?.manaGains ?? []) as { x: number; y: number; amount: number; seq: number }[]
    const fresh = gains.filter((g) => g.seq > manaFxSeen.current)
    if (!fresh.length) return
    manaFxSeen.current = Math.max(manaFxSeen.current, ...gains.map((g) => g.seq))
    setManaFx((cur) => {
      const have = new Set(cur.map((f) => f.id))
      return [...cur, ...fresh.filter((g) => !have.has(g.seq)).map((g) => ({ x: g.x, y: g.y, amount: g.amount, id: g.seq }))]
    })
    const ids = new Set(fresh.map((g) => g.seq))
    setTimeout(() => setManaFx((cur) => cur.filter((f) => !ids.has(f.id))), 1000)
  }, [manaSeq])

  // Level-up floats: every time a source (The Immortal Throne) gains a level the engine appends
  // to flow.levelUps (seq-stamped, synced to both seats). Float a green "level n" over the source
  // square, rising and fading over ~3s. Same mechanism as the mana-gain floats above.
  const [levelFx, setLevelFx] = useState<{ x: number; y: number; level: number; id: number }[]>([])
  const levelFxSeen = useRef<number>(0)
  const levelSeq = (view as any).flow?.levelUpSeq ?? 0
  useEffect(() => {
    if (levelSeq < levelFxSeen.current) levelFxSeen.current = levelSeq // UNDO re-arm (see moveFx)
    const ups = ((view as any).flow?.levelUps ?? []) as { x: number; y: number; level: number; seq: number }[]
    const fresh = ups.filter((g) => g.seq > levelFxSeen.current)
    if (!fresh.length) return
    levelFxSeen.current = Math.max(levelFxSeen.current, ...ups.map((g) => g.seq))
    setLevelFx((cur) => {
      const have = new Set(cur.map((f) => f.id))
      return [...cur, ...fresh.filter((g) => !have.has(g.seq)).map((g) => ({ x: g.x, y: g.y, level: g.level, id: g.seq }))]
    })
    const ids = new Set(fresh.map((g) => g.seq))
    setTimeout(() => setLevelFx((cur) => cur.filter((f) => !ids.has(f.id))), 3000)
  }, [levelSeq])

  // Ticker floats: the Doomsday Device flashes a white-bordered black number over itself each time it
  // ticks down (engine appends to flow.ticks, seq-stamped + synced). Same mechanism as the level floats.
  const [tickFx, setTickFx] = useState<{ x: number; y: number; text: string; id: number }[]>([])
  const tickFxSeen = useRef<number>(0)
  const tickSeq = (view as any).flow?.tickSeq ?? 0
  useEffect(() => {
    if (tickSeq < tickFxSeen.current) tickFxSeen.current = tickSeq // UNDO re-arm (see moveFx)
    const ticks = ((view as any).flow?.ticks ?? []) as { x: number; y: number; text: string; seq: number }[]
    const fresh = ticks.filter((g) => g.seq > tickFxSeen.current)
    if (!fresh.length) return
    tickFxSeen.current = Math.max(tickFxSeen.current, ...ticks.map((g) => g.seq))
    setTickFx((cur) => {
      const have = new Set(cur.map((f) => f.id))
      return [...cur, ...fresh.filter((g) => !have.has(g.seq)).map((g) => ({ x: g.x, y: g.y, text: g.text, id: g.seq }))]
    })
    const ids = new Set(fresh.map((g) => g.seq))
    setTimeout(() => setTickFx((cur) => cur.filter((f) => !ids.has(f.id))), 2200)
  }, [tickSeq])

  // Rip animation: a big card tears in two centre-screen, shown to BOTH players (flow.rip, seq-stamped).
  const [ripFx, setRipFx] = useState<{ name: string; by: number; id: number } | null>(null)
  const ripFxSeen = useRef<number>(0)
  const ripSeq = (view as any).flow?.rip?.seq ?? 0
  useEffect(() => {
    if (ripSeq < ripFxSeen.current) ripFxSeen.current = ripSeq // UNDO re-arm (see moveFx)
    const rip = (view as any).flow?.rip as { name: string; by: number; seq: number } | undefined
    if (!rip || rip.seq <= ripFxSeen.current) return
    ripFxSeen.current = rip.seq
    setRipFx({ name: rip.name, by: rip.by, id: rip.seq })
    const t = setTimeout(() => setRipFx((cur) => (cur && cur.id === rip.seq ? null : cur)), 3000)
    return () => clearTimeout(t)
  }, [ripSeq])

  // Step-wise movement: the engine records each multi-step walk (flow.moveAnim, seq-stamped). A floating
  // chip visits each square it passed through, dwelling ~0.5s in each, while the real chip is hidden from
  // the board (movingUnitIds) so the unit appears to actually walk its route. DWELL is module-scoped.
  const [moveFx, setMoveFx] = useState<{ id: number; unitId: string; name: string; squares: { x: number; y: number }[]; idx: number }[]>([])
  const moveFxSeen = useRef<number>((view as any).flow?.moveSeq ?? 0) // catch up on mount → never replay a backlog
  // Each walk's step timers live in a ref and are cleared ONLY on unmount — never in an effect cleanup.
  // (If they were cleaned when this effect re-runs, the very next move — the opponent's reply, the bot's
  // turn, your next move — would cancel the still-animating walk's timers, freezing it at its start square.
  // That was the "movement rarely animates" bug: only the last move of any burst survived.)
  const moveTimers = useRef<number[]>([])
  useEffect(() => () => { moveTimers.current.forEach(clearTimeout); moveTimers.current = [] }, [])
  const moveSeq = (view as any).flow?.moveSeq ?? 0
  useEffect(() => {
    // UNDO re-arm: undo restores the pre-move state, so flow.moveSeq rolls BACKWARDS. Our "already animated"
    // watermark only moves up, so a re-done move (same seq as before) would be rejected as stale and never
    // animate. Whenever the seq is below the watermark, a rollback happened → drop the watermark to match so
    // the redo counts as fresh. (Same class of bug the battle popup had to fight; fixed uniformly below.)
    if (moveSeq < moveFxSeen.current) moveFxSeen.current = moveSeq
    const moves = ((view as any).flow?.moveAnim ?? []) as { unitId: string; name: string; squares: { x: number; y: number }[]; seq: number }[]
    const fresh = moves.filter((m) => m.seq > moveFxSeen.current)
    if (!fresh.length) return
    moveFxSeen.current = Math.max(moveFxSeen.current, ...moves.map((m) => m.seq))
    for (const m of fresh) {
      const total = m.squares.length
      setMoveFx((cur) => (cur.some((f) => f.id === m.seq) ? cur : [...cur, { id: m.seq, unitId: m.unitId, name: m.name, squares: m.squares, idx: 0 }]))
      for (let i = 1; i < total; i++) moveTimers.current.push(window.setTimeout(() => setMoveFx((cur) => cur.map((f) => (f.id === m.seq ? { ...f, idx: i } : f))), i * DWELL))
      moveTimers.current.push(window.setTimeout(() => setMoveFx((cur) => cur.filter((f) => f.id !== m.seq)), total * DWELL))
    }
  }, [moveSeq])
  const movingUnitIds = new Set(moveFx.map((f) => f.unitId))

  // Death / removal AND teleport-out are drawn AS UNITS in their own tile — not as a full-square overlay —
  // so the fade/zap is exactly the size and slot the card occupied, and the surviving cards do NOT reflow
  // until the animation ends. Both need the PREVIOUS frame's raw unit list (a dead card is gone from
  // view.units; a teleported one has already moved to its destination), so they share one diff pass.
  //  _slot = the card's index among the same-square cards last frame → we splice the ghost back into that
  //  exact position (see unitsBySquare), so nothing shifts.
  const [deathGhosts, setDeathGhosts] = useState<AnimUnit[]>([])
  const [teleGhosts, setTeleGhosts] = useState<AnimUnit[]>([])
  const prevUnitsRef = useRef<UnitState[]>([])
  const teleGhostSeen = useRef<number>((view as any).flow?.teleSeq ?? 0)
  const deathMoveSeen = useRef<number>((view as any).flow?.moveSeq ?? 0)
  const slotOf = (arr: UnitState[], id: string, x: number, y: number) =>
    Math.max(0, arr.filter((p) => p.x === x && p.y === y).findIndex((p) => p.id === id))
  useEffect(() => {
    const prev = prevUnitsRef.current
    // Track avatars too (so an avatar Blink/Teleport can zap out — the tele lookup below finds it); the
    // DEATH diff still excludes avatars (an avatar leaving = game over, handled elsewhere), only `!u.size`.
    const cur = (Object.values(view.units) as UnitState[]).filter((u) => !u.size)
    const curIds = new Set(cur.map((u) => u.id))
    // deaths: any non-avatar card present last frame but gone now (kills, bounces, banishes, sacrifices…).
    // If the dead card ALSO just walked (a Move & Attack that got it killed), its fade must play at the
    // walk's DESTINATION, AFTER the walk finishes — not at its origin the instant it dies, which would show
    // the card dying where it started while a ghost walks away from it. Everything else fades in place now.
    const moves = ((view as any).flow?.moveAnim ?? []) as { unitId: string; name: string; squares: { x: number; y: number; region?: string }[]; seq: number }[]
    // UNDO re-arm (see moveFx): a rolled-back seq must reset the watermark so a redo re-fires.
    const moveSeqNow = (view as any).flow?.moveSeq ?? 0
    if (moveSeqNow < deathMoveSeen.current) deathMoveSeen.current = moveSeqNow
    const teleSeqNow = (view as any).flow?.teleSeq ?? 0
    if (teleSeqNow < teleGhostSeen.current) teleGhostSeen.current = teleSeqNow
    const moveBaseline = deathMoveSeen.current // capture BEFORE advancing, else the just-recorded walk isn't "fresh"
    if (moves.length) deathMoveSeen.current = Math.max(deathMoveSeen.current, ...moves.map((m) => m.seq))
    const freshMoveOf = (id: string) => moves.find((m) => m.unitId === id && m.seq > moveBaseline && m.squares.length > 1)
    const deadStill: AnimUnit[] = []
    const deadWalkers: { ghost: AnimUnit; delay: number }[] = []
    for (const u of prev.filter((p) => !curIds.has(p.id) && !p.isAvatar)) {
      const fm = freshMoveOf(u.id)
      if (fm) {
        const last = fm.squares[fm.squares.length - 1]
        deadWalkers.push({ ghost: { ...u, x: last.x, y: last.y, region: (last.region as any) ?? u.region, _anim: 'death', _slot: 0, _gid: u.id }, delay: fm.squares.length * DWELL })
      } else {
        deadStill.push({ ...u, _anim: 'death', _slot: slotOf(prev, u.id, u.x, u.y), _gid: u.id })
      }
    }
    // teleports: the engine seq-stamps each blink/swap; snapshot the card at its SOURCE (from prev) so it
    // zaps out where it left, while the real card is already drawn at the destination.
    const teles = ((view as any).flow?.teleportAnim ?? []) as { unitId: string; name: string; from: { x: number; y: number }; to: { x: number; y: number }; seq: number }[]
    const freshT = teles.filter((t) => t.seq > teleGhostSeen.current)
    if (freshT.length) teleGhostSeen.current = Math.max(teleGhostSeen.current, ...teles.map((t) => t.seq))
    const zapped = freshT.map<AnimUnit | null>((t) => {
      const src = prev.find((p) => p.id === t.unitId)
      if (!src) return null
      return { ...src, x: t.from.x, y: t.from.y, _anim: 'teleout', _slot: slotOf(prev, t.unitId, t.from.x, t.from.y), _gid: t.seq }
    }).filter((g): g is AnimUnit => !!g)
    prevUnitsRef.current = cur
    if (deadStill.length) {
      setDeathGhosts((g) => [...g, ...deadStill])
      const ids = new Set(deadStill.map((s) => s._gid))
      window.setTimeout(() => setDeathGhosts((g) => g.filter((d) => !ids.has(d._gid))), 2800)
    }
    for (const { ghost, delay } of deadWalkers) {
      window.setTimeout(() => {
        setDeathGhosts((g) => [...g, ghost])
        window.setTimeout(() => setDeathGhosts((g) => g.filter((d) => d._gid !== ghost._gid)), 2800)
      }, delay)
    }
    if (zapped.length) {
      setTeleGhosts((g) => [...g, ...zapped])
      const ids = new Set(zapped.map((s) => s._gid))
      window.setTimeout(() => setTeleGhosts((g) => g.filter((d) => !ids.has(d._gid))), 600)
    }
  }, [view])

  // Teleport: a genuine blink/swap (engine records flow.teleportAnim, seq-stamped) zaps the card out of
  // its old square and glows the DESTINATION square for 2s (an outward glow — the site's z is untouched).
  const [teleFx, setTeleFx] = useState<{ id: number; name: string; from: { x: number; y: number }; to: { x: number; y: number } }[]>([])
  const teleFxSeen = useRef<number>((view as any).flow?.teleSeq ?? 0)
  const teleSeq = (view as any).flow?.teleSeq ?? 0
  useEffect(() => {
    if (teleSeq < teleFxSeen.current) teleFxSeen.current = teleSeq // UNDO re-arm (see moveFx)
    const teles = ((view as any).flow?.teleportAnim ?? []) as { name: string; from: { x: number; y: number }; to: { x: number; y: number }; seq: number }[]
    const fresh = teles.filter((t) => t.seq > teleFxSeen.current)
    if (!fresh.length) return
    teleFxSeen.current = Math.max(teleFxSeen.current, ...teles.map((t) => t.seq))
    const spawned = fresh.map((t) => ({ id: t.seq, name: t.name, from: t.from, to: t.to }))
    setTeleFx((cur) => [...cur, ...spawned.filter((s) => !cur.some((c) => c.id === s.id))])
    const ids = new Set(spawned.map((s) => s.id))
    // no effect-cleanup clear: a later teleport must not cancel this glow's removal (same freeze bug as moveFx)
    window.setTimeout(() => setTeleFx((cur) => cur.filter((f) => !ids.has(f.id))), 2000)
  }, [teleSeq])

  // Pre-game "VS" splash: a big <P1> vs <P2> intro with both avatars + names, shown once as the
  // game opens (turn 1). Auto-dismisses after ~4s; click / tap to skip. Full-screen on mobile.
  const [introVs, setIntroVs] = useState(view.turn <= 1 && view.phase !== 'over')
  useEffect(() => {
    if (!introVs) return
    const t = setTimeout(() => setIntroVs(false), 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // play the rip animation when any player rips a card (detected via the log)
  const lastLog = view.log[view.log.length - 1]?.msg ?? ''
  useEffect(() => {
    const m = lastLog.match(/✂ .* rips (.+) to pieces/)
    if (m) {
      setRip(m[1])
      const id = setTimeout(() => setRip(null), 1500)
      return () => clearTimeout(id)
    }
  }, [lastLog])

  // top-center toasts: every newly-appended log entry flashes for ~1s then fades.
  // Compare against the last-seen length so re-renders don't re-enqueue old lines.
  useEffect(() => {
    const len = view.log.length
    if (len > lastLogLen.current) {
      const fresh = view.log.slice(lastLogLen.current).map((e) => e.msg)
      const added = fresh.map((msg) => ({ id: toastSeq.current++, msg }))
      setToasts((prev) => [...prev, ...added])
      for (const t of added) {
        const timer = setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3000)
        toastTimers.current.push(timer)
      }
    }
    lastLogLen.current = len
  }, [view.log.length])

  // clear any pending toast timers on unmount
  useEffect(() => () => { for (const t of toastTimers.current) clearTimeout(t) }, [])

  // The seat whose BOARD this client shows (the seat it is currently piloting). Under
  // Courtesan Thaïs this flips to the controlled seat so you see the hand you must play:
  //  • online — the server sends you `viewFor(viewSeatFor(seat))`, so follow `view.you`;
  //  • hotseat/vs-bot — App passes the local display seat via the `hotseatViewpoint` prop
  //    (hotseatViewpoint / botDisplaySeat). Normally this is just your own seat.
  const me: PlayerId =
    session.kind === 'online' ? (view.you ?? session.seat ?? 0)
    : (hotseatViewpoint ?? session.seat ?? 0)
  // The seat AUTHORISED to act — act-permission (promptIsMine/myTurn) is keyed on this,
  // so the pilot can act while the board shows the controlled seat, and a benched player
  // cannot. Online/vs-bot have a fixed human seat (session.seat); hotseat has no fixed
  // seat, so the actor for the shown decision is derived via actingSeatFor.
  const realSeat: PlayerId =
    session.kind === 'hotseat' ? actingSeatFor(view as any, me) : (session.seat ?? me)

  // when the OPPONENT plays a card, pull it into the detail panel and drop any
  // stale hover so it truly takes over. `n` is a monotonic engine counter, so we
  // only react to a fresh play (not to every re-render).
  const lp = view.lastPlay
  useEffect(() => {
    if (lp && lp.n !== lastPlayN.current) {
      lastPlayN.current = lp.n
      if (lp.player !== me) {
        setOppPlay(lp.name); showHover(null)
        // Every card the opponent PLAYS gets the big pop-up (minions, sites,
        // artifacts, auras AND magics — magics especially). `lastPlay` is set only
        // by casting/playing a card, never by attacks / moves / activated abilities,
        // so those are naturally excluded.
        setBigPops((prev) => [...prev, { name: lp.name, n: lp.n }].slice(-4)) // keep up to 4 stacked
      }
    }
  }, [lp, me])
  // hovering any card ends the takeover — after you move away the panel clears
  // rather than snapping back to the opponent's card.
  useEffect(() => { if (hover) setOppPlay(null) }, [hover])
  const isSpectator = session.kind === 'online' && session.seat === null
  const st = view as any // engine helpers accept the view (realm data is complete)
  // chess clock display: seat currently on the clock + per-seat remaining ms.
  // Online, the authoritative `remaining` only lands on broadcasts, so extrapolate
  // the running seat down since the last one; locally the ticker keeps it current.
  const clockRunSeat = view.clock ? runningSeat(st) : null
  const clockShown: [number, number] | null = view.clock
    ? (() => {
        const r: [number, number] = [view.clock.remaining[0], view.clock.remaining[1]]
        if (clockRunSeat !== null && session.kind === 'online') {
          const elapsed = Math.max(0, (clockNow || Date.now()) - (clockAnchorAt || 0))
          r[clockRunSeat] = Math.max(0, r[clockRunSeat] - elapsed)
        }
        return r
      })()
    : null
  const myPlayer = view.players[me]
  const opp = view.players[1 - me]
  const prompt = view.prompts[0] ?? null
  // Courtesan Thaïs can hand a seat's decisions to the other player for a turn
  const promptIsMine = !!prompt && actingSeatFor(st, prompt.player) === realSeat
  // Combat glows — shared by the DEFEND prompt and the move/attack base menu (moveChoice):
  //  • defend: the attack TARGET glows gold (biggest); the ATTACKER glows red; each DEFENDER candidate
  //    glows gold, brighter ("-hot") while its option is hovered.
  //  • move/attack menu: the MOVER glows red; every attackable target (a unit, a same-name group, or a
  //    site) glows gold, brighter while its option is hovered. (The pickTargetUnit follow-up is exempt.)
  type GlowRole = 'target' | 'defender' | 'defender-hot' | 'attacker' | 'atk'
  const combatGlow: { units: Map<string, GlowRole>; sites: Map<string, GlowRole> } | null = (() => {
    if (prompt?.kind === 'defend' && promptIsMine) {
      const units = new Map<string, GlowRole>(); const sites = new Map<string, GlowRole>()
      const d = prompt.data ?? {}
      if (d.attackerId) units.set(d.attackerId, 'attacker')
      if (d.target?.unit) units.set(d.target.unit, 'target')
      if (d.target?.site) sites.set(d.target.site, 'target')
      for (const id of (d.candidates ?? []) as string[]) if (!units.has(id)) units.set(id, id === hoveredDefender ? 'defender-hot' : 'defender')
      return { units, sites }
    }
    if (mode.m === 'moveChoice') {
      const units = new Map<string, GlowRole>(); const sites = new Map<string, GlowRole>()
      units.set(mode.unitId, 'attacker') // the mover IS the attacker
      mode.choices.forEach((c, i) => {
        const hot = i === hoveredChoice
        const uids = c.pick ?? (c.attack && 'unit' in c.attack ? [c.attack.unit] : [])
        for (const id of uids) { if (units.get(id) === 'attacker') continue; if (hot || units.get(id) !== 'defender-hot') units.set(id, hot ? 'defender-hot' : 'defender') }
        if (c.attack && 'site' in c.attack) { const sid = c.attack.site; if (hot || sites.get(sid) !== 'defender-hot') sites.set(sid, hot ? 'defender-hot' : 'defender') }
      })
      return { units, sites }
    }
    if (mode.m === 'pickTargetUnit') {
      // the "pick which same-name enemy to attack" follow-up: mover red, each candidate glows gold
      const units = new Map<string, GlowRole>(); const sites = new Map<string, GlowRole>()
      units.set(mode.unitId, 'attacker')
      for (const id of mode.candidates) if (units.get(id) !== 'attacker') units.set(id, 'defender')
      return { units, sites }
    }
    // just SELECTED one of my own units (untapped, not summoning-sick / disabled): glow every enemy it
    // can strike WITHOUT moving — i.e. an enemy its footprint already covers here — so same-square attack
    // targets are obvious. UnitChip turns 'atk' into an "⚔ Attack <name>" hover tooltip.
    if (mode.m === 'unit') {
      const u = view.units[mode.unitId]
      if (u && canMoveAttack(u)) {
        const units = new Map<string, GlowRole>(); const sites = new Map<string, GlowRole>()
        const airborneMe = (() => { try { return !!effKeywords(st, u).airborne } catch { return false } })()
        for (const e of Object.values(view.units) as UnitState[]) {
          if (e.controller === me || e.carriedBy) continue
          const covered = footprintAt(u, { x: u.x, y: u.y }).some((c) => occupies(e, c.x, c.y, u.region)) || occupies(u, e.x, e.y, e.region)
          if (!covered) continue
          // Airborne enemies can only be struck by an Airborne attacker — don't dangle a false target.
          try { if (effKeywords(st, e).airborne && !airborneMe) continue } catch { /* ignore */ }
          units.set(e.id, 'atk')
        }
        if (units.size) return { units, sites }
      }
    }
    return null
  })()
  const unitGlow = (id: string): GlowRole | undefined => combatGlow?.units.get(id)
  // A glowing SITE is lit on its SQUARE (like movement targets) — an OUTWARD glow that the square's
  // overflow:hidden doesn't clip and that never lifts the site above the minions standing on it.
  // Covers both the defend prompt (target site) and the move/attack menu (attackable sites).
  const combatSiteHl = new Map<string, string>()
  if (combatGlow) for (const [sid, role] of combatGlow.sites) {
    const s = (view.sites as any)[sid]
    if (s) combatSiteHl.set(`${s.x},${s.y}`, role === 'target' ? 'hl-attack-target' : role === 'defender-hot' ? 'hl-attack-hot' : 'hl-attack-cand')
  }
  // Aura interaction context — shared by BOTH the per-square render (single-square auras like Wildfire,
  // shown small in the artifact strip) and the overlay render (2x2 area auras). Hoisted here so a
  // single-square aura is just as clickable — for Enchantress "animate target aura" targeting and for
  // Editor board-selection — as a full-size one.
  const auraSelect = !!(prompt && promptIsMine && prompt.kind === 'chooseTargets' && (prompt.data?.kind === 'aura' || prompt.data?.kind === 'unitOrAura'))
  const auraCands = new Set<string>(auraSelect ? ((prompt!.data?.candidates ?? []) as string[]) : [])
  const selectAura = (id: string) => send({ t: 'prompt', promptId: prompt!.id, choice: [id] })
  const auraEdit = showJudge && !auraSelect && mode.m !== 'judgePlace'
  const selectAuraEdit = (id: string) => setMode(mode.m === 'editAura' && mode.auraId === id ? { m: 'idle' } : { m: 'editAura', auraId: id })
  // an aura is also a live target while a spell/ability targets minion/artifact/aura (Displace):
  // clicking it picks it as that target. targetIds already holds the legal aura ids (see the memo).
  const auraMagicPick = (id: string) => (mode.m === 'magic' || mode.m === 'abilityTargets') && !!targetIds?.has(id)
  // direction-picker conveyor. Two sources feed it:
  //  (A) an engine cardinal-direction PROMPT (Snowball) — the engine attaches each direction's
  //      reachable lane (`data.dirs`, surface sites until a void) + the spell element (`data.element`).
  //  (B) the client `shoot` MODE (Ranged unit / directional spell cast) — we walk the lane out to
  //      the shooter's range and colour it by the unit's / spell's element.
  // Each lane cell PAST the source maps to {dir, idx} so the board draws chevrons flowing outward to
  // the farthest reachable site; the hovered direction's lane brightens.
  const belt = useMemo(() => {
    const cells = new Map<string, { dir: string; idx: number }>()
    const add = (dir: string, lane: { x: number; y: number }[]) => {
      for (let i = 1; i < lane.length; i++) cells.set(`${lane[i].x},${lane[i].y}`, { dir, idx: i - 1 })
    }
    // (A) engine cardinal prompt
    if (prompt?.kind === 'chooseOption' && promptIsMine && isCardinalOptions(prompt.data?.options ?? []) && prompt.data?.dirs) {
      const dirs = prompt.data.dirs as Record<string, { x: number; y: number }[]>
      for (const dir of ['n', 's', 'e', 'w']) add(dir, dirs[dir] ?? [])
      return { cells, color: elementColor(prompt.data.element), from: (prompt.data.from ?? null) as { x: number; y: number } | null }
    }
    // (B) shoot mode — a Ranged unit, or a directional spell cast (mode.unitId is then a card id)
    if (mode.m === 'shoot') {
      const isCard = mode.unitId.startsWith('c')
      const src = isCard ? view.units[mode.casterId ?? myPlayer.avatarUnitId] : view.units[mode.unitId]
      if (src) {
        const name = isCard ? view.cards[mode.unitId]?.name : src.name
        // a Ranged unit reaches only `ranged` squares; a projectile spell flies until it's stopped
        const range = isCard ? Infinity : (() => { try { return effKeywords(st, src).ranged ?? 1 } catch { return 1 } })()
        const lanes = directionReach(st, src.x, src.y) // site-following, stops at void + projectile blockers
        for (const dir of ['n', 's', 'e', 'w'] as const) add(dir, lanes[dir].slice(0, range + 1)) // cap at range (index 0 = source)
        return { cells, color: elementColor(getCard(name ?? '')?.elements), from: { x: src.x, y: src.y } as { x: number; y: number } | null }
      }
    }
    return { cells, color: '#8ad6c8', from: null as { x: number; y: number } | null }
  }, [prompt, promptIsMine, mode, view, st, myPlayer.avatarUnitId])
  useEffect(() => { setDirHover(null); setHoveredDefender(null); setHoveredChoice(null) }, [prompt?.id, mode.m]) // reset hovered direction/defender/choice when the prompt/mode changes
  // Spawn the direction-picker panel one step DIAGONALLY off the belt's origin square — in the
  // gap between the N/S/E/W arrows, so it sits close to the source without covering any lane. NE by
  // default; SW instead when the origin is too near the top/right edge for the panel to fit. Only
  // its position moves (measured in screen px, exactly like the route-picker banner).
  // ===== direction-picker panel offset — TUNE THESE TWO NUMBERS =====
  // Canvas-local px (canvas is 1600×900). The panel's CENTRE is placed at the projectile origin
  // square's centre plus this shift. +X = right, +Y = down (so a negative Y raises it).
  const DIR_PANEL_DX = 400
  const DIR_PANEL_DY = -130
  const DIR_PANEL_BL_DX = -50 // horizontal shift when flipped to the bottom-left (top row / right col)
  const [dirPanelPos, setDirPanelPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const from = belt.from // the ORIGIN (projectile start) square, in board coords
    const root = gameRef.current
    const sq = from && root ? (root.querySelector(`[data-sq="${from.x},${from.y}"]`) as HTMLElement | null) : null
    if (!from || !sq || !root) { setDirPanelPos(null); return }
    // the modal is position:fixed INSIDE the transform-scaled game canvas, so its left/top live in
    // the canvas's local design space. Convert the origin square's screen centre into that space.
    const cRect = root.getBoundingClientRect()
    const scale = cRect.width / (mobile ? 866 : 1600) || 1
    const r = sq.getBoundingClientRect()
    const originX = (r.left + r.width / 2 - cRect.left) / scale
    const originY = (r.top + r.height / 2 - cRect.top) / scale
    // top-right by default; but if the origin sits in the SCREEN top row or rightmost column, the
    // up-and-right panel would run off the board — so flip to bottom-left (same magnitudes negated).
    const isFlip = me === 1
    const inTopRow = isFlip ? from.y === 0 : from.y === GRID_H - 1
    const inRightCol = isFlip ? from.x === 0 : from.x === GRID_W - 1
    const bl = inTopRow || inRightCol
    const next = { left: originX + (bl ? DIR_PANEL_BL_DX : DIR_PANEL_DX), top: originY + (bl ? -DIR_PANEL_DY : DIR_PANEL_DY) }
    setDirPanelPos((prev) => (prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 ? prev : next))
  }, [belt, mode, view, mobile])
  // Pathfinder easier-blaze: when its `blaze` ability is available (untapped, atlas non-empty,
  // your unit) its adjacent BUILDABLE squares — a bare VOID or a RUBBLE it can build over —
  // become "lay a site here" targets in the move step, as if it had a 1-step Voidwalk. Clicking
  // one confirms, then fires the EXISTING blaze ability. Only orthogonally-adjacent spots qualify
  // (Magellan-wrap aware, exactly the engine's own blaze target set), so a movement bonus never
  // extends the reach. (An intact site is never a target — one site per square.)
  const pathfinderBlazeSpots = (u: UnitState | undefined): { x: number; y: number }[] => {
    if (!u || u.controller !== me) return []
    if (!getScript(u.name)?.abilities?.some((a) => a.key === 'blaze')) return []
    if (myPlayer.atlasCount <= 0) return [] // blaze taps BEFORE it checks the atlas — don't tap for nothing
    if (canActivate(st, me, u.id, 'blaze') !== null) return [] // untapped, not disabled/silenced, your unit
    return orthAdjacentWrapped(st, u.x, u.y).filter((s) => {
      const site = siteAt(st, s.x, s.y)
      return !site || site.isRubble
    })
  }
  // overlay every square with its coordinate whenever the UI refers to squares by "(x,y)":
  // the route picker (pathChoice / moveChoice show coords in their labels) or a prompt title
  // show the per-square coordinate overlay while routing, or whenever a prompt names a square in the
  // chess-style notation (a1–e4) so the player can find it on the board.
  const showCoords = mode.m === 'pathChoice' || mode.m === 'moveChoice' || /\b[a-e][1-4]\b/.test(String(prompt?.title ?? ''))
  // colours shared by the route-picker arrows (on the board) and their panel buttons
  const PATH_PALETTE = ['#7fd18a', '#ffcf56', '#b98cff', '#ff9a6b', '#6bd0ff', '#ff7ac0']
  // a "peeked" card (Seer / the Rivers / Riddle Sphinx) is mirrored into the lateral
  // detail panel while its keep/bottom prompt is up (it's also shown in the prompt).
  const revealName: string | undefined = promptIsMine ? prompt?.data?.reveal : undefined
  useEffect(() => { if (revealName) { setOppPlay(revealName); showHover(null) } }, [revealName])
  // Pathfinder easier-blaze: once the confirm fired the `blaze` ability, the engine raises its
  // own `chooseSquare` prompt — answer it automatically with the square the player picked. Runs
  // off the synced prompt (not a chained send) so it resolves the same in hotseat and online.
  useEffect(() => {
    if (!blazePending) return
    if (prompt?.kind === 'chooseSquare' && promptIsMine &&
        (prompt.data?.squares as { x: number; y: number }[] | undefined)?.some((s) => s.x === blazePending.x && s.y === blazePending.y)) {
      send({ t: 'prompt', promptId: prompt.id, choice: { x: blazePending.x, y: blazePending.y } })
      setBlazePending(null)
    }
  }, [blazePending, prompt, promptIsMine])
  // your OPPONENT revealed card(s) publicly — pop a close-only notice listing them (each links
  // to the detail panel). Only reveals BY the other player, each shown once (de-duped by n).
  useEffect(() => {
    const revs: { by: PlayerId; names: string[]; n: number }[] = (st as any).flow?.reveals ?? []
    const fresh = revs.filter((r) => r.by !== me && !seenReveals.current.has(r.n))
    if (!fresh.length) return
    fresh.forEach((r) => seenReveals.current.add(r.n))
    setRevealPops((prev) => [...prev, ...fresh.map((r) => ({ names: r.names, n: r.n }))].slice(-4))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, me])

  // ---- keyboard hotkeys (left-hand / WASD cluster) ----
  //   W  skip a card popup        D  step the computer's turn      S  toggle subsurface view
  //   A  your collection          C  your cemetery                X  opponent's cemetery
  //   E  editor (open / close / request)   Backspace  undo (or undo request)   Q  symbol legend
  //   Enter  confirm the current action (clicks the on-screen [data-confirm] button)
  // Each zone/subsurface/panel key is a TOGGLE (same key opens & closes). Ignored while typing in
  // a field or when a browser chord (Ctrl/Cmd/Alt) is held. A live ref feeds the once-attached
  // listener the current callbacks + popup counts without re-subscribing each render.
  const editorHotkey = () => {
    if (isSpectator || view.phase === 'over') return
    if (session.kind === 'online' && !session.editorAllowed) { session.requestEditor?.(); setEditorAsked(true) }
    else setShowJudge((v) => !v)
  }
  const undoHotkey = () => { if (!isSpectator && view.phase !== 'over') session.requestUndo?.() }
  // subtypes currently present (board + hand), in display order — drives both the
  // dropdown and the ‹ › cycle (which only steps through views that have a match).
  const stPresent = useMemo(() => presentViews(st, me, view), [st, me, view])
  const stKeys = stPresent.map((p) => p.key)
  const stCount = stPresent.find((p) => p.key === stKey)?.count ?? 0
  // the two board overlays (FAQ / Subtype) are mutually exclusive — turning one on clears the other
  const toggleFaq = () => setFaqView((v) => { if (!v) { setStView(false); setStOpen(false) } return !v })
  const toggleSubtype = () => setStView((v) => {
    if (!v) { setFaqView(false); if (!stKeys.includes(stKey)) setStKey(stKeys[0] ?? 'Spellcaster') }
    else setStOpen(false)
    return !v
  })
  // ‹ / › (and ← / →): step to the previous/next PRESENT subtype, wrapping around.
  const cycleSubtype = (dir: 1 | -1) => {
    if (!stKeys.length) return
    const i = stKeys.indexOf(stKey)
    const next = stKeys[(((i === -1 ? 0 : i) + dir) % stKeys.length + stKeys.length) % stKeys.length]
    setStKey(next)
  }
  const hotkeys = useRef<{
    botControl?: BotControl; me: PlayerId; revealLen: number; bigLen: number
    onEditor: () => void; onUndo: () => void; onHelp: () => void; onFaq: () => void
    onSubtype: () => void; onCycle: (dir: 1 | -1) => void; stOn: boolean
    onZoom: (dir: 1 | -1) => void; onZoomReset: () => void; onPan: (dx: number, dy: number) => void; zoom: number
  }>({ me, revealLen: 0, bigLen: 0, onEditor: editorHotkey, onUndo: undoHotkey, onHelp: () => {}, onFaq: () => {}, onSubtype: () => {}, onCycle: () => {}, stOn: false, onZoom: () => {}, onZoomReset: () => {}, onPan: () => {}, zoom: 1 })
  hotkeys.current = {
    botControl, me, revealLen: revealPops.length, bigLen: bigPops.length,
    onEditor: editorHotkey, onUndo: undoHotkey, onHelp: () => setShowSymbols((v) => !v),
    onFaq: toggleFaq, onSubtype: toggleSubtype, onCycle: cycleSubtype, stOn: stView,
    onZoom: (dir) => applyZoom(zoomRef.current + dir * ZOOM_STEP), onZoomReset: () => applyZoom(1), onPan: panBoard, zoom,
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const h = hotkeys.current
      // Board zoom / pan — handled first so key-repeat works (held arrow keeps panning). Still
      // skips real browser chords (Ctrl/⌘/Alt), so the OS zoom stays on Ctrl+wheel only.
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase()
        if (k === '+' || k === '=') { h.onZoom(1); e.preventDefault(); return }
        if (k === '-' || k === '_') { h.onZoom(-1); e.preventDefault(); return }
        if (k === '0') { h.onZoomReset(); e.preventDefault(); return }
        if (k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') {
          // ←/→ still cycle subtypes while the Subtype view is on; otherwise arrows pan a zoomed board.
          if ((k === 'arrowleft' || k === 'arrowright') && h.stOn) { h.onCycle(k === 'arrowleft' ? -1 : 1); e.preventDefault(); return }
          if (h.zoom > 1) {
            if (k === 'arrowup') h.onPan(0, -PAN_STEP)
            else if (k === 'arrowdown') h.onPan(0, PAN_STEP)
            else if (k === 'arrowleft') h.onPan(-PAN_STEP, 0)
            else h.onPan(PAN_STEP, 0)
            e.preventDefault()
          }
          return
        }
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const meP = h.me
      const opp = (1 - meP) as PlayerId
      const toggleZone = (pid: PlayerId, zone: 'cemetery' | 'collection') =>
        setZoneView((cur) => (cur && cur.pid === pid && cur.zone === zone ? null : { pid, zone }))
      switch (e.key.toLowerCase()) {
        case 'w': // dismiss the front-most card popup (reveal notice, then an opponent-play pop)
          if (h.revealLen > 0) setRevealPops((p) => p.slice(0, -1))
          else if (h.bigLen > 0) setBigPops((p) => p.slice(0, -1))
          else setOppPlay(null)
          break
        case 'd': { // step through the computer's turn (start stepping, or advance one action)
          const bc = h.botControl
          if (!bc) return
          if (!bc.stepMode) bc.onStep()
          else if (bc.canAdvance) bc.onNext()
          break
        }
        case 's': setSubView((v) => !v); break
        case 'a': toggleZone(meP, 'collection'); break
        case 'c': toggleZone(meP, 'cemetery'); break
        case 'x': toggleZone(opp, 'cemetery'); break
        case 'e': h.onEditor(); break // editor: open / close / request permission
        case 'q': h.onHelp(); break // toggle the GUI symbol legend
        case 'f': h.onFaq(); break // toggle the FAQ view
        case 'z': h.onSubtype(); break // toggle the Subtype view
        case 'backspace': h.onUndo(); break // undo (or request an undo online)
        case 'enter': { // confirm: click the current on-screen confirm button, if enabled
          const root = gameRef.current
          if (!root) return
          // An open modal/overlay (the concede dialog, the ward-save offer…) owns the Enter first,
          // so its affirmative button wins over a confirm sitting in a background prompt banner.
          const btn = (root.querySelector('.modal [data-confirm]:not([disabled]), [data-overlay] [data-confirm]:not([disabled])')
            ?? root.querySelector('[data-confirm]:not([disabled])')) as HTMLButtonElement | null
          if (!btn) return
          btn.click()
          break
        }
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Offer the Savior's ward on each freshly-summoned OWN minion — a GUI shortcut to the same
  // "(1) → Ward a minion summoned this turn" ability (no engine change). Only when YOU pilot a
  // Savior whose ward is currently usable and the minion can actually be warded (summoned this
  // turn, not already warded, not an Evil minion). The manual ability button is untouched.
  useEffect(() => {
    const av = view.units[myPlayer.avatarUnitId]
    if (!av) return
    let canSave = false
    try { canSave = canActivate(st, me, av.id, 'save') === null } catch { canSave = false }
    for (const u of Object.values(view.units) as UnitState[]) {
      if (u.isAvatar || u.controller !== me || u.enteredTurn !== view.turn) continue
      if (seenSavior.current.has(u.id)) continue
      seenSavior.current.add(u.id) // evaluate each new minion once
      if (!canSave || u.ward || isEvilUnit(st, u)) continue
      setSaviorOffers((prev) => (prev.includes(u.id) ? prev : [...prev, u.id]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, me])

  const myTurn = actingSeatFor(st, view.activePlayer) === realSeat && view.phase === 'main' && !prompt
  const avatar = view.units[myPlayer.avatarUnitId]
  // Animist avatar (or Imposter masked as one): has the `animate` ability, whether
  // innate to its script or granted at runtime. Drives the cast-as-Spirit chooser.
  const avatarHasAnimate = [
    ...(getScript(avatar.name)?.abilities ?? []),
    ...(() => { try { return grantedAbilities(st, avatar) } catch { return [] } })(),
  ].some((a: any) => a.key === 'animate')

  // Doomsday Cult: when MY revealed spellbook top is an Evil minion, clicking it in the player bar fires the
  // avatar's granted Cult ability (→ card to hand + auto-opened cast at the Cult). We judge castability from
  // the revealed top itself — the redacted view has no spellbook array, so canActivate/grantsAbilities can't
  // see it client-side; the authoritative engine re-validates on activate.
  const castCultTop = (() => {
    const topId = (myPlayer as any).spellbookTop as string | undefined
    if (!topId || !avatar || !myTurn) return undefined
    const card = view.cards[topId]
    if (!card) return undefined
    const def = getCard(card.name)
    if (def.type !== 'Minion' || !isEvilCardNameFor(st, me, card.name)) return undefined
    // a Cult I control, and the minion can actually be paid for and summoned onto its site — otherwise the
    // ability no-ops, so don't invite the click.
    const cult = (Object.values(view.units) as UnitState[]).find((u) => u.name === 'Doomsday Cult' && u.controller === me && !u.silenced)
    if (!cult) return undefined
    const ok = (() => { try { return affordable(st, me, card.name, avatar as any) && validateSummonAt(st, me, card.name, { x: cult.x, y: cult.y }) === null } catch { return false } })()
    return ok ? () => send({ t: 'activate', sourceId: avatar.id, ability: 'cult:sermon' }) : undefined
  })()

  // Who may cast this spell right now? The engine (canCast) is the sole arbiter. The
  // rules let the player choose any legal Spellcaster under their control (rulebook:
  // "the Spellcaster and its location are by whom and where the spell is being cast").
  // A spell may also be castable by more units than the avatar — "May be cast by X"
  // EXPANDS the caster set (allied Mortal/Beast/Dragon/Spirit/Undead/any ally). We
  // enumerate every legal caster; the avatar is listed FIRST so single-caster and
  // deterministic flows prefer it.
  function legalCasters(cardId: string): string[] {
    const out: string[] = []
    if (canCast(st, me, cardId, avatar.id).ok) out.push(avatar.id)
    for (const u of Object.values(view.units)) {
      if (u.controller !== me || u.isAvatar) continue
      if (canCast(st, me, cardId, u.id).ok) out.push(u.id)
    }
    // spellcaster ARTIFACTS you control can cast too (the Omphaloi cast their own drawn spells
    // and any spell of their element) — otherwise an Omphalos-locked hand card has no caster.
    for (const a of Object.values(((view as any).artifacts ?? {}) as Record<string, { id: string; carriedBy?: string | null; conjuredBy?: PlayerId }>)) {
      const controller = a.carriedBy ? view.units[a.carriedBy]?.controller : a.conjuredBy
      if (controller !== me) continue
      if (canCast(st, me, cardId, a.id).ok) out.push(a.id)
    }
    // spellcaster SITES you control can cast too — a printed one (River of Flame: "Fire Spellcaster")
    // or one granted Spellcaster this turn (Merlin's Tower). The caster's LOCATION matters (a projectile
    // magic fires from the site), so this is a real choice, not just the avatar.
    for (const s of Object.values(view.sites) as any[]) {
      if (s.controller !== me || s.isRubble) continue
      if (canCast(st, me, cardId, s.id).ok) out.push(s.id)
    }
    return out
  }

  // "may cast X from your collection" (Silver Bullet, Toolbox): the engine lends the
  // spell and flags it — open the cast picker at once so it plays immediately rather
  // than sitting in hand. Each offer is opened once (a decline lets it lapse).
  const autoCastOpened = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (isSpectator || !myTurn || mode.m !== 'idle') return
    const offers: { player: PlayerId; cardId: string }[] = (view as any).flow?.offerCast ?? []
    const mine = offers.find(
      (o) => o.player === me && !autoCastOpened.current.has(o.cardId) && myPlayer.hand.includes(o.cardId),
    )
    if (mine) {
      autoCastOpened.current.add(mine.cardId)
      clickHandCard(mine.cardId) // routes by type: summon / conjure / aura / magic / projectile
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, mode, me, isSpectator, myTurn, myPlayer])
  // units you can click right now — chooseTargets candidates, or (when conjuring
  // an artifact) the units you may hand it to. Highlighted on the board.
  const targetIds: Set<string> | null = (() => {
    // chooseTargets candidates (units / artifacts / sites) are the clickable+highlighted
    // set. Sites are included too so a site-target prompt rings its legal sites (the
    // site chip reads data-target from this set) even when minions stand on them.
    if (prompt && promptIsMine && prompt.kind === 'chooseTargets')
      return new Set<string>(prompt.data?.candidates ?? [])
    // caster picker: the legal casters are the clickable set (highlighted like targets)
    if (mode.m === 'chooseCaster') return new Set<string>(mode.casters)
    // Mimic summon: every carriable artifact anywhere (ground or carried, even an enemy's /
    // subsurface one) is a clickable+highlighted placement target — the Mimic transforms into it.
    if (mode.m === 'summon' && getScript(view.cards[mode.cardId]?.name ?? '')?.summonTargetsCarriable) {
      return new Set<string>(
        (Object.values(view.artifacts) as any[]).filter((a) => isCarriableArtifact(a.name)).map((a) => a.id),
      )
    }
    if (mode.m === 'conjure') {
      const enemyOk = !!getScript(view.cards[mode.cardId]?.name ?? '')?.conjureToEnemy
      return new Set<string>(
        (Object.values(view.units) as UnitState[]).filter((u) => enemyOk || u.controller === me).map((u) => u.id),
      )
    }
    // magic / abilityTargets: highlight legal unit/minion/avatar/artifact/site targets
    // so the player can see what is clickable. We ask the engine validator per candidate
    // so we never duplicate target-constraint logic in the client.
    if (mode.m === 'magic' || mode.m === 'abilityTargets') {
      const spec = mode.m === 'magic'
        ? (() => { const n = view.cards[mode.cardId]?.name; const s = n ? getScript(n) : null; return (s?.targets ?? [])[mode.picked.length] ?? null })()
        : (mode.specs[mode.picked.length] ?? null)
      if (!spec || spec.what === 'square') return null // squares highlighted separately
      try {
        // abilityTargets: the engine anchors range/region/filter on the SOURCE
        // (unit, a carried artifact's bearer, or a positional pseudo-caster at a
        // site/ground-artifact). Mirror it exactly via the shared abilityAnchor so
        // the highlight set matches what the engine will accept. magic: anchor on the
        // CHOSEN caster (not always the avatar) — a submerged Spellcaster casting a
        // targeted spell reaches submerged targets; Kiss of Death's 'here' highlights
        // the caster's own square, exactly as castSpell validates it.
        const caster = (mode.m === 'abilityTargets'
          ? abilityAnchor(st, mode.sourceId, me)
          : (view.units[mode.casterId] ?? avatar)) as UnitState
        const ids = new Set<string>()
        // units are candidates for unit/minion/avatar/minionOrArtifact, and for 'artifact' too
        // (Automatons are minion-artifacts). validateTarget rejects the wrong type per candidate.
        if (spec.what !== 'site') {
          for (const u of Object.values(view.units) as UnitState[]) {
            if (!validateTarget(st, spec, { unit: u.id }, caster, me)) ids.add(u.id)
          }
        }
        if (spec.what === 'artifact' || spec.what === 'minionOrArtifact' || spec.what === 'minionArtifactOrAura') {
          for (const a of Object.values(view.artifacts ?? {}) as any[]) {
            if (!validateTarget(st, spec, { artifact: a.id }, caster, me)) ids.add(a.id)
          }
        }
        if (spec.what === 'minionArtifactOrAura') {
          for (const r of Object.values(view.auras ?? {}) as any[]) {
            if (!validateTarget(st, spec, { aura: r.id } as any, caster, me)) ids.add(r.id)
          }
        }
        if (spec.what === 'site') {
          for (const s of Object.values(view.sites) as any[]) {
            if (!validateTarget(st, spec, { site: s.id }, caster, me)) ids.add(s.id)
          }
        }
        return ids.size > 0 ? ids : null
      } catch {
        return null
      }
    }
    return null
  })()

  const send = (a: Action) => session.send(a)

  // Idle "did you forget to end your turn?" nudge: while it's genuinely YOUR turn to act
  // (main phase, no pending prompt, not a spectator), a full 2 minutes with no input pops a
  // gentle reminder. Every pointer/key interaction — which is how every game action begins —
  // resets the countdown, so an actively-playing (or thinking-then-clicking) player never sees
  // it; only a truly walked-away seat does. A prompt flips myTurn off and pauses the timer.
  const [idleNudge, setIdleNudge] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (isSpectator || !myTurn) { setIdleNudge(false); return }
    setIdleNudge(false)
    const arm = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => setIdleNudge(true), 120_000)
    }
    const onActivity = () => { setIdleNudge(false); arm() }
    window.addEventListener('pointerdown', onActivity)
    window.addEventListener('keydown', onActivity)
    arm()
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
    }
  }, [myTurn, isSpectator])

  // ---- board helpers ----
  // NB: keyed on `view` (fresh object per update) — in hotseat mode the inner
  // sites/units objects are mutated in place and keep their identity
  const siteBySquare = useMemo(() => {
    const map = new Map<string, any>()
    for (const s of Object.values(view.sites)) map.set(`${(s as any).x},${(s as any).y}`, s)
    return map
  }, [view])

  // squares a roaming Wildfire has already burned. Its aura remembers every visited SITE by id
  // (a `s:<siteId>` counter), so the scorch mark follows a site that has since moved — we resolve
  // each visited site id to its CURRENT coordinate. Those sites show a scorched mark while the fire lives.
  const scorchedSquares = useMemo(() => {
    const set = new Set<string>()
    for (const a of Object.values(view.auras) as any[]) {
      if (a.name !== 'Wildfire' || !a.counters) continue
      for (const k of Object.keys(a.counters)) {
        if (!a.counters[k]) continue
        const m = /^s:(.+)$/.exec(k)
        if (!m) continue
        const site = (view.sites as any)[m[1]]
        if (site) set.add(`${site.x},${site.y}`)
      }
    }
    return set
  }, [view])

  // sites the Flame of the First Ones has already KINDLED (visited). Like Wildfire, the artifact
  // remembers each visited SITE by id (a `flame:<siteId>` counter — never a position), so the mark
  // follows a site that has since moved: resolve each id to its CURRENT coordinate. A site destroyed
  // (its id gone from view.sites) simply drops off. Shown while the flame artifact is in play.
  const flameVisitedSquares = useMemo(() => {
    const set = new Set<string>()
    for (const a of Object.values(view.artifacts) as any[]) {
      if (a.name !== 'Flame of the First Ones' || !a.counters) continue
      for (const k of Object.keys(a.counters)) {
        if (!a.counters[k]) continue
        const m = /^flame:(.+)$/.exec(k)
        if (!m) continue
        const site = (view.sites as any)[m[1]]
        if (site) set.add(`${site.x},${site.y}`)
      }
    }
    return set
  }, [view])

  const unitsBySquare = useMemo(() => {
    const map = new Map<string, UnitState[]>()
    // During manual stepping the mover (and anything it carries) is drawn at its CURSOR —
    // the unit visibly walks one step at a time. Nothing is committed to the engine until
    // the path is confirmed, so this is a pure client-side ghost over the real position.
    const ghostId = mode.m === 'manualMove' ? mode.unitId : null
    const cursor = mode.m === 'manualMove' && mode.steps.length ? mode.steps[mode.steps.length - 1] : null
    const push = (u: UnitState) => { const k = `${u.x},${u.y}`; if (!map.has(k)) map.set(k, []); map.get(k)!.push(u) }
    for (const u of Object.values(view.units) as UnitState[]) {
      // A committed multi-step walk is drawn as a self-contained ghost (below), so HIDE the real unit (and
      // anything it carries) while it walks. This must NOT relocate the live unit: a Move & Attack often
      // kills the attacker, so by render time it's already gone and there'd be nothing to move.
      if (movingUnitIds.has(u.id) || (u.carriedBy && movingUnitIds.has(u.carriedBy))) continue
      const uu = cursor && (u.id === ghostId || u.carriedBy === ghostId)
        ? ({ ...u, x: cursor.x, y: cursor.y, region: cursor.region } as UnitState)
        : u
      push(uu)
    }
    // The walk itself: a card-sized ghost visits each square of the recorded route (moveAnim, name + squares)
    // dwelling ~0.5s per square. Because it's built from the RECORD, not the unit, it plays even when the
    // mover died on arrival (attacker strike-back) or otherwise left the realm.
    for (const f of moveFx) {
      const sq = f.squares[Math.min(f.idx, f.squares.length - 1)]
      if (!sq) continue
      const live = view.units[f.unitId]
      push({ id: `mv:${f.id}`, name: f.name, x: sq.x, y: sq.y, region: (sq as any).region ?? live?.region ?? 'surface', flipped: live?.flipped, _anim: 'move', _gid: f.id } as unknown as UnitState)
    }
    // Splice each death/teleport ghost back into the EXACT tile the card held last frame (_slot), so its
    // square-mates keep their size and position for the whole animation — the reflow waits until the ghost
    // is dropped. Ascending _slot keeps indices valid when several cards leave one square at once.
    for (const g of [...deathGhosts, ...teleGhosts].sort((a, b) => a._slot - b._slot)) {
      const k = `${g.x},${g.y}`
      if (!map.has(k)) map.set(k, [])
      const arr = map.get(k)!
      arr.splice(Math.min(g._slot, arr.length), 0, g as unknown as UnitState)
    }
    return map
  }, [view, mode, moveFx, deathGhosts, teleGhosts])

  // Measure the rendered chip centroids for each multi-square body and build the connective
  // segments between orthogonally-adjacent occupied squares. Uses real DOM positions so the
  // links track the chips as they tile/shift within a shared square. Runs after layout.
  useLayoutEffect(() => {
    const board = boardRef.current
    // Yog-Sothoth occupies every square but shows as one chip + a full-realm wash, so it draws no links.
    const bodies = (Object.values(view.units) as UnitState[]).filter((u) => !u.size && u.name !== 'Yog-Sothoth' && (u.extraSquares?.length ?? 0) > 0)
    if (!board || !bodies.length) { setBodyLines((p) => (p.length ? [] : p)); return }
    const brect = board.getBoundingClientRect()
    // Derive the ACTUAL content→screen scale from the board itself (its on-screen size ÷ its
    // layout size). This folds in EVERY ancestor transform — boardScale AND the desktop/mobile
    // uiScale — so the measured centroids land in the board's own (untransformed) coordinate
    // space, which is what the absolutely-positioned link divs use. (Dividing by boardScale
    // alone was wrong whenever uiScale ≠ 1, pulling every point toward the board's corner.)
    const sx = brect.width / (board.offsetWidth || 1)
    const sy = brect.height / (board.offsetHeight || 1)
    const toBoard = (r: DOMRect) => ({
      x: (r.left + r.width / 2 - brect.left) / sx,
      y: (r.top + r.height / 2 - brect.top) / sy,
    })
    const segs: { key: string; ax: number; ay: number; bx: number; by: number; mine: boolean; z: number }[] = []
    for (const u of bodies) {
      const centerBySq = new Map<string, { x: number; y: number }>()
      board.querySelectorAll(`.unit[data-unit="${u.id}"]`).forEach((el) => {
        const sq = el.closest('.square')?.getAttribute('data-sq')
        if (sq) centerBySq.set(sq, toBoard(el.getBoundingClientRect()))
      })
      const parts = occupiedSquares(u)
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          if (Math.abs(parts[i].x - parts[j].x) + Math.abs(parts[i].y - parts[j].y) !== 1) continue
          const a = centerBySq.get(`${parts[i].x},${parts[i].y}`)
          const b = centerBySq.get(`${parts[j].x},${parts[j].y}`)
          if (!a || !b) continue
          // z:1 keeps the connective tissue BELOW every chip (units are z:2+) — always beneath the copies and the main card.
          segs.push({ key: `${u.id}-${i}-${j}`, ax: a.x, ay: a.y, bx: b.x, by: b.y, mine: u.controller === me, z: 1 })
        }
      }
    }
    setBodyLines(segs)
    // `flip`/`me` are constant for a session; view/mode/scale/hover/subView cover every relayout.
  }, [view, mode, boardScale, bodyHover, subView, me])

  const highlights = useMemo(() => {
    const set = new Map<string, string>() // "x,y" -> css class
    try {
      if (mode.m === 'placeSite') {
        for (const s of legalSiteSquares(st, me, view.cards[mode.cardId]?.name)) set.set(`${s.x},${s.y}`, 'hl-place')
      }
      if (mode.m === 'summon') {
        const name = view.cards[mode.cardId]?.name
        // oversized (2x2) minions occupy four squares — placed via intersection markers
        // (rendered below), NOT single-square highlights.
        if (name && !getScript(name)?.oversized) {
          for (let x = 0; x < GRID_W; x++)
            for (let y = 0; y < GRID_H; y++) {
              for (const region of ['surface', 'underground', 'underwater', 'void'] as Region[]) {
                if (validateSummonAt(st, me, name, { x, y, region }) === null) {
                  set.set(`${x},${y}`, 'hl-place')
                }
              }
            }
        }
      }
      if (mode.m === 'conjure') {
        const conjureScript = getScript(view.cards[mode.cardId]?.name ?? '')
        const conjFilter = conjureScript?.conjureFilter
        for (const s of Object.values(view.sites) as any[]) {
          if (s.controller !== me) continue
          if (conjFilter && conjFilter(st, me, { x: s.x, y: s.y }) !== null) continue
          set.set(`${s.x},${s.y}`, 'hl-place')
        }
      }
      // 2x2 / wall auras are placed via dedicated overlay markers (intersection / border hotspots),
      // NOT square highlights — an aura sits where sites meet, not on one site. A SINGLE-SITE aura
      // (Castle's/Hamlet's Ablaze!) is the exception: it lands on ONE site, so light the sites up.
      if (mode.m === 'aura' && getScript(view.cards[mode.cardId]?.name ?? '')?.singleSiteAura) {
        const placement = getScript(view.cards[mode.cardId]?.name ?? '')?.auraPlacement
        const auraCaster = view.units[mode.casterId] // "nearby" is from the caster, not the avatar
        for (const s of Object.values(view.sites) as any[]) {
          if (s.isRubble) continue
          if (placement) { try { if (placement(st, me, { x: s.x, y: s.y }, auraCaster) !== null) continue } catch { continue } }
          set.set(`${s.x},${s.y}`, 'hl-place')
        }
      }
      if (mode.m === 'unit') {
        const u = view.units[mode.unitId]
        if (u) {
          // an oversized (2x2) unit shifts its whole block — its moves render as
          // intersection markers (below), not single-square highlights, so we only
          // paint its FOOTPRINT as self here (never its own squares as move targets).
          // dedicated classes for the click-a-unit case only (thicker + brighter
          // borders) so tuning this never touches the other hl-move/hl-self users.
          if (u.size !== '2x2' && canMoveAttack(u)) for (const s of reachableLocations(st, u)) set.set(`${s.x},${s.y}`, 'hl-unitmove')
          // Pathfinder: adjacent voids/rubble it can blaze a site into (lay-a-site highlight)
          for (const s of pathfinderBlazeSpots(u)) set.set(`${s.x},${s.y}`, 'hl-place')
          for (const s of occupiedSquares(u)) set.set(`${s.x},${s.y}`, 'hl-unitself')
          // a unit with movement to spare can step out and back — mark its OWN site as a (loop) move
          if (u.size !== '2x2' && canMoveAttack(u) && loopRoutes(st, u).length) set.set(`${u.x},${u.y}`, 'hl-loop')
        }
      }
      if (mode.m === 'pathChoice') {
        set.set(`${mode.dest.x},${mode.dest.y}`, 'hl-move')
        for (const s of routeHover ?? []) set.set(`${s.x},${s.y}`, 'hl-route') // preview the hovered route
      }
      // (pickTargetUnit candidates are shown via the per-unit gold glow, see combatGlow)
      if (mode.m === 'howMove') set.set(`${mode.dest.x},${mode.dest.y}`, 'hl-move')
      if (mode.m === 'manualMove') {
        // ONLY the legal next-step squares are lit (the mover itself is drawn at the cursor
        // via the ghost above); the stated destination stays marked so the goal is visible.
        set.set(`${mode.dest.x},${mode.dest.y}`, 'hl-move')
        if (!mode.stuck) for (const s of manualNextSteps()) set.set(`${s.x},${s.y}`, 'hl-unitmove')
      }
      if (prompt?.kind === 'chooseSquare' && promptIsMine && !prompt.data?.area2x2 && !prompt.data?.edgeSelect) {
        // (area2x2 picks — Earthquake — render as 2x2 intersection markers; edgeSelect — Displace a
        //  wall — renders border hotspots; both below, not square highlights)
        const only: { x: number; y: number }[] | undefined = prompt.data?.squares
        if (only) for (const s of only) set.set(`${s.x},${s.y}`, 'hl-place')
        else for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) set.set(`${x},${y}`, 'hl-place')
      }
      if (mode.m === 'abilityTargets') {
        const spec = mode.specs[mode.picked.length]
        // Anchor range/region on the ability SOURCE (unit, carried-artifact bearer,
        // or positional pseudo-caster for a site/ground artifact) via the shared
        // abilityAnchor, then let the engine validator decide what is legal — so the
        // board highlight is exactly the engine's accepted set (adjacent-only for
        // Floodplain's Overflow, nearby for Sinkhole's Collapse, etc.).
        const abilityCaster = abilityAnchor(st, mode.sourceId, me)
        // site-sourced abilities that target a site (Floodplain's Overflow, etc.):
        // highlight only the sites the engine would accept so the player can't misclick.
        if (spec?.what === 'site') {
          for (const s of Object.values(view.sites) as any[]) {
            try {
              if (!validateTarget(st, spec, { site: s.id }, abilityCaster, me)) set.set(`${s.x},${s.y}`, 'hl-move')
            } catch { /* ignore */ }
          }
        }
        // square-targeting abilities: highlight every square the engine would accept.
        if (spec?.what === 'square') {
          for (let x = 0; x < GRID_W; x++) {
            for (let y = 0; y < GRID_H; y++) {
              try {
                if (!validateTarget(st, spec, { square: { x, y } }, abilityCaster, me))
                  set.set(`${x},${y}`, 'hl-place')
              } catch { /* ignore */ }
            }
          }
        }
      }
      // magic mode: highlight squares when the current target spec is 'square'.
      // We call the engine's validateTarget per square so no range logic is duplicated.
      if (mode.m === 'magic') {
        const magicName = view.cards[mode.cardId]?.name
        const magicScript = magicName ? getScript(magicName) : null
        const magicSpec = (magicScript?.targets ?? [])[mode.picked.length]
        if (magicSpec?.what === 'square') {
          const magicCaster = (view.units[mode.casterId] ?? avatar) as UnitState
          // the already-picked targets, so a `whereOf` square (Blink: nearby the chosen ally) is measured
          // from the right anchor instead of the caster.
          const pickedRefs = mode.picked
            .map((id) => (view.units[id] ? { unit: id } : view.sites[id] ? { site: id } : view.artifacts[id] ? { artifact: id } : null))
            .filter(Boolean) as any[]
          for (let x = 0; x < GRID_W; x++) {
            for (let y = 0; y < GRID_H; y++) {
              try {
                if (!validateTarget(st, magicSpec, { square: { x, y } }, magicCaster, me, pickedRefs))
                  set.set(`${x},${y}`, 'hl-place')
              } catch { /* ignore */ }
            }
          }
        }
      }
      if (mode.m === 'blowOrigin') {
        for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) set.set(`${x},${y}`, 'hl-place')
      }
      if (mode.m === 'blowConfirm') {
        for (const s of coneSquares(mode.origin, mode.dir)) set.set(`${s.x},${s.y}`, 'hl-cone')
        set.set(`${mode.origin.x},${mode.origin.y}`, 'hl-self')
      }
      if (mode.m === 'judgePlace') {
        // judge placement is direct: every in-bounds square is a legal target
        for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) set.set(`${x},${y}`, 'hl-place')
      }
    } catch {
      // highlight computation must never crash the UI
    }
    return set
  }, [mode, st, me, view, prompt])

  // ---- click handling ----

  function clickSquare(x: number, y: number) {
    if (isSpectator) return
    // Judge scenario-creation placement takes precedence over everything: the
    // judge is the tabletop escape hatch and its click must not be swallowed by
    // any card-play mode or prompt. Send the judge op for the chosen square and
    // return to idle.
    if (mode.m === 'judgePlace') {
      if (!inBounds(x, y)) return
      if (mode.op === 'move' && mode.unitId) {
        send({ t: 'judge', op: { k: 'move', unitId: mode.unitId, x, y, region: mode.region } })
      } else if (mode.op === 'moveArtifact' && mode.artifactId) {
        send({ t: 'judge', op: { k: 'moveArtifact', artifactId: mode.artifactId, x, y, region: mode.region } })
      } else if (mode.op === 'summonUnit' && mode.name) {
        send({ t: 'judge', op: { k: 'summonUnit', name: mode.name, player: mode.player, x, y, region: mode.region, noGenesis: mode.noGenesis } })
      } else if (mode.op === 'placeSite' && mode.name) {
        send({ t: 'judge', op: { k: 'placeSite', name: mode.name, player: mode.player, x, y } })
      } else if (mode.op === 'spawnArtifact' && mode.name) {
        send({ t: 'judge', op: { k: 'spawnArtifact', name: mode.name, player: mode.player, x, y } })
      }
      // back to idle so the board is interactive again; the editor panel stays
      // OPEN (we no longer close it on placement), so you can keep editing.
      setMode({ m: 'idle' })
      return
    }
    // A pending chooseSquare prompt takes precedence over any board mode: after a
    // no-target ability (e.g. Geomancer reclaim, Waveshaper wave, Pathfinder blaze,
    // Animist animate) the SOURCE unit is still selected (mode 'unit'), so without
    // this the highlighted square click would be swallowed by the move branch below
    // (or rejected by the engine as a move mid-prompt). Mirrors clickUnit/clickSite,
    // which prioritise the chooseTargets prompt over their selection modes.
    if (prompt?.kind === 'chooseSquare' && promptIsMine) {
      if (prompt.data?.edgeSelect) return // wall-border hotspots handle the click, not bare squares
      const only: { x: number; y: number }[] | undefined = prompt.data?.squares
      if (only && !only.some((s) => s.x === x && s.y === y)) return
      send({ t: 'prompt', promptId: prompt.id, choice: { x, y } })
      return
    }
    // site-target chooseTargets PROMPT (mid-effect): a click ANYWHERE in the square
    // selects the site beneath it — whole-square hitbox, even under minions.
    if (prompt?.kind === 'chooseTargets' && promptIsMine) {
      const cands: string[] | undefined = prompt.data?.candidates
      const s = Object.values(view.sites).find((st: any) => !st.isRubble && st.x === x && st.y === y)
      const legal = s && (cands ? cands.includes((s as any).id) : prompt.data?.kind === 'site')
      if (legal) { send({ t: 'prompt', promptId: prompt.id, choice: [(s as any).id] }); return }
    }
    if (mode.m === 'blowOrigin') {
      setMode({ m: 'blowDir', cardId: mode.cardId, casterId: mode.casterId, targetId: mode.targetId, origin: { x, y } })
      return
    }
    if (mode.m === 'placeSite') {
      send({ t: 'avatarSite', mode: 'play', cardId: mode.cardId, x, y })
      setMode({ m: 'idle' })
      return
    }
    if (mode.m === 'summon') {
      const name = view.cards[mode.cardId]?.name
      const regions = (['surface', 'underground', 'underwater', 'void'] as Region[]).filter(
        (r) => name && validateSummonAt(st, me, name, { x, y, region: r }) === null,
      )
      if (regions.length === 0) return
      if (regions.length > 1) {
        // Submerge/Burrowing minions may enter above or below: let the player pick
        setMode({ m: 'summonRegion', cardId: mode.cardId, casterId: mode.casterId, x, y, regions })
        return
      }
      castWithTargets(mode.cardId, mode.casterId, { x, y, region: regions[0] })
      return
    }
    if (mode.m === 'conjure') {
      send({ t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId, at: { x, y } })
      setMode({ m: 'idle' })
      return
    }
    // auras are placed via overlay markers (walls: border hotspots; 2x2 auras: intersection
    // markers). A SINGLE-SITE aura (Castle's/Hamlet's Ablaze!) is placed by clicking one site.
    if (mode.m === 'aura') {
      const auraScript = getScript(view.cards[mode.cardId]?.name ?? '')
      if (auraScript?.singleSiteAura) {
        const s = Object.values(view.sites).find((si: any) => si.x === x && si.y === y && !si.isRubble)
        const auraCaster = view.units[mode.casterId ?? avatar.id]
        const okPlace = s && (!auraScript.auraPlacement || (() => { try { return auraScript.auraPlacement!(st, me, { x, y }, auraCaster) === null } catch { return false } })())
        if (okPlace) { send({ t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId ?? avatar.id, at: { x, y } }); setMode({ m: 'idle' }) }
      }
      return
    }
    // square-target picking for spells (magic) AND activated abilities (Ancient
    // Dragon's breath, Ignis Rex's roar, Midland Army's bombard, Sparkmage's spark…)
    if ((mode.m === 'magic' || mode.m === 'abilityTargets') && currentSpec()?.what === 'square') {
      pickTarget(`sq:${x},${y}`)
      return
    }
    // site-target picking for spells/abilities (Craterize, Cave-In…): a click anywhere
    // in the square targets the site beneath it. clickUnit/clickSite already redirect a
    // unit- or site-card click to the site, but a click that lands on the bare square
    // (the gaps around a unit chip on an OCCUPIED site) must resolve the same way — else
    // the site looks un-targetable whenever a unit sits on it.
    if ((mode.m === 'magic' || mode.m === 'abilityTargets' || mode.m === 'genesisTargets' || mode.m === 'promptTargets') && currentSpec()?.what === 'site') {
      const s = Object.values(view.sites).find((st: any) => st.x === x && st.y === y && !st.isRubble)
      if (s) pickTarget((s as any).id)
      return
    }
    if (mode.m === 'unit') {
      const u = view.units[mode.unitId]
      if (!u) return setMode({ m: 'idle' })
      if (!canMoveAttack(u)) return // tapped / summoning-sick / disabled → no move or attack
      const locs = reachableLocations(st, u).filter((s2) => s2.x === x && s2.y === y)
      // Something to FIGHT on the surface here — an enemy site, or enemy units atop the
      // square (even when the SITE is your own: enemies standing on your site are
      // attackable) — routes to the attack chooser, which offers ⚔ Attack alongside a
      // move / burrow / submerge. Without this a bare square click just relocates the
      // unit (or dove a Burrowing/Submerge unit underground) and never offered the fight.
      const enemySite = Object.values(view.sites).find(
        (s: any) => s.x === x && s.y === y && !s.isRubble && s.controller !== null && s.controller !== me,
      )
      const foesHere = unitsAt(st, x, y, 'surface').some((uu) => uu.controller !== me && !uu.carriedBy)
      const onSurfaceHere = u.x === x && u.y === y && u.region === 'surface'
      if ((enemySite || foesHere) && (onSurfaceHere || locs.some((l) => l.region === 'surface'))) {
        const surfaceDest = { x, y, region: 'surface' as Region }
        // Attack CHOOSER first (⚔ Attack / 🚶 Move only), THEN the route pick (user's order):
        // openMoveChoice builds the choices from the arrival anchor; picking one that walks a
        // multi-step route defers into the route picker (departed-square effects still honoured).
        // Already standing here → empty approach, no route to pick either way.
        const approach = onSurfaceHere ? [] : findPath(st, u, surfaceDest)
        if (approach !== null) openMoveChoice(u, surfaceDest, approach, enemySite ?? null)
        return
      }
      // Pathfinder: clicking an adjacent VOID it can blaze into fires the ability IMMEDIATELY
      // (unprompted) — moving into empty space just blazes a trail there. (A rubble is a site, so
      // its click arrives via clickSite, which ASKS first before building over it.) The void is
      // never a normal reachable square, so this can't shadow a real move.
      if (!siteAt(st, x, y) && pathfinderBlazeSpots(u).some((s) => s.x === x && s.y === y)) {
        setBlazePending({ x, y })
        send({ t: 'activate', sourceId: u.id, ability: 'blaze' }) // → chooseSquare, auto-answered with (x,y)
        setMode({ m: 'idle' })
        return
      }
      // Click on your OWN site with movement to spare → step out and back (a "loop" move): it ends
      // where it started but counts as having moved (fires departed/entered-square effects). Offer the
      // one-hop bounce routes just like a normal relocation — all routes shown, route picked if several.
      if (u.x === x && u.y === y && locs.length === 0) {
        const loops = loopRoutes(st, u) // same-region out-and-back hops (all shown; picked if several)
        if (loops.length === 0) return
        const dest = { x: u.x, y: u.y, region: u.region }
        if (loops.length === 1) resolveRoute(u, dest, loops[0])
        else setMode({ m: 'pathChoice', unitId: u.id, dest, paths: loops })
        return
      }
      if (locs.length === 0) return
      if (locs.length > 1) {
        // both above and below are reachable (Submerge/Burrowing): let the player pick
        setMode({ m: 'moveRegion', unitId: u.id, x, y, regions: locs.map((l) => l.region) })
        return
      }
      // pure relocation: pick the route (the departed squares matter — Giant Shark /
      // Root Spider / Blaze). beginRouteSelection resolves a single route directly.
      beginRouteSelection(u, locs[0])
      return
    }
    if (mode.m === 'manualMove') { manualStepTo(x, y); return }
  }

  // ---- route selection (arrows vs auto/manual) ----------------------------------
  /** does a path leave the unit's starting region at any point (burrow/submerge/void)? */
  function pathHasRegionChange(u: UnitState, path: Step[]): boolean {
    return path.some((s) => s.region !== u.region)
  }
  /** Resolve the chosen ROUTE. With no pending action it's a plain relocation (send the
   *  move). With `after` it's the tail of an attack the player ALREADY picked in the
   *  move/attack chooser (chooser first, route second): fire the strike along this route —
   *  or, for several same-name enemies, open the pick-one follow-up carrying the route. */
  function resolveRoute(u: UnitState, dest: Step, path: Step[], after?: MovePending) {
    if (after?.kind === 'attack') {
      send({ t: 'moveAttack', unitId: u.id, path, attack: after.attack })
      setMode({ m: 'idle' })
      return
    }
    if (after?.kind === 'pick') {
      setMode({ m: 'pickTargetUnit', unitId: u.id, path, candidates: after.candidates, name: after.name })
      return
    }
    if (path.length) send({ t: 'moveAttack', unitId: u.id, path })
    setMode({ m: 'idle' })
  }
  /** Decide how the player picks the route to `dest`. One route → resolve immediately.
   *  A small, single-region set → the arrows picker (all lengths, not just shortest).
   *  Anything with region changes or ≥10 routes is too busy to arrow: ask Auto vs Manual. */
  function beginRouteSelection(u: UnitState, dest: Step, after?: MovePending) {
    // Enumerate EVERY route to the destination (any length). The arrows picker shows ALL of them —
    // never a filtered subset. Only when the COMPLETE set is genuinely large (≥10) or the search
    // couldn't finish (truncated) do we fall back to Auto/Manual.
    const report = { truncated: false }
    const routes = enumeratePaths(st, u, dest, 40, { allLengths: true, report })
    // TRUNCATED (the search hit its budget on a free-movement board — routes may be incomplete), NONE
    // found, or ≥10: don't show a possibly-incomplete arrow set. Offer Auto (findPath's true shortest)
    // vs Manual — the square is reachable, and Manual validates any route the player walks by hand.
    if (report.truncated || routes.length === 0 || routes.length >= 10) {
      const p = findPath(st, u, dest)
      if (p) setMode({ m: 'howMove', unitId: u.id, dest, paths: [p], after })
      return
    }
    if (routes.length === 1) { resolveRoute(u, dest, routes[0], after); return }
    // a COMPLETE small set (2–9 routes): show the arrows picker — unless a route changes region, which is
    // too busy to arrow, so ask Auto vs Manual instead.
    setMode(
      routes.some((p) => pathHasRegionChange(u, p))
        ? { m: 'howMove', unitId: u.id, dest, paths: routes, after }
        : { m: 'pathChoice', unitId: u.id, dest, paths: routes, after },
    )
  }
  // ---- manual stepping -----------------------------------------------------------
  /** the manual-move cursor: where the unit sits after the steps taken so far, and how
   *  much of its step budget (cost, free steps = 0) is spent. */
  function manualState(): { u: UnitState; pos: Step; spent: number } | null {
    if (mode.m !== 'manualMove') return null
    const u = view.units[mode.unitId]
    if (!u) return null
    const pos: Step = mode.steps.length ? mode.steps[mode.steps.length - 1] : { x: u.x, y: u.y, region: u.region }
    let spent = 0
    let from: Step = { x: u.x, y: u.y, region: u.region }
    for (const s of mode.steps) { spent += isFreeStep(st, u, from, s) ? 0 : 1; from = s }
    return { u, pos, spent }
  }
  /** every legal next step from the cursor that still fits the budget. */
  function manualNextSteps(): Step[] {
    const ms = manualState()
    if (!ms || mode.m !== 'manualMove') return []
    // Rulebook: "the only restriction is that you may not repeat specific steps." A step is an EDGE
    // (from→to), NOT a square — so a square may be revisited via a DIFFERENT edge, but the SAME edge
    // can't be walked twice. Exclude already-walked edges here; otherwise the client would offer a
    // repeat step the engine then silently drops (usedSteps), stranding the unit mid-move — the
    // "movement stops when you go twice on the same square" bug.
    const ek = (a: Step, b: Step) => `${a.x},${a.y},${a.region}->${b.x},${b.y},${b.region}`
    const walked = new Set<string>()
    let f: Step = { x: ms.u.x, y: ms.u.y, region: ms.u.region }
    for (const s of mode.steps) { walked.add(ek(f, s)); f = s }
    return legalStepsFrom(st, ms.u, ms.pos).filter(
      (to) => !walked.has(ek(ms.pos, to)) && ms.spent + (isFreeStep(st, ms.u, ms.pos, to) ? 0 : 1) <= mode.budget,
    )
  }
  /** take one manual step to `to` (a legal next step). Reaching the stated destination
   *  resolves the move; otherwise it just advances the cursor. */
  function manualTakeStep(to: Step) {
    if (mode.m !== 'manualMove') return
    const ms = manualState()
    if (!ms) return
    const steps = [...mode.steps, to]
    const reached = to.x === mode.dest.x && to.y === mode.dest.y && to.region === mode.dest.region
    if (reached) {
      // An attack-move (after) resolves on arrival — you moved in order to strike. A plain relocation
      // that reaches its stated square but STILL has movement AND a legal onward step does NOT
      // force-stop: it offers "stop here / keep moving" (you may want to press on, or loop back).
      if (mode.after) { resolveRoute(ms.u, mode.dest, steps, mode.after); return }
      let spent = 0
      let from: Step = { x: ms.u.x, y: ms.u.y, region: ms.u.region }
      for (const s of steps) { spent += isFreeStep(st, ms.u, from, s) ? 0 : 1; from = s }
      const remaining = mode.budget - spent
      const canGoOn = remaining >= 1 && legalStepsFrom(st, ms.u, to).some((n) => (isFreeStep(st, ms.u, to, n) ? 0 : 1) <= remaining)
      if (canGoOn) { setMode({ ...mode, steps, atDest: true }); return }
      resolveRoute(ms.u, mode.dest, steps)
      return
    }
    setMode({ ...mode, steps, atDest: false })
  }
  /** board click while manual-stepping: step onto (x,y) using its unique legal step,
   *  preferring a surface (lateral) step. Region-change steps use the panel buttons. */
  function manualStepTo(x: number, y: number, region?: Region) {
    const cands = manualNextSteps().filter((s) => s.x === x && s.y === y && (region ? s.region === region : true))
    if (cands.length === 0) return
    // one legal step to this square → take it; several regions (surface + a subsurface,
    // or two subsurface layers) → prefer surface, else the first (the region-layer click
    // path passes an explicit region so both orders stay reachable).
    manualTakeStep(cands.find((s) => s.region === 'surface') ?? cands[0])
  }
  /** the player asks to stop (Stop here, or ran out of legal steps): resolve if we're on
   *  the stated destination, else surface the "not where you said" confirm. */
  function manualStop() {
    if (mode.m !== 'manualMove') return
    const ms = manualState()
    if (!ms) return
    const at = ms.pos
    if (at.x === mode.dest.x && at.y === mode.dest.y && at.region === mode.dest.region) {
      resolveRoute(ms.u, mode.dest, mode.steps, mode.after)
    } else {
      setMode({ ...mode, stuck: true })
    }
  }

  /** Can THIS unit still move or attack right now? Move-and-Attack is one Tap ability, so a tapped,
   *  summoning-sick or disabled minion can do neither (rulebook). Avatars are never summoning-sick.
   *  Selecting such a unit must NOT paint move highlights or route board clicks into a move/attack that
   *  the engine would only reject. (mode:'unit' already implies it's my turn — see clickUnit.) */
  function canMoveAttack(u: UnitState): boolean {
    return u.controller === me && !u.tapped && !isSummoningSick(st, u) && !isDisabled(st, u)
  }

  /** destination has enemies and/or an enemy site: let the player choose
   *  between moving only, attacking the site, or attacking a unit there */
  /** the squares `u` would occupy if its anchor moved to `anchor` (oversized/rigid
   *  bodies carry their whole shape; a 1x1 just occupies the one square). */
  function footprintAt(u: UnitState, anchor: { x: number; y: number }): { x: number; y: number }[] {
    const dx = anchor.x - u.x
    const dy = anchor.y - u.y
    const out: { x: number; y: number }[] = []
    for (const s of occupiedSquares(u)) {
      const x = s.x + dx
      const y = s.y + dy
      if (inBounds(x, y)) out.push({ x, y })
    }
    return out
  }

  // Enemies (units + surface enemy sites) the attacker could strike from `anchor` — the shared
  // core of the move-and-attack chooser AND the burrow/surface action. `enemySite` optionally
  // forces an enemy site on the attacker's own square into the list.
  function attackChoicesAt(
    attacker: UnitState,
    anchor: { x: number; y: number; region?: Region },
    enemySite: any | null = null,
  ): { label: string; attack?: { unit: string } | { site: string }; pick?: string[] }[] {
    const akw = effKeywords(st, attacker)
    const truesight = attacker.carrying.some((id: string) => getScript(view.artifacts[id]?.name ?? '')?.bearerTruesight)
    const region = (anchor.region ?? attacker.region) as Region
    const choices: { label: string; attack?: { unit: string } | { site: string }; pick?: string[] }[] = []
    const seenU = new Set<string>()
    const seenS = new Set<string>()
    const targetUnits: UnitState[] = []
    const siteChoices: { label: string; attack: { site: string } }[] = []
    for (const cell of footprintAt(attacker, anchor)) {
      for (const u of unitsAt(st, cell.x, cell.y, region)) {
        if (u.controller === me || seenU.has(u.id)) continue
        if (carriedInside(st, u)) continue // swallowed cargo is out of reach; on-top passengers are attackable
        if (u.stealth && !truesight) continue
        if (effKeywords(st, u).airborne && !akw.airborne && u.region === 'surface') continue
        seenU.add(u.id)
        targetUnits.push(u)
      }
      if (region === 'surface') {
        const s = (Object.values(view.sites) as any[]).find((si) => si.x === cell.x && si.y === cell.y && !si.isRubble && si.controller !== null && si.controller !== me)
        if (s && !seenS.has(s.id)) { seenS.add(s.id); siteChoices.push({ label: `⚔ Attack ${s.name}`, attack: { site: s.id } }) }
      }
    }
    // Aggregate the co-located enemies BY NAME — one menu entry per name. If several share a name (a
    // tapped + an untapped Foot Soldier, two Horrible Hybrids on different life) the entry becomes a
    // `pick`: choosing it opens the pickTargetUnit follow-up where you click which one to attack.
    const byName = new Map<string, UnitState[]>()
    for (const u of targetUnits) { const arr = byName.get(u.name) ?? []; arr.push(u); byName.set(u.name, arr) }
    for (const [name, us] of byName) {
      if (us.length === 1) choices.push({ label: `⚔ Attack ${name}`, attack: { unit: us[0].id } })
      else choices.push({ label: `⚔ Attack ${name} (${us.length}) — pick one`, pick: us.map((u) => u.id) })
    }
    choices.push(...siteChoices)
    if (enemySite && !seenS.has(enemySite.id)) choices.push({ label: `⚔ Attack ${enemySite.name}`, attack: { site: enemySite.id } })
    return choices
  }
  // A Burrowing / Submerge unit's single-tap vertical move: dive or surface in place, then — if
  // the destination location holds enemies — offer the usual attack chooser (with Move only /
  // cancel). No enemies → it simply moves. (Square-clicking to change region still works too.)
  function verticalMove(u: UnitState, vdest: { x: number; y: number; region: Region }) {
    const path = findPath(st, u, vdest)
    if (!path) return
    const choices = attackChoicesAt(u, vdest)
    if (!choices.length) { send({ t: 'moveAttack', unitId: u.id, path }); setMode({ m: 'idle' }); return }
    setMode({ m: 'moveChoice', unitId: u.id, path, choices })
  }
  function openMoveChoice(attacker: UnitState, dest: Step, path: Step[], enemySite: any | null) {
    // where the attacker ENDS UP (its anchor) after the move — every square its
    // whole footprint will cover there is in reach. So an oversized unit can strike
    // ANY enemy (or enemy site) in a location it occupies AFTER the movement.
    const finalAnchor = path.length ? path[path.length - 1] : { x: attacker.x, y: attacker.y, region: attacker.region }
    const choices: { label: string; attack?: { unit: string } | { site: string }; path?: Step[]; pick?: string[] }[] =
      attackChoicesAt(attacker, { ...finalAnchor, region: (finalAnchor.region ?? dest.region) as Region }, enemySite)
    // region moves available at this square (burrow / submerge / re-surface): so a
    // Burrowing/Submerge unit standing on an enemy site can still choose to dive
    // instead of fight — the click no longer forces it underground/underwater.
    for (const loc of reachableLocations(st, attacker)) {
      if (loc.x !== dest.x || loc.y !== dest.y || loc.region === dest.region) continue
      const rp = findPath(st, attacker, loc)
      if (!rp) continue
      const label = loc.region === 'underground' ? '⛏ Burrow here' : loc.region === 'underwater' ? '🌊 Submerge here' : loc.region === 'surface' ? '🏔 Surface here' : '🌀 Into the void'
      choices.push({ label, path: rp })
    }
    if (choices.length === 0) {
      // nothing to fight over: just move (route-pick if the approach has alternatives)
      if (path.length) beginRouteSelection(attacker, path[path.length - 1], undefined)
      else setMode({ m: 'idle' })
      return
    }
    setMode({ m: 'moveChoice', unitId: attacker.id, path, choices })
  }

  /** A choice was picked in the move/attack chooser (⚔ Attack X / 🚶 Move only / dive). NOW —
   *  after the attack-or-move decision — pick the ROUTE if the approach has >1 route, then fire
   *  the deferred action along it (user's requested order: chooser first, route second). An
   *  in-place / single-route approach commits immediately (no extra prompt). `basePath` is the
   *  chooser's approach; region-move choices carry their own `path`. */
  function commitMoveChoice(
    unitId: string,
    choice: { attack?: { unit: string } | { site: string }; path?: Step[]; pick?: string[] },
    basePath: Step[],
  ) {
    const u = view.units[unitId]
    if (!u) { setMode({ m: 'idle' }); return }
    const path = choice.path ?? basePath
    const dest: Step = path.length ? path[path.length - 1] : { x: u.x, y: u.y, region: u.region }
    const after: MovePending | undefined =
      choice.pick && choice.pick.length > 1
        ? { kind: 'pick', candidates: choice.pick, name: view.units[choice.pick[0]]?.name ?? '' }
        : choice.attack
        ? { kind: 'attack', attack: choice.attack }
        : choice.pick
        ? { kind: 'attack', attack: { unit: choice.pick[0] } }
        : undefined
    // no route to choose (attack in place / already at dest) → commit at once; else route-pick.
    if (path.length === 0) { resolveRoute(u, dest, [], after); return }
    beginRouteSelection(u, dest, after)
  }



  // Accumulate picks for a chooseTargets prompt until `count` is reached, then
  // send them all at once. Single-target prompts (count 1) fire immediately.
  // Returns true if it consumed the click. Handles both units and artifacts.
  function pickPromptTarget(id: string): boolean {
    if (!(prompt && promptIsMine && prompt.kind === 'chooseTargets')) return false
    const cands: string[] | undefined = prompt.data?.candidates
    if (cands && !cands.includes(id)) return false // not a legal target
    const count = prompt.data?.count ?? 1
    const cur = mode.m === 'promptTargets' && mode.promptId === prompt.id ? mode.picked : []
    if (cur.includes(id)) {
      // click an already-picked target to deselect it
      const picked = cur.filter((x) => x !== id)
      setMode(picked.length ? { m: 'promptTargets', promptId: prompt.id, picked } : { m: 'idle' })
      return true
    }
    const picked = [...cur, id]
    if (picked.length >= count) {
      send({ t: 'prompt', promptId: prompt.id, choice: picked })
      setMode({ m: 'idle' })
    } else {
      setMode({ m: 'promptTargets', promptId: prompt.id, picked })
    }
    return true
  }

  function clickUnit(u: UnitState, ev: React.MouseEvent) {
    ev.stopPropagation()
    // FAQ view: no action panels — a click just shows the card's FAQ (also how mobile, which
    // has no hover, reads it). Works for spectators / off-turn too.
    if (faqView) { showHover(u.name); return }
    if (isSpectator) return
    // manual stepping: a chip covers its square, so clicking the mover (drawn at the cursor)
    // takes an in-place region step (burrow/submerge/surface); clicking a unit on a highlighted
    // neighbour steps there. Delegates to the same square-stepping the board uses.
    if (mode.m === 'manualMove') { manualStepTo(u.x, u.y); return }
    // pick-a-target follow-up: several same-name enemies were aggregated into one attack choice; click
    // the specific one to strike it (the move path was already decided when the choice was made).
    if (mode.m === 'pickTargetUnit') {
      if (mode.candidates.includes(u.id)) { send({ t: 'moveAttack', unitId: mode.unitId, path: mode.path, attack: { unit: u.id } }); setMode({ m: 'idle' }) }
      return
    }
    // caster picker: clicking one of the legal casters proceeds into the type routing
    // with that unit as THE caster (its location anchors region/'here'/'nearby'/grid).
    if (mode.m === 'chooseCaster') {
      if (mode.casters.includes(u.id)) beginCast(mode.cardId, u.id)
      return
    }
    // prompt target picking (damage allocation uses its own modal)
    if (prompt && promptIsMine && prompt.kind === 'chooseTargets') {
      // a unit sitting on a site would otherwise swallow the click — for a SITE prompt,
      // redirect it to the site beneath (so you can target sites with units atop them)
      if (prompt.data?.kind === 'site') {
        const s = Object.values(view.sites).find((st: any) => st.x === u.x && st.y === u.y && !st.isRubble)
        if (s) send({ t: 'prompt', promptId: prompt.id, choice: [(s as any).id] })
      } else if (!pickPromptTarget(u.id) && prompt.data?.kind === 'unitOrSite') {
        // a mixed unit-or-site prompt (breaking/moving Wards): if the clicked unit isn't a
        // candidate, fall through to a candidate site beneath it (a warded site under a minion)
        const s = Object.values(view.sites).find((st: any) => st.x === u.x && st.y === u.y && !st.isRubble)
        if (s && (prompt.data?.candidates?.includes((s as any).id) ?? false)) send({ t: 'prompt', promptId: prompt.id, choice: [(s as any).id] })
      }
      return
    }
    // conjuring an artifact: click a unit to HAND it over (carried) instead of
    // placing it on a site — your own unit, or any unit if it conjures to enemies
    if (mode.m === 'conjure') {
      const enemyOk = !!getScript(view.cards[mode.cardId]?.name ?? '')?.conjureToEnemy
      if (u.controller === me || enemyOk) {
        send({ t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId, extra: { giveTo: u.id } })
        setMode({ m: 'idle' })
      }
      return
    }
    if (mode.m === 'blowTarget') {
      if (!u.isAvatar) setMode({ m: 'blowOrigin', cardId: mode.cardId, casterId: mode.casterId, targetId: u.id })
      return
    }
    if (mode.m === 'magic' || mode.m === 'genesisTargets' || mode.m === 'promptTargets' || mode.m === 'abilityTargets') {
      const spec = currentSpec()
      // site-targeting spells (Craterize) must reach the site under a unit
      if (spec?.what === 'site') {
        const s = Object.values(view.sites).find((st: any) => st.x === u.x && st.y === u.y && !st.isRubble)
        if (s) pickTarget((s as any).id)
        return
      }
      // location/square-targeting effects (Sparkmage's spark, Ancient Dragon's breath…)
      // target a LOCATION, not a unit — a unit standing there would otherwise swallow the
      // click. Redirect it to the square beneath, so you can pick a location that happens
      // to be occupied. Sent WITHOUT a region to match the highlighted legal set (the
      // engine validates square targets region-agnostically), exactly like a bare-square click.
      if (spec?.what === 'square') {
        pickTarget(`sq:${u.x},${u.y}`)
        return
      }
      pickTarget(u.id)
      return
    }
    // Editor open: a plain click selects ANY unit (either player's, on any turn) for
    // editing — bypassing the normal move/attack interaction and the your-turn gate.
    // The Editor is a tabletop escape hatch (see judgePlace), so you can pick up an
    // opponent's minion, or your own during their turn, to resolve card text by hand.
    if (showJudge) {
      setMode(mode.m === 'unit' && mode.unitId === u.id ? { m: 'idle' } : { m: 'unit', unitId: u.id })
      return
    }
    if (mode.m === 'unit' && mode.unitId !== u.id) {
      const attacker = view.units[mode.unitId]
      if (attacker && u.controller !== me && canMoveAttack(attacker)) {
        // Move so the attacker's FOOTPRINT covers the enemy, then choose to attack it
        // (or the site / another unit there / just move). A multi-square attacker (2x2
        // or extra-body) hunts for the nearest reachable shift whose footprint covers
        // the enemy; a 1x1 simply moves onto the enemy's square.
        const multi = attacker.size === '2x2' || (attacker.extraSquares?.length ?? 0) > 0
        const targetMulti = u.size === '2x2' || (u.extraSquares?.length ?? 0) > 0
        // does the attacker's CURRENT footprint already overlap the target anywhere? A target that
        // occupies EVERY square (Yog-Sothoth) is already under any attacker → strike it in place.
        const coversInPlace = footprintAt(attacker, { x: attacker.x, y: attacker.y }).some((c) => occupies(u, c.x, c.y, attacker.region))
        let anchor: Step = { x: u.x, y: u.y, region: u.region }
        let path: Step[] | null
        if (coversInPlace || occupies(attacker, u.x, u.y, u.region)) {
          anchor = { x: attacker.x, y: attacker.y, region: attacker.region } // already covers it — attack in place
          path = []
        } else if (multi) {
          path = null
          for (const loc of reachableLocations(st, attacker)) {
            if (!footprintAt(attacker, loc).some((c) => occupies(u, c.x, c.y, (loc.region ?? attacker.region) as Region))) continue
            const p = findPath(st, attacker, loc)
            if (p) { anchor = loc; path = p; break }
          }
          if (path === null) path = findPath(st, attacker, anchor) // fallback: enemy square as the anchor
        } else {
          path = findPath(st, attacker, anchor)
          // a target that occupies MANY squares (Yog-Sothoth) may be unreachable at its head yet
          // reachable elsewhere — strike at the nearest square it occupies that we can reach.
          if (path === null && targetMulti) {
            for (const loc of reachableLocations(st, attacker)) {
              if (!occupies(u, loc.x, loc.y, (loc.region ?? attacker.region) as Region)) continue
              const p = findPath(st, attacker, loc)
              if (p) { anchor = loc; path = p; break }
            }
          }
        }
        if (path !== null) {
          // Attack CHOOSER first, route pick second (see openMoveChoice → commitMoveChoice):
          // a multi-step approach defers into the route picker once the player picks a choice.
          const siteHere = Object.values(view.sites).find(
            (s: any) => s.x === u.x && s.y === u.y && !s.isRubble && s.controller !== null && s.controller !== me,
          )
          openMoveChoice(attacker, anchor, path, siteHere ?? null)
        }
        return
      }
    }
    if (u.controller === me && myTurn) {
      setMode(mode.m === 'unit' && mode.unitId === u.id ? { m: 'idle' } : { m: 'unit', unitId: u.id })
    }
  }

  function clickSite(siteObj: any, ev: React.MouseEvent) {
    if (faqView) { showHover(siteObj.name); return } // FAQ view: show the ruling, no site panel
    if (isSpectator) return
    // caster picker: a spellcaster SITE (River of Flame, Merlin's Tower this turn) is a legal caster — pick it
    if (mode.m === 'chooseCaster') {
      if (mode.casters.includes(siteObj.id)) { ev.stopPropagation(); beginCast(mode.cardId, siteObj.id) }
      return
    }
    // manual stepping: a site image fills the square, so clicking a highlighted site steps
    // the mover onto it (same square-stepping the board and unit chips use).
    if (mode.m === 'manualMove') { ev.stopPropagation(); manualStepTo(siteObj.x, siteObj.y); return }
    // single-site aura (Castle's/Hamlet's Ablaze!): the site fills the square, so a site click places it
    if (mode.m === 'aura' && getScript(view.cards[mode.cardId]?.name ?? '')?.singleSiteAura) {
      ev.stopPropagation()
      const auraScript = getScript(view.cards[mode.cardId]?.name ?? '')
      const auraCaster = view.units[mode.casterId ?? avatar.id]
      const okPlace = !siteObj.isRubble && (!auraScript?.auraPlacement || (() => { try { return auraScript!.auraPlacement!(st, me, { x: siteObj.x, y: siteObj.y }, auraCaster) === null } catch { return false } })())
      if (okPlace) { send({ t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId ?? avatar.id, at: { x: siteObj.x, y: siteObj.y } }); setMode({ m: 'idle' }) }
      return
    }
    if (prompt && promptIsMine && prompt.kind === 'chooseTargets') {
      // Bless-style: candidates mix unit and site ids; kind is 'unit' but sites are legal.
      // Any site whose id appears in the candidate list is a valid pick.
      const cands: string[] | undefined = prompt.data?.candidates
      if (cands?.includes(siteObj.id)) {
        ev.stopPropagation()
        if (!pickPromptTarget(siteObj.id)) {
          // pickPromptTarget checks candidates — if it declines, fall through
        } else {
          return
        }
      } else if (prompt.data?.kind === 'site') {
        ev.stopPropagation()
        send({ t: 'prompt', promptId: prompt.id, choice: [siteObj.id] })
        return
      }
    }
    // board-square PROMPT (chooseSquare) whose candidate squares can hold SITES — "summon
    // nearby" (Adept Illusionist), Locusts, Bog… A site fills its whole square, so a click on the
    // site must ANSWER the prompt; otherwise it falls through to the move/attack logic below
    // whenever the ability's source unit is still selected (mode 'unit'). Mirrors clickSquare's
    // chooseSquare branch. (area2x2 picks use dedicated anchor markers, not site clicks.)
    if (prompt && promptIsMine && prompt.kind === 'chooseSquare' && !prompt.data?.area2x2 && !prompt.data?.edgeSelect) {
      const only = prompt.data?.squares as { x: number; y: number }[] | undefined
      if (!only || only.some((s) => s.x === siteObj.x && s.y === siteObj.y)) {
        ev.stopPropagation()
        send({ t: 'prompt', promptId: prompt.id, choice: { x: siteObj.x, y: siteObj.y } })
        return
      }
    }
    if (mode.m === 'magic' || mode.m === 'abilityTargets') {
      const spec = currentSpec()
      if (spec?.what === 'site') {
        ev.stopPropagation()
        pickTarget(siteObj.id)
        return
      }
    }
    // genesis site targets (Sinterfee) — cast the minion with the chosen site
    if (mode.m === 'genesisTargets') {
      ev.stopPropagation()
      send({ t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId, at: mode.at, targets: [...mode.picked, siteObj.id] })
      setMode({ m: 'idle' })
      return
    }
    // Editor open: a plain click selects ANY site for editing (either player's, any turn),
    // mirroring unit selection — the panel's Modify tab then shows this site's tools. NOT while
    // placing (judgePlace): a create-on-board click must fall through to clickSquare's placement.
    if (showJudge && mode.m !== 'judgePlace') {
      ev.stopPropagation()
      setMode(mode.m === 'site' && mode.siteId === siteObj.id ? { m: 'idle' } : { m: 'site', siteId: siteObj.id })
      return
    }
    if (mode.m === 'unit') {
      const attacker = view.units[mode.unitId]
      if (attacker && !canMoveAttack(attacker)) return // tapped / summoning-sick / disabled → no move or attack
      // Pathfinder: a click on an adjacent RUBBLE it can blaze over → confirm, then blaze (the
      // rubble is cleared and the new site laid). A rubble's sitecard captures the click here
      // rather than in clickSquare, so this mirrors the void branch there.
      if (attacker && siteObj.isRubble && pathfinderBlazeSpots(attacker).some((s) => s.x === siteObj.x && s.y === siteObj.y)) {
        ev.stopPropagation()
        setBlazeAsk({ unitId: attacker.id, x: siteObj.x, y: siteObj.y })
        return
      }
      // Move-to-attack must fire whenever the destination holds ANYTHING attackable —
      // an enemy SITE, or enemy UNITS standing on the square (even a site you control).
      // (Clicking anywhere in an occupied square hits the site card, so this path must
      // cover your-own-site-with-enemies-on-it, not just enemy sites.)
      const isEnemySite = siteObj.controller !== null && siteObj.controller !== me
      const enemyUnitsHere = unitsAt(st, siteObj.x, siteObj.y, 'surface').some((u) => u.controller !== me && !u.carriedBy)
      if (attacker && (isEnemySite || enemyUnitsHere)) {
        ev.stopPropagation()
        const siteTarget = isEnemySite ? siteObj : null // you can't attack your OWN site, but can attack enemies on it
        // a multi-square body (amoeba, Yog-Sothoth, oversized) that already covers
        // this square's SURFACE attacks in place — no move (its anchor may be elsewhere).
        if (occupies(attacker, siteObj.x, siteObj.y, 'surface')) {
          openMoveChoice(attacker, { x: siteObj.x, y: siteObj.y, region: 'surface' }, [], siteTarget)
          return
        }
        const here = attacker.x === siteObj.x && attacker.y === siteObj.y
        // Attacks happen on the SURFACE. When the attacker is on this square but BELOW
        // (burrowed / submerged) it EMERGES as part of the attack (findPath returns the
        // one-step emerge); if already on the surface the path is empty. Either way,
        // route straight to the attack prompt — never leave it stuck below.
        if (here) {
          const path = findPath(st, attacker, { x: siteObj.x, y: siteObj.y, region: 'surface' })
          if (path !== null) openMoveChoice(attacker, { x: siteObj.x, y: siteObj.y, region: 'surface' }, path, siteTarget)
          return
        }
        // Which regions can the attacker reach? Only a site's surface can be attacked;
        // underwater/underground can be entered to relocate or fight units there.
        const candidates: Region[] = ['surface', 'underwater', 'underground'] as Region[]
        const reach = candidates
          .map((region) => ({ region, path: findPath(st, attacker, { x: siteObj.x, y: siteObj.y, region }) }))
          .filter((r): r is { region: Region; path: Step[] } => r.path !== null)
        if (!reach.length) return
        if (reach.length === 1) {
          const { region, path } = reach[0]
          // Attack CHOOSER first, route pick second: openMoveChoice builds the choices, and a
          // multi-step choice defers into the route picker (commitMoveChoice).
          openMoveChoice(attacker, { x: siteObj.x, y: siteObj.y, region }, path, region === 'surface' ? siteTarget : null)
        } else {
          // reachable both above and below: the player picks the region first (moveRegion);
          // choosing the surface then proceeds to the attack prompt.
          setMode({ m: 'moveRegion', unitId: attacker.id, x: siteObj.x, y: siteObj.y, regions: reach.map((r) => r.region), siteId: isEnemySite ? siteObj.id : undefined })
        }
        return
      }
    }
    // select one of your own sites to reveal its activated abilities (Floodplain, etc.)
    if (myTurn && siteObj.controller === me && (mode.m === 'idle' || mode.m === 'site')) {
      const abilities = getScript(siteObj.name)?.abilities ?? []
      if (abilities.length) {
        ev.stopPropagation()
        setMode(mode.m === 'site' && mode.siteId === siteObj.id ? { m: 'idle' } : { m: 'site', siteId: siteObj.id })
        return
      }
    }
    // otherwise the click falls through to the square
  }

  // Click a loose ground artifact to pick it up with a friendly unit on that square.
  // a carried artifact (thumbnail on its bearer) can be a target too — Lord of Greed
  // snatching one of several copies, Telekinesis, etc. Only consume the click when it's
  // actually a legal artifact target; otherwise let it bubble to select the bearer.
  function clickCarriedArtifact(artId: string, ev: React.MouseEvent) {
    // Mimic summon: transform this carried carriable artifact into the Mimic (it materializes at
    // its carrier's square, under the caster's control, and is pulled off the carrier).
    const mimicArt = view.artifacts[artId] as any
    if (mode.m === 'summon' && getScript(view.cards[mode.cardId]?.name ?? '')?.summonTargetsCarriable && mimicArt && isCarriableArtifact(mimicArt.name)) {
      ev.stopPropagation()
      send({ t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId, at: { x: mimicArt.x, y: mimicArt.y, region: mimicArt.region }, extra: { mimicArtifact: artId } })
      setMode({ m: 'idle' })
      return
    }
    if (prompt && promptIsMine && prompt.kind === 'chooseTargets' && (prompt.data?.candidates?.includes(artId) ?? false)) {
      ev.stopPropagation(); pickPromptTarget(artId); return
    }
    if ((mode.m === 'magic' || mode.m === 'abilityTargets') && (currentSpec()?.what === 'artifact' || currentSpec()?.what === 'minionOrArtifact')) {
      ev.stopPropagation(); pickTarget(artId); return
    }
    // Editor open: select this carried artifact for editing (its Modify tools appear). NOT while placing.
    if (showJudge && mode.m !== 'judgePlace') { ev.stopPropagation(); setMode(mode.m === 'artifact' && mode.artifactId === artId ? { m: 'idle' } : { m: 'artifact', artifactId: artId }); return }
    // not targeting → don't stop propagation; the bearer's chip handles the click
  }

  function clickGroundArtifact(a: any, ev: React.MouseEvent) {
    ev.stopPropagation()
    // Mimic summon: transform this carriable artifact into the Mimic — summon at its exact
    // location+region under the caster's control, consuming it.
    if (mode.m === 'summon' && getScript(view.cards[mode.cardId]?.name ?? '')?.summonTargetsCarriable && isCarriableArtifact(a.name)) {
      send({ t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId, at: { x: a.x, y: a.y, region: a.region }, extra: { mimicArtifact: a.id } })
      setMode({ m: 'idle' })
      return
    }
    // if a target prompt wants this artifact (e.g. Swap), pick it as a target
    if (prompt && promptIsMine && prompt.kind === 'chooseTargets' && pickPromptTarget(a.id)) return
    // a spell/ability targeting an artifact (Telekinesis): pick it as the target
    if ((mode.m === 'magic' || mode.m === 'abilityTargets') && (currentSpec()?.what === 'artifact' || currentSpec()?.what === 'minionOrArtifact')) {
      pickTarget(a.id)
      return
    }
    // caster picker: a spellcaster artifact (Omphalos) is a legal caster — pick it
    if (mode.m === 'chooseCaster') {
      if (mode.casters.includes(a.id)) beginCast(mode.cardId, a.id)
      return
    }
    // Editor open: select ANY ground artifact for editing, mirroring unit/site selection.
    // NOT while placing (judgePlace) — the click must reach the square beneath.
    if (showJudge && mode.m !== 'judgePlace') {
      setMode(mode.m === 'artifact' && mode.artifactId === a.id ? { m: 'idle' } : { m: 'artifact', artifactId: a.id })
      return
    }
    if (isSpectator || !myTurn) return
    // a standalone artifact you control that has activated abilities (Cradle of
    // Etherrum, Hemogoblet, Pile of Skulls): select it to reveal/activate them
    if (a.conjuredBy === me && !a.carriedBy && (getScript(a.name)?.abilities?.length ?? 0) > 0) {
      setMode(mode.m === 'artifact' && mode.artifactId === a.id ? { m: 'idle' } : { m: 'artifact', artifactId: a.id })
      return
    }
    if (!isCarriableArtifact(a.name)) return // Monuments/Automatons are immovable — never pick them up
    const here = Object.values(view.units).filter(
      (u: any) => u.controller === me && u.x === a.x && u.y === a.y && u.region === a.region && !u.carriedBy,
    ) as UnitState[]
    if (!here.length) return // need a unit on the square to pick it up
    // prefer the currently-selected unit, else one that hasn't picked up yet this turn
    const sel = mode.m === 'unit' ? here.find((u) => u.id === mode.unitId) : undefined
    const chosen = sel ?? here.find((u: any) => !(u.usedThisTurn?.['pickup'] >= 1)) ?? here[0]
    send({ t: 'pickUp', unitId: chosen.id, artifactIds: [a.id] })
  }

  // ---- casting from hand ----

  function currentSpec() {
    if (mode.m === 'abilityTargets') return mode.specs[mode.picked.length] ?? null
    if (mode.m !== 'magic') return null
    const name = view.cards[mode.cardId]?.name
    const script = name ? getScript(name) : null
    const specs = script?.targets ?? []
    return specs[mode.picked.length] ?? null
  }

  function pickTarget(ref: string) {
    if (mode.m === 'abilityTargets') {
      const picked = [...mode.picked, ref]
      if (picked.length >= mode.specs.reduce((a: number, s2: any) => a + s2.count, 0)) {
        send({ t: 'activate', sourceId: mode.sourceId, ability: mode.abilityKey, targets: picked })
        setMode({ m: 'idle' })
      } else {
        setMode({ ...mode, picked })
      }
      return
    }
    if (mode.m !== 'magic') return
    const name = view.cards[mode.cardId]?.name
    const script = name ? getScript(name) : null
    const specs = script?.targets ?? []
    const picked = [...mode.picked, ref]
    if (picked.length >= specs.reduce((a, s2) => a + s2.count, 0)) {
      // "printed area" damage spells whose area is now fully determined by the chosen
      // targets get a final-confirmation panel before the cast is actually sent.
      const params = name ? areaParamsFromTargets(name, picked) : null
      const commit: Action = { t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId, targets: picked }
      if (params && tryAreaConfirm(name!, mode.casterId, params, commit)) return
      send(commit)
      setMode({ m: 'idle' })
    } else {
      setMode({ ...mode, picked })
    }
  }



  function castWithTargets(cardId: string, casterId: string, at: { x: number; y: number; region?: Region }) {
    const name = view.cards[cardId]?.name
    const script = name ? getScript(name) : null
    const gt = script?.genesisTargets ?? []
    if (gt.length === 0) {
      send({ t: 'castSpell', cardId, casterId, at })
      setMode({ m: 'idle' })
      return
    }
    // optional single genesis target: cast immediately without it via the skip button,
    // or click a unit right after — v1 keeps it simple and asks via window.confirm-free UI:
    setMode({ m: 'genesisTargets', cardId, casterId, at, picked: [] })
  }

  function clickHandCard(cardId: string) {
    if (faqView) { showHover(view.cards[cardId]?.name ?? null); return } // FAQ view: show the ruling
    if (isSpectator || !myTurn) return
    const name = view.cards[cardId]?.name
    if (!name) return
    const def = findCard(name)
    if (!def) return
    if (def.type === 'Site') {
      // Avatar of Fire: fire sites in hand may also be cast as Fireballs. The morph is
      // an avatar ability, so the avatar is the caster (no picker for sites).
      const morph = spellMorphName(st, me, name)
      const castable = morph ? canCast(st, me, cardId, avatar.id).ok : false
      if (castable && !avatar.tapped) {
        setMode({ m: 'siteOrSpell', cardId, morph: morph!, casterId: avatar.id })
        return
      }
      if (castable && avatar.tapped) {
        startMorphCast(cardId, morph!, avatar.id)
        return
      }
      if (avatar.tapped) return
      // avatars without the standard site action (Pathfinder) can't play a site from
      // hand — they play the topmost atlas site via their own ability instead
      if (getScript(avatar.name)?.noStandardSiteAction) return
      setMode({ m: 'placeSite', cardId })
      return
    }
    // Animist avatar: a magic in hand can either be cast normally or animated into a
    // Spirit (power = cost) via the avatar's `animate` ability. Only magics get the
    // choice — minions/artifacts/auras behave exactly as before. (Imposter masked as
    // Animist is covered too, once it grants `animate`.)
    if (def.type === 'Magic' && avatarHasAnimate) {
      setMode({ m: 'animistChoice', cardId })
      return
    }
    beginNormalCast(cardId)
  }

  // Map the picked cast-time target refs of a target-based area spell into the
  // preview's parameter bag. Square refs are 'sq:x,y'; site refs are site ids.
  // Returns null for spells that don't take their area from targets (those are
  // confirmed via the direction-prompt path instead).
  function areaParamsFromTargets(name: string, picked: string[]): AreaDamageParams | null {
    const asSquare = (ref: string): { x: number; y: number } | null => {
      const m = /^sq:(\d+),(\d+)$/.exec(ref)
      return m ? { x: Number(m[1]), y: Number(m[2]) } : null
    }
    if (name === 'Major Explosion') {
      const at = asSquare(picked[0])
      return at ? { at } : null
    }
    if (name === 'Craterize') return { sites: [picked[0]] }
    if (name === 'Meteor Shower') return { sites: picked.slice(0, 3) }
    return null
  }

  // "Printed area" damage spells get a final-confirmation panel: compute the exact
  // damage grid for the chosen parameters and, if it resolves to something, overlay
  // it on the board (big element-tinted numbers) with Cast/Cancel — the real action
  // (`commit`) is held until the player confirms. Returns true if the panel opened
  // (the caller must NOT send yet); false if there's no area to preview (send as usual).
  function tryAreaConfirm(name: string, casterId: string, params: AreaDamageParams, commit: Action): boolean {
    const prev = areaDamagePreview(st, name, casterId, params)
    if (!prev) return false
    setMode({ m: 'areaConfirm', name, element: prev.element, cells: prev.cells, commit })
    return true
  }

  // Direction/edge-prompt area spells (Lava Flow, Cone of Flame, Firebreathing,
  // Flame Wave, Burning Hands, Day of Judgment) resolve their area inside an engine
  // continuation. When the player answers the FINAL directional prompt, intercept it:
  // assemble the same parameter bag the cont consumes (prompt.ctx carries the earlier
  // choices; sourceId is the caster) and show the confirm panel — on confirm we send
  // the held prompt answer. Returns true if the panel opened. Non-final prompts (the
  // first of a two-step pick) and non-area prompts return false → answered normally.
  function tryAreaConfirmFromPrompt(prompt: any, choice: any): boolean {
    const m = /^script:(.+):([^:]+)$/.exec(prompt.cont ?? '')
    if (!m) return false
    const name = m[1]
    const contKey = m[2]
    const c = prompt.ctx ?? {}
    const casterId: string = c.sourceId ?? ''
    let params: AreaDamageParams | null = null
    if (name === 'Lava Flow' && contKey === 'flow') params = { direction: choice }
    else if (name === 'Firebreathing' && contKey === 'breath') params = { direction: choice }
    else if (name === 'Cone of Flame' && contKey === 'lean') params = { direction: c.dir, lean: choice }
    else if (name === 'Flame Wave' && contKey === 'wave') params = { edge: choice }
    else if (name === 'Burning Hands' && contKey === 'hand2') params = { direction: c.d1, direction2: choice }
    else if (name === 'Day of Judgment' && contKey === 'judge') params = { at: c.origin, direction: choice }
    if (!params) return false
    return tryAreaConfirm(name, casterId, params, { t: 'prompt', promptId: prompt.id, choice })
  }

  // The player chooses the caster. Gate castability on "any legal caster exists"
  // (not just the avatar): a spell the avatar can't cast but a controlled unit can
  // must still be startable. If exactly one legal caster exists, proceed straight
  // into the flow (preserving today's single-caster behaviour). If more than one,
  // ask WHO casts it — clicking a candidate then threads that caster through.
  function beginNormalCast(cardId: string) {
    const casters = legalCasters(cardId)
    if (casters.length === 0) return
    if (casters.length > 1) {
      setMode({ m: 'chooseCaster', cardId, casters })
      return
    }
    beginCast(cardId, casters[0])
  }

  // Route a hand SPELL into its type-specific flow with the chosen caster threaded
  // through. Shared by the single-caster fast path and the caster picker.
  function beginCast(cardId: string, casterId: string) {
    const name = view.cards[cardId]?.name
    if (!name) return
    const def = findCard(name)
    if (!def) return
    if (def.type === 'Minion') setMode({ m: 'summon', cardId, casterId })
    else if (def.type === 'Artifact') setMode({ m: 'conjure', cardId, casterId })
    else if (def.type === 'Aura') setMode({ m: 'aura', cardId, casterId })
    else if (def.type === 'Magic') {
      const script = getScript(name)
      const specs = script?.targets ?? []
      if (name === 'Chaos Twister') {
        setMode({ m: 'blowTarget', cardId, casterId })
      } else if (script?.shootsProjectile) {
        setMode({ m: 'shoot', unitId: cardId, casterId }) // direction picker; unitId holds cardId
      } else if (specs.length === 0) {
        send({ t: 'castSpell', cardId, casterId })
        setMode({ m: 'idle' }) // clear the picker (no-op when already idle on the fast path)
      } else {
        setMode({ m: 'magic', cardId, casterId, picked: [] })
      }
    }
  }

  function startMorphCast(cardId: string, morph: string, casterId: string) {
    if (getScript(morph)?.shootsProjectile) {
      setMode({ m: 'shoot', unitId: cardId, casterId })
      return
    }
    const specs = getScript(morph)?.targets ?? []
    if (specs.length === 0) {
      send({ t: 'castSpell', cardId, casterId })
      setMode({ m: 'idle' })
    } else {
      setMode({ m: 'magic', cardId, casterId, picked: [] })
    }
  }

  // caster-locked hand card (Morgana/Omphalos/Gabriel, or a loaded collection cast):
  // which caster must cast it, and can it still be cast (caster alive + mine)?
  function castLock(cardId: string): { name: string; alive: boolean } | null {
    const lock = ((view as any).flow?.lockedCards ?? []).find((e: any) => e.cardId === cardId)
    if (!lock) return null
    const u = view.units[lock.casterId]
    const a = (view.artifacts as any)[lock.casterId]
    let alive = false
    if (u) alive = u.controller === me && !isDisabled(st, u)
    else if (a) alive = (a.carriedBy ? view.units[a.carriedBy]?.controller : a.conjuredBy) === me
    return { name: (u?.name ?? a?.name ?? lock.casterName ?? '') as string, alive }
  }
  // a spell sealed in your hand by a Pith-Imp-style thief: shows the thief's
  // miniature (like a caster lock) and is greyed out (you can't cast it)
  function stolenLock(cardId: string): { name: string } | null {
    const s = ((view as any).flow?.stolen ?? []).find((e: any) => e.cardId === cardId)
    if (!s) return null
    const thief = view.units[s.unitId]
    if (!thief) return null // thief gone → seal lifted
    return { name: thief.name }
  }

  // genesis target flow: click a unit while in genesisTargets mode
  function clickUnitForGenesis(u: UnitState) {
    if (mode.m !== 'genesisTargets') return false
    const picked = [...mode.picked, u.id]
    send({ t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId, at: mode.at, targets: picked })
    setMode({ m: 'idle' })
    return true
  }

  // ---- render ----

  const flip = me === 1 // player 1 sees the board rotated
  // Yog-Sothoth washes the WHOLE realm with a crop of its art while ANY copy is in play — purely
  // graphical (a single wash regardless of how many), gone the moment none remain in the realm.
  const yogImg = (Object.values(view.units) as UnitState[]).some((u) => u.name === 'Yog-Sothoth')
    ? (() => { const cdn = getCard('Yog-Sothoth')?.img; return cdn ? `/cards/${cdn.split('/').pop()!.replace(/\.png$/, '.webp')}` : null })()
    : null
  const rows = [...Array(GRID_H).keys()]
  const cols = [...Array(GRID_W).keys()]

  // CSS position of an intersection marker for a 2x2 block anchored at top-left (x,y):
  // its four squares' shared corner. Same math the aura-anchor markers use, so the
  // Earthquake area picker and oversized-minion placement share the auras' selector.
  const MARKER_S = 24
  const markerStyle = (x: number, y: number): React.CSSProperties => {
    const cx = flip ? GRID_W - 1 - x : x + 1
    const ry = flip ? y + 1 : GRID_H - 1 - y
    return {
      position: 'absolute',
      left: cx * (SQ_W + GAP) - GAP / 2 - MARKER_S / 2,
      top: ry * (SQ_H + GAP) - GAP / 2 - MARKER_S / 2,
      width: MARKER_S, height: MARKER_S, zIndex: 9,
    }
  }

  // drag the mulligan modal by its header, so it can be shoved aside to reveal the
  // board underneath (e.g. Harbinger portent sites). Tracks an offset from center.
  function startMullDrag(e: React.PointerEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const base = mullPos ?? { x: 0, y: 0 }
    const panel = (e.currentTarget as HTMLElement).closest('.modal') as HTMLElement | null
    const startTop = panel ? panel.getBoundingClientRect().top : 0
    const onMove = (ev: PointerEvent) => {
      const s = dragScale.current || 1
      const y = clampDragTop(panel, startTop, base.y, base.y + (ev.clientY - startY) / s, s)
      setMullPos({ x: base.x + (ev.clientX - startX) / s, y })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <div ref={gameRef} className={`game ${mobile ? 'mobile' : 'scaled'} ${mobile && handOpen ? 'hand-open' : ''} ${mobile && logsOpen ? 'logs-open' : ''}`} onMouseLeave={() => showHover(null)}
      style={mobile
        ? { transform: `scale(${uiScale})`, transformOrigin: 'center center' }
        : {
            transform: `translate(-50%, -50%) scale(${uiScale})`, transformOrigin: 'center center',
            // fill the viewport: dynamic width (matches aspect), fixed design height. Three
            // columns: left action rail | board (pinned to its own width so it stays flush,
            // no lateral padding) | sidebar (1fr, takes the rest).
            width: designW, height: DESKTOP_DESIGN_H, columnGap: COL_GAP,
            // board column = board width + a gap + a reserved scrollbar gutter (the column
            // scrolls vertically). The board is left-aligned in the column (see .boardscaler CSS)
            // so the gap sits between the board's right edge and the scrollbar.
            gridTemplateColumns: `${RAIL_W}px ${GRID_W * (SQ_W + GAP) * boardScale + BOARD_SCROLL_GAP + SCROLLBAR_W}px 1fr`,
            // exact board width, exposed so the player bars + hand row match the board and stop
            // where the grid stops (they'd otherwise stretch across the scroll gutter).
            ['--board-w' as any]: `${GRID_W * (SQ_W + GAP) * boardScale}px`,
          }}>
      <header className="topbar">
        {/* mobile: the two clickable player-info bars live in the top bar */}
        {mobile ? (
          <>
            <PlayerBar view={view} pid={(1 - me) as PlayerId} isMe={false} active={view.activePlayer === (1 - me)}
              onZone={(zone) => setZoneView({ pid: (1 - me) as PlayerId, zone })} onInfo={() => setBarInfo((1 - me) as PlayerId)}
              clockMs={clockShown ? clockShown[(1 - me) as PlayerId] : null} clockRunning={clockRunSeat === (1 - me)}
              onAddTime={clockShown ? () => setAddTimeOpen(true) : undefined} onHover={showHover} />
            <PlayerBar view={view} pid={me} isMe active={view.activePlayer === me}
              onZone={(zone) => setZoneView({ pid: me, zone })} onInfo={() => setBarInfo(me)}
              clockMs={clockShown ? clockShown[me] : null} clockRunning={clockRunSeat === me} onHover={showHover} onCastTop={castCultTop} />
          </>
        ) : (
          <span>
            Turn {view.turn} — <b>{view.players[view.activePlayer].name}</b> ({view.phase})
            {session.roomCode ? ` · room ${session.roomCode.slice(0, 8)}` : ''}
            {session.kind === 'hotseat' ? ` · viewing as ${myPlayer.name}` : ''}
          </span>
        )}
        {view.phase !== 'over' && (
          <span className={`turnpill ${!isSpectator && view.activePlayer === me ? 'mine' : 'theirs'}`}>
            {!isSpectator && view.activePlayer === me ? '▶ Your turn' : `▶ ${view.players[view.activePlayer].name}'s turn`}
            {view.interject && (view.interject.player === me ? ' · you interject' : ` · ${view.players[view.interject.player].name} interjects`)}
          </span>
        )}
        {/* DESKTOP: the action buttons move to the left rail (.d-leftmenu); the top bar shows a
            keyboard-shortcut legend (left-aligned) instead. MOBILE: icons live in .m-leftmenu and
            End turn/Leave stay in the top bar. */}
        {!mobile ? (
          <>
            <span className="kbdhints" title="Keyboard shortcuts">
              <span><kbd>W</kbd> skip</span>
              <span><kbd>E</kbd> editor</span>
              <span><kbd>S</kbd> subsurface</span>
              <span><kbd>A</kbd> collection</span>
              <span><kbd>C</kbd> cemetery</span>
              <span><kbd>X</kbd> foe cem.</span>
              <span><kbd>D</kbd> step bot</span>
              <span><kbd>Q</kbd> symbols</span>
              <span><kbd>F</kbd> faq</span>
              <span><kbd>Z</kbd> subtypes <kbd>←</kbd><kbd>→</kbd></span>
              <span><kbd>⌫</kbd> undo</span>
              <span><kbd>⏎</kbd> confirm</span>
              <span><kbd>+</kbd><kbd>−</kbd> zoom · <kbd>0</kbd> reset · <kbd>↑↓←→</kbd> pan</span>
            </span>
            <span className="spacer" />
          </>
        ) : (
          <>
            <span className="spacer" />
            {!isSpectator && view.phase !== 'over' && (
              <button className="tb-endturn" disabled={!myTurn && view.interject?.player !== me} onClick={() => send({ t: 'endTurn' })}>End turn</button>
            )}
            {isSpectator && <button onClick={onLeave}>Leave</button>}
          </>
        )}
      </header>

      {/* DESKTOP: square icon+label action tiles down the left rail (mirrors the mobile menu). */}
      {!mobile && (
        <nav className="d-leftmenu">
          <button className={`railbtn ${subView ? 'selected' : ''}`} title="Toggle subsurface view (S)" onClick={() => setSubView(!subView)}>
            <span className="ri">⛏</span><span className="rl">Subsurface</span>
          </button>
          {!isSpectator && (
            session.kind === 'online' && !session.editorAllowed ? (
              <button className="railbtn" title="Editing the shared game state needs your opponent's permission (E)"
                onClick={() => { session.requestEditor?.(); setEditorAsked(true) }}>
                <span className="ri">✎</span><span className="rl">{editorAsked ? 'Asked…' : 'Editor 🔒'}</span>
              </button>
            ) : (
              <button className={`railbtn ${showJudge ? 'selected' : ''}`} title="Editor (E)" onClick={() => setShowJudge(!showJudge)}>
                <span className="ri">✎</span><span className="rl">Editor</span>
              </button>
            )
          )}
          <button className={`railbtn ${showSymbols ? 'selected' : ''}`} title="What do the symbols mean? (Q)" onClick={() => setShowSymbols((v) => !v)}>
            <span className="ri">❔</span><span className="rl">Symbols</span>
          </button>
          <button className={`railbtn ${faqView ? 'selected' : ''}`} title="FAQ view — cards with official rulings glow gold; hover to read them (F)" onClick={toggleFaq}>
            <span className="ri">📖</span><span className="rl">FAQ</span>
          </button>
          <button className={`railbtn ${stView ? 'selected' : ''}`} title="Subtype view — pick a subtype (Spellcasters, Evil, Beasts, Deserts…); its cards glow, all else dims. Z to toggle, ←/→ to cycle" onClick={toggleSubtype}>
            <span className="ri">🏷</span><span className="rl">Subtypes</span>
          </button>
          {!isSpectator && view.phase !== 'over' && (
            <>
              {session.requestUndo && (
                <button className="railbtn" title="Ask to roll back the last action (Backspace)" onClick={() => session.requestUndo!()}>
                  <span className="ri">↩</span><span className="rl">Undo</span>
                </button>
              )}
              {view.activePlayer !== me && view.phase === 'main' && !view.interject && !prompt && view.turn >= 2 && (
                <button className="railbtn" title="Ask to take some forgotten actions" onClick={() => send({ t: 'requestInterject' })}>
                  <span className="ri">✋</span><span className="rl">Wait!</span>
                </button>
              )}
              {view.interject?.player === me && (
                <button className="railbtn selected" title="Resume their turn" onClick={() => send({ t: 'endInterject' })}>
                  <span className="ri">✅</span><span className="rl">Done</span>
                </button>
              )}
              <button className="railbtn danger" title="Concede the game" onClick={() => setConfirmConcede(true)}>
                <span className="ri">🏳</span><span className="rl">Concede</span>
              </button>
              <button className="railbtn railturn" title="End your turn" disabled={!myTurn && view.interject?.player !== me} onClick={() => send({ t: 'endTurn' })}>
                <span className="ri">▶</span><span className="rl">End turn</span>
              </button>
            </>
          )}
          {isSpectator && (
            <button className="railbtn" onClick={onLeave}><span className="ri">🚪</span><span className="rl">Leave</span></button>
          )}
        </nav>
      )}

      {/* MOBILE: icon-only action menu down the left edge */}
      {mobile && !isSpectator && (
        <nav className="m-leftmenu">
          <button title="Subsurface" className={subView ? 'selected' : ''} onClick={() => setSubView(!subView)}>⛏</button>
          {session.kind === 'online' && !session.editorAllowed ? (
            <button title="Editor (needs opponent's OK)" onClick={() => { session.requestEditor?.(); setEditorAsked(true) }}>✎</button>
          ) : (
            <button title="Editor" className={showJudge ? 'selected' : ''} onClick={() => setShowJudge(!showJudge)}>✎</button>
          )}
          {session.requestUndo && view.phase !== 'over' && (<button title="Undo" onClick={() => session.requestUndo!()}>↩</button>)}
          <button title="What do the symbols mean?" className={showSymbols ? 'selected' : ''} onClick={() => setShowSymbols((v) => !v)}>❔</button>
          <button title="FAQ view — tap a glowing card to read its rulings" className={faqView ? 'selected' : ''} onClick={toggleFaq}>📖</button>
          <button title="Subtype view — a subtype's cards glow, all else dims (tap to open, use the top bar to pick)" className={stView ? 'selected' : ''} onClick={toggleSubtype}>🏷</button>
          <button title="Log" className={logsOpen ? 'selected' : ''} onClick={() => setLogsOpen((v) => !v)}>📜</button>
          {view.activePlayer !== me && view.phase === 'main' && !view.interject && !prompt && view.turn >= 2 && (
            <button title="Wait, I forgot!" onClick={() => send({ t: 'requestInterject' })}>✋</button>
          )}
          {view.interject?.player === me && (<button title="Done — resume their turn" className="selected" onClick={() => send({ t: 'endInterject' })}>✅</button>)}
          {/* vs-computer: fast (auto) / slow (step-through) as two icon buttons */}
          {botControl && view.phase !== 'over' && (<>
            <button title="Computer plays automatically (fast)" className={!botControl.stepMode ? 'selected' : ''} onClick={botControl.onAuto}>⏩</button>
            <button
              title={botControl.stepMode ? (botControl.canAdvance ? 'Next computer action' : 'Stepping — waiting on you') : 'Step through the computer’s turns (slow)'}
              className={botControl.stepMode ? 'selected' : ''}
              onClick={() => { if (!botControl.stepMode) botControl.onStep(); else if (botControl.canAdvance) botControl.onNext() }}
            >{botControl.stepMode && botControl.canAdvance ? '⏭' : '⏸'}</button>
          </>)}
          {view.phase !== 'over' && (<button title="Concede" className="danger flag" onClick={() => setConfirmConcede(true)}>🏳</button>)}
        </nav>
      )}

      {/* MOBILE: the hand toggle floats at the centre bottom (over the board) */}
      {mobile && !isSpectator && view.phase !== 'mulligan' && (
        <button className={`m-hand-btn ${handOpen ? 'selected' : ''}`} onClick={() => setHandOpen((v) => !v)}>
          🂠 {myPlayer.hand.filter((id: string) => id !== 'hidden').length}
        </button>
      )}

      {/* MOBILE: the log as a toggleable overlay panel */}
      {mobile && logsOpen && (
        <div className="m-logs">
          <div className="m-logs-head"><b>Log</b><button onClick={() => setLogsOpen(false)}>✕</button></div>
          <div className="log">
            {view.log.slice(-60).map((e, i) => (<div key={i} className="logline"><LogLine msg={e.msg} onPick={setHover} /></div>))}
          </div>
        </div>
      )}

      {view.phase === 'over' && (
        <div className="gameover">
          <h2>{view.winner !== null
            ? (view.players[view.winner].name === 'You' ? 'You win!' : `${view.players[view.winner].name} wins!`)
            : view.draw ? "It's a draw! Both Avatars fell at once." : 'Game over'}</h2>
          {session.kind === 'online' && session.rematchDeadline != null && session.rematchVote && (
            <RematchPrompt
              deadline={session.rematchDeadline}
              you={!!session.rematchYou}
              opp={!!session.rematchOpp}
              onVote={session.rematchVote}
            />
          )}
          <button onClick={onLeave}>Back to menu</button>
        </div>
      )}

      {/* concede confirmation — it immediately hands the win to the opponent */}
      {confirmConcede && (
        <div className="modal confirm-concede">
          <h3>Concede this game?</h3>
          <p>You'll forfeit — your opponent wins immediately.</p>
          <div className="confirm-actions">
            <button data-confirm="1" className="danger" onClick={() => { setConfirmConcede(false); send({ t: 'concede' }) }}>🏳 Concede</button>
            <button data-cancel="1" onClick={() => setConfirmConcede(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* gift extra time to your opponent's chess clock (click their ⏱) */}
      {addTimeOpen && (
        <div className="modal confirm-concede">
          <h3>Give {opp.name} extra time?</h3>
          <p>Add time to your opponent's clock.</p>
          <div className="confirm-actions">
            {[['+30s', 30_000], ['+1 min', 60_000], ['+2 min', 120_000], ['+5 min', 300_000]].map(([label, ms]) => (
              <button key={label} onClick={() => { setAddTimeOpen(false); send({ t: 'addTime', player: (1 - me) as PlayerId, ms: ms as number }) }}>{label}</button>
            ))}
            <button onClick={() => setAddTimeOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* GUI symbol legend (❔ Symbols button / Q) — explains the badges drawn on units & sites */}
      {showSymbols && (
        <div className="modal symbols-modal">
          <div className="sym-head">
            <h3>What the symbols mean</h3>
            <button data-confirm="1" onClick={() => setShowSymbols(false)}>✕ Close</button>
          </div>
          <div className="sym-grid">
            {([
              ['🪽', 'Airborne', 'Flies — ignores ground obstacles; only Airborne or Ranged units can strike it.'],
              ['🗡', 'Lethal', 'Any damage it deals — a strike, ranged shot or ability — destroys the unit it hits, whatever that unit’s life.'],
              ['🏹', 'Ranged', 'Strikes a unit up to its Ranged distance away, taking no counter-strike. The number is its range.'],
              ['🌀', 'Summoning sickness', 'Entered this turn — can’t move or attack yet.'],
              ['👁', 'Stealth', 'Can’t be attacked or targeted by foes until it acts or is revealed.'],
              ['🛡', 'Ward', 'Damage prevention (once). The next time it would take damage — INCLUDING a combat strike — or be destroyed, or be targeted by an enemy spell/ability, that is prevented and the Ward breaks instead. Simultaneous strikes (e.g. several defenders) are all prevented by the one Ward. Also shown on warded sites; Evil minions can’t be warded.'],
              [<EvilIcon key="d" />, 'Branded evil', 'Counts as an Evil minion — Demon/Undead/Monster or branded (for Evil-only effects, sites, thresholds). The Subtype view (Z) can highlight all Evil creatures (among other subtypes).'],
              ['🧺', 'Being carried', 'Riding inside or atop another unit.'],
              ['🐎', 'Carrying', 'Transporting another unit.'],
              ['🎭', 'Masked', 'An Imposter wearing another avatar’s face.'],
              ['🚫', 'Disabled', 'Loses all abilities AND can’t act (move / attack / tap). Badge on the unit, which is also greyed.'],
              ['🤐', 'Silenced', 'Its abilities are removed — but unlike Disabled it can still act. Badge shown on units, sites and artifacts.'],
              ['↺', 'Tapped', 'Rotated 90° — already acted or used its tap ability this turn.'],
              ['⚔ ❤', 'Power / Life', 'A minion shows power(-damage)/defence; an avatar shows ❤life ⚔power. Power is also its life.'],
              ['🔺', 'Thresholds', 'Elemental thresholds from your sites (Air/Earth/Fire/Water) — needed to cast.'],
              ['⛏ 🌊 🏔', 'Region', 'Underground (Burrow) / underwater (Submerge) / surface — where a unit sits or moves.'],
              ['◵', 'Aura / buff', 'Coloured rings mark a unit under an aura or a temporary effect.'],
              ['×N', 'Count', 'A stack — copies in your collection, or items a unit carries.'],
            ] as [React.ReactNode, string, string][]).map(([sym, name, desc]) => (
              <div key={name} className="sym-row">
                <span className="sym-ic">{sym}</span>
                <span className="sym-txt"><b>{name}</b><span>{desc}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* top-center log toasts: recent log lines flash briefly then fade (additive to the log sidebar) */}
      {toasts.length > 0 && (
        <div className="logtoasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="logtoast">{t.msg}</div>
          ))}
        </div>
      )}

      {/* big pop-up when the opponent plays a card into the realm. While a cast reveal is
          animating on the board, it slides to the side so it doesn't cover the golden
          caster / red sites / numbered grid (it shows the SAME card, so keeping it visible
          off to the side is ideal). */}
      {bigPops.length > 0 && (
        <div className={`oppplay-stack ${areaFx ? 'aside' : ''}`}>
          {bigPops.map((bp) => (
            <OppPlayPopup key={bp.n} name={bp.name} onClose={() => setBigPops((prev) => prev.filter((p) => p.n !== bp.n))} />
          ))}
        </div>
      )}

      {/* pre-game "VS" splash: both avatars + player names, shown as the game opens (turn 1),
          click / tap to skip, auto-dismiss after ~4s. Fixed full-screen (covers the mobile frame). */}
      {introVs && (() => {
        const p0 = view.players[0]; const p1 = view.players[1]
        const av0 = view.units[p0.avatarUnitId]?.name
        const av1 = view.units[p1.avatarUnitId]?.name
        return (
          <div className="pregame-vs" data-pregame-vs onClick={() => setIntroVs(false)} title="Click to skip">
            <div className="pv-side pv-left">
              {av0 && <CardImg name={av0} className="pv-avatar" />}
              <div className="pv-name">{p0.name}</div>
            </div>
            <div className="pv-vs">VS</div>
            <div className="pv-side pv-right">
              {av1 && <CardImg name={av1} className="pv-avatar" />}
              <div className="pv-name">{p1.name}</div>
            </div>
          </div>
        )
      })()}

      {/* Rip animation (Erik's Curiosa): a big card tears in two, centre-screen, both players see it */}
      {ripFx && (
        <div className="rip-overlay" key={`rip${ripFx.id}`} data-rip aria-hidden="true">
          <div className="rip-card">
            <div className="rip-half rip-left"><CardImg name={ripFx.name} /></div>
            <div className="rip-half rip-right"><CardImg name={ripFx.name} /></div>
          </div>
          <div className="rip-label">✂ {view.players[ripFx.by]?.name ?? 'Someone'} rips {ripFx.name} to pieces!</div>
        </div>
      )}

      {/* idle reminder: 2 minutes of no input on your own turn → a gentle "forgot to end your turn?" */}
      {idleNudge && myTurn && !isSpectator && (
        <div className="idle-nudge" data-idle-nudge role="dialog" aria-label="Idle turn reminder">
          <div className="idle-nudge-card">
            <div className="idle-nudge-title">⏰ Did you forget to end your turn?</div>
            <div className="idle-nudge-body">It’s been a couple of minutes since your last move.</div>
            <div className="idle-nudge-btns">
              <button className="idle-dismiss" onClick={() => setIdleNudge(false)}>Keep playing</button>
              <button className="idle-endturn" onClick={() => { setIdleNudge(false); send({ t: 'endTurn' }) }}>End turn</button>
            </div>
          </div>
        </div>
      )}

      {/* two-sided battle reveal (BOTH players): attacker units left, defender units right, the
          battle log below, titled "Battle of <site>". Shows 5s, click / Skip to dismiss early. */}
      {battleFx && (() => {
        const dismiss = () => setBattleFx(null)
        const portrait = (bu: BattleUnit, i: number) => (
          <div key={i} className={`battle-unit ${bu.died ? 'dead' : ''}`} title={bu.name}>
            <CardImg name={bu.name} className="battle-unitimg" />
            {bu.died && <span className="battle-tomb" title="Died in the battle">🪦</span>}
            {!bu.died && bu.dmg > 0 && <span className="battle-dmg" title={`Took ${bu.dmg} damage`}>-{bu.dmg}</span>}
            <span className="battle-uname">{bu.name}</span>
          </div>
        )
        return (
          <div className="battle-pop" data-battle-pop onClick={dismiss}>
            <div className="battle-panel">
              <div className="battle-title">⚔ Battle of {battleFx.site || 'the open field'}</div>
              <div className="battle-sides">
                <div className="battle-side atk">
                  <div className="battle-side-label">Attacker</div>
                  <div className="battle-units">{battleFx.attackers.map(portrait)}</div>
                </div>
                <div className="battle-vs">⚔</div>
                <div className="battle-side def">
                  <div className="battle-side-label">Defender</div>
                  <div className="battle-units">{battleFx.defenders.length ? battleFx.defenders.map(portrait) : <span className="battle-none">—</span>}</div>
                </div>
              </div>
              {battleFx.logs.length > 0 && (
                <div className="battle-logs">
                  {battleFx.logs.map((l, i) => <div key={i} className="battle-logline">{l}</div>)}
                </div>
              )}
              <button className="battle-skip" onClick={dismiss}>Skip ▶</button>
            </div>
          </div>
        )
      })()}

      {/* close-only notice when the opponent publicly reveals card(s) (Common Sense, Black Mass…) */}
      {revealPops.map((rp) => (
        <RevealPopup key={rp.n} names={rp.names} onHover={showHover}
          onClose={() => setRevealPops((prev) => prev.filter((p) => p.n !== rp.n))} />
      ))}

      {/* Savior: offer to ward a minion you just summoned (shortcut to the (1) ward ability) */}
      {(() => {
        const av = view.units[myPlayer.avatarUnitId]
        if (!av) return null
        let canSave = false
        try { canSave = canActivate(st, me, av.id, 'save') === null } catch { canSave = false }
        if (!canSave) return null
        const id = saviorOffers.find((uid) => {
          const u = view.units[uid]
          return u && !u.isAvatar && u.controller === me && u.enteredTurn === view.turn && !u.ward && !isEvilUnit(st, u)
        })
        if (!id) return null
        const u = view.units[id]
        const dismiss = () => setSaviorOffers((prev) => prev.filter((x) => x !== id))
        return (
          <div className="waitbanner savior-offer" data-savior-offer={id}>
            <span className="spinner">🛡</span>
            <span>Ward <b>{u.name}</b> with the Savior? <span className="wb-sub">spend (1) to ward the minion you just summoned</span></span>
            <button data-confirm="1" onMouseEnter={() => showHover(u.name)} onClick={() => { send({ t: 'activate', sourceId: av.id, ability: 'save', targets: [id] }); dismiss() }}>🛡 Ward (1)</button>
            <button onClick={dismiss}>No</button>
          </div>
        )
      })()}

      <div className="table">
        {/* opponent bar (desktop only — mobile shows both bars in the top bar) */}
        {!mobile && (
        <PlayerBar view={view} pid={(1 - me) as PlayerId} isMe={false} active={view.activePlayer === (1 - me)} onZone={(zone) => setZoneView({ pid: (1 - me) as PlayerId, zone })}
          onInfo={() => setBarInfo((1 - me) as PlayerId)}
          clockMs={clockShown ? clockShown[(1 - me) as PlayerId] : null} clockRunning={clockRunSeat === (1 - me)}
          onAddTime={clockShown ? () => setAddTimeOpen(true) : undefined} onHover={showHover} />
        )}

        {/* board (scaled to fit narrow screens; overlay coords stay in board space) */}
        <div
          className="boardscaler"
          style={{ height: GRID_H * (SQ_H + GAP) * boardScale, width: GRID_W * (SQ_W + GAP) * boardScale, margin: '0 auto' }}
        >
        {/* Subtype view selector — a dropdown that peeks over the top edge of the board.
            ‹ › (or ←/→) cycle the PRESENT subtypes; the caret opens the full list. */}
        {stView && (
          <div className={`stbar ${stOpen ? 'open' : ''}`}>
            <div className="stbar-head">
              <button className="stbar-arrow" title="Previous subtype (←)" onClick={() => cycleSubtype(-1)} disabled={stKeys.length < 2}>‹</button>
              <button className="stbar-current" onClick={() => setStOpen((o) => !o)} title="Pick a subtype">
                <span className="stbar-name">{viewLabel(stKey)}</span>
                <span className="stbar-count">{stCount}</span>
                <span className="stbar-caret">{stOpen ? '▲' : '▼'}</span>
              </button>
              <button className="stbar-arrow" title="Next subtype (→)" onClick={() => cycleSubtype(1)} disabled={stKeys.length < 2}>›</button>
            </div>
            {stOpen && (
              <div className="stbar-menu">
                {stPresent.map((p) => (
                  <button key={p.key} className={`stbar-opt ${p.key === stKey ? 'sel' : ''}`} onClick={() => { setStKey(p.key); setStOpen(false) }}>
                    <span className="stbar-optname">{viewLabel(p.key)}</span>
                    <span className="stbar-count">{p.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {/* zoom viewport: clips at the FITTED size and scrolls its inflated inner .boardzoom when
            zoomed (no scrollbars at 1×). touch-action:none so pinch/pan don't trigger browser gestures. */}
        <div
          className="boardviewport"
          ref={boardViewRef}
          style={{ width: GRID_W * (SQ_W + GAP) * boardScale, height: GRID_H * (SQ_H + GAP) * boardScale, overflow: zoom > 1 ? 'auto' : 'visible', touchAction: 'none' }}
        >
        <div
          className="boardzoom"
          style={{ width: GRID_W * (SQ_W + GAP) * boardScale * zoom, height: GRID_H * (SQ_H + GAP) * boardScale * zoom, position: 'relative', overflow: zoom > 1 ? 'hidden' : 'visible' }}
        >
        <div
          ref={boardRef}
          className={`board ${flip ? 'flipped' : ''} ${subView ? 'subview' : ''} ${faqView ? 'faq-mode' : ''} ${stView ? 'subtype-mode' : ''} ${dirHover ? 'belt-focus' : ''} ${yogImg ? 'yog-present' : ''}`}
          style={{ transform: `scale(${boardScale * zoom})`, transformOrigin: 'top left' }}
        >
          {rows.map((ry) => {
            const y = flip ? ry : GRID_H - 1 - ry
            return (
              <div className="brow" key={y}>
                {cols.map((cx) => {
                  const x = flip ? GRID_W - 1 - cx : cx
                  const site = siteBySquare.get(`${x},${y}`)
                  // a unit mid-walk is drawn at the square it is currently passing through (unitsBySquare
                  // relocates it per step), so it tiles as a real card along its route — no hiding needed.
                  const units = ((unitsBySquare.get(`${x},${y}`) ?? []) as UnitState[]).filter((u) => !u.size)
                  // Only SWALLOWED cargo (Bullfrog belly) leaves the board; an on-top
                  // passenger (Fine Courser's rider, a carried avatar) stays visible at
                  // full size alongside its carrier.
                  const surface = units.filter((u) => u.region === 'surface' && !carriedInside(st, u))
                  const sub = units.filter((u) => (u.region === 'underground' || u.region === 'underwater') && !carriedInside(st, u))
                  const voidU = units.filter((u) => u.region === 'void' && !carriedInside(st, u))
                  // A VOID square has no site — thus no surface/subsurface split — so its void units
                  // ARE the square's occupants and get the SAME full-size main grid as minions on a
                  // site (they were mis-shown tiny in the subsurface-style void strip). A sited square
                  // never holds void units (checkStateBased lifts them to the surface when a site
                  // appears), so `voidStrip` below is only a belt-and-suspenders fallback.
                  // A VOID square has no site — thus no subsurface — so it has no surface/underworld
                  // split: everything physically there renders full-size in the main grid. That is
                  // both void-region units (the fix for the tiny void-strip look) AND any surface-
                  // region unit stranded on a bare square (an avatar is always region 'surface', even
                  // off-site — it must NOT vanish). A sited square keeps the normal surface/subsurface
                  // split; it never holds void units (checkStateBased lifts them when a site appears),
                  // so `voidStrip` is only a belt-and-suspenders fallback there.
                  const isVoidSquare = !site
                  // Multi-square bodies (amoeba / Rack-stretched avatar / Yog-Sothoth) whose HEAD is
                  // ELSEWHERE but whose body covers this square render here as translucent "ghost"
                  // chips that tile and shrink alongside any real minions sharing the square (rather
                  // than a full-size overlay behind them). Each extra square carries its own region.
                  const ghostParts = (Object.values(view.units) as UnitState[])
                    // Yog-Sothoth occupies EVERY square (mechanically), but rather than 19 ghost
                    // chips it shows as one chip at its summon square plus a full-realm wash (below).
                    .filter((gu) => !gu.size && gu.name !== 'Yog-Sothoth' && (gu.extraSquares?.length ?? 0) > 0 && !(gu.x === x && gu.y === y) && !carriedInside(st, gu))
                    .map((gu) => { const p = (gu.extraSquares ?? []).find((s) => s.x === x && s.y === y); return p ? { u: gu, region: (p.region ?? gu.region) as Region } : null })
                    .filter((g): g is { u: UnitState; region: Region } => !!g)
                  const gSurface = ghostParts.filter((g) => g.region === 'surface').map((g) => g.u)
                  const gSub = ghostParts.filter((g) => g.region === 'underground' || g.region === 'underwater').map((g) => g.u)
                  const gVoid = ghostParts.filter((g) => g.region === 'void').map((g) => g.u)
                  const tagReal = (arr: UnitState[]) => arr.map((u) => ({ u, ghost: false }))
                  const tagGhost = (arr: UnitState[]) => arr.map((u) => ({ u, ghost: true }))
                  const mainUnits = isVoidSquare
                    ? [...tagReal(surface), ...tagReal(voidU), ...tagGhost(gSurface), ...tagGhost(gVoid)]
                    : subView ? [...tagReal(sub), ...tagGhost(gSub)] : [...tagReal(surface), ...tagGhost(gSurface)]
                  const stripUnits = isVoidSquare ? [] : subView ? [...tagReal(surface), ...tagGhost(gSurface)] : [...tagReal(sub), ...tagGhost(gSub)]
                  const voidStrip = isVoidSquare ? [] : [...tagReal(voidU), ...tagGhost(gVoid)]
                  const hl = combatSiteHl.get(`${x},${y}`) ?? highlights.get(`${x},${y}`)
                  // in subsurface view, glow each site by terrain (dynamic): water = blue, land = brown
                  const subGlow =
                    subView && site && !site.isRubble ? (isWaterSite(st, site, getCard) ? 'sub-water' : 'sub-land') : ''
                  const arts = Object.values(view.artifacts).filter((a: any) => a.x === x && a.y === y && !a.carriedBy)
                  // single-SQUARE auras (Castle's/Hamlet's Ablaze!, Wildfire, and any 1x1 aura) sit on ONE
                  // square — render them small in the artifact space, not as a big 2x2 region box.
                  const siteAuras = (Object.values(view.auras) as any[]).filter((a) => !a.edge && a.squares?.length === 1 && a.squares?.[0]?.x === x && a.squares?.[0]?.y === y)
                  // Harbinger portents (public since setup): mark the fated squares
                  const portents = ([0, 1] as PlayerId[]).filter((pid) =>
                    ((view as any).flow?.harbinger?.[pid] ?? []).some((s2: any) => s2.x === x && s2.y === y),
                  )
                  const uCount = mainUnits.length
                  // ground cards (artifacts + 1x1 auras like Wildfire, Castle's/Hamlet's Ablaze!) live in the
                  // right-hand strip. The minions must NEVER slide under them, so whenever the strip is present
                  // the units area reserves it and the chips shrink to the remaining space. (Past 4 cards the
                  // strip wraps into two SMALL columns that span about the same width, so the reservation is
                  // the same either way — see .ground-arts.ga-2col / .units.has-arts.)
                  const uHasArts = arts.length + siteAuras.length > 0
                  const uGridCols = unitsGridCols(uCount)
                  // with a ground artifact/aura present, a 3-minion site uses the 4-minion (2×2) layout
                  // so the minions stay compact on the left, leaving the right strip for the artifact
                  const uTileCols = uHasArts && uCount === 3 ? 2 : unitsTileCols(uCount)
                  return (
                    <div key={x} data-sq={`${x},${y}`} data-clickable={hl ? '1' : undefined} data-hl={hl ?? undefined} className={`square ${site ? (site.isRubble ? 'rubble' : 'sited') : 'void'} ${hl ?? ''} ${subGlow} ${portents.map((p) => `portent-p${p}`).join(' ')}`} onClick={() => clickSquare(x, y)}>
                      {showCoords && <span className="sqcoord" aria-hidden="true">{squareLabel(x, y)}</span>}
                      {/* direction-picker conveyor chevron: flows outward to the farthest reachable
                          site; the hovered direction's lane lights up (see the `belt` memo). */}
                      {belt.cells.has(`${x},${y}`) && (() => {
                        const b = belt.cells.get(`${x},${y}`)!
                        return <span className={`belt belt-${beltScreenDir(b.dir, flip)}${dirHover === b.dir ? ' active' : ''}`} style={{ ['--belt-color' as any]: belt.color, animationDelay: `${b.idx * 0.11}s` }} aria-hidden="true" />
                      })()}
                      {/* the starting site shows all 4 arrows radiating outward (one per direction) */}
                      {belt.from && belt.from.x === x && belt.from.y === y && (['n', 's', 'e', 'w'] as const).map((dir) => (
                        <span key={`bo-${dir}`} className={`belt belt-origin belt-${beltScreenDir(dir, flip)}${dirHover === dir ? ' active' : ''}`} style={{ ['--belt-color' as any]: belt.color }} aria-hidden="true" />
                      ))}
                      {portents.map((pid) => (
                        <span key={pid} className={`portent owner${pid}`} title={`Harbinger portent — ${view.players[pid].name} may summon here (−①)`}>
                          ✦
                        </span>
                      ))}
                      {site && (
                        <div className={`sitecard ${hasFaq(site.name) ? 'has-faq' : ''} ${stView && siteMatchesView(site.name, stKey) ? 'st-match' : ''}`} data-site={site.id} data-sitename={site.name} data-target={targetIds?.has(site.id) ? '1' : undefined} data-picked={(mode.m === 'magic' && mode.picked.includes(site.id)) || (mode.m === 'promptTargets' && mode.picked.includes(site.id)) ? '1' : undefined} onClick={(e) => clickSite(site, e)} onMouseEnter={() => showHover(site.name, false, view.cards[site.cardId]?.art)}>
                          <CardImg name={site.name} art={view.cards[site.cardId]?.art} className={`siteimg owner${site.controller}`} />
                          {/* ownership strip — a real element ON TOP of the art (an inset box-shadow
                              on the <img> is painted over by the image, so it was invisible) */}
                          {!site.isRubble && (site.controller === 0 || site.controller === 1) && (
                            <span className={`site-ownerbar ${site.controller === me ? 'owner-mine' : 'owner-theirs'}`} aria-hidden="true" />
                          )}
                          {site.ward && <WardGlow />}
                          {site.ward && <span className="kw siteward" title="Warded">🛡</span>}
                          {siteSilenced(st, site) && <span className="kw sitesilenced" title="Silenced — its abilities are removed">🤐</span>}
                          {site.flooded && <span className="kw siteflood" title="Flooded">🌊</span>}
                          {scorchedSquares.has(`${x},${y}`) && <span className="kw sitescorched" title="Scorched — a roaming Wildfire has burned here">🔥</span>}
                          {flameVisitedSquares.has(`${x},${y}`) && <span className="kw siteflamevisited" title="Kindled — the Flame of the First Ones has already burned at this site">🔥</span>}
                        </div>
                      )}
                      {subGlow && <span className={`subterrain ${subGlow}`} title={subGlow === 'sub-water' ? 'Water site' : 'Land site'} />}
                      <div
                        className={`units${uGridCols ? ' grid' : uTileCols ? ' tiled' : ''}${uHasArts ? ' has-arts' : ''}`}
                        data-count={uCount}
                        style={(uGridCols || uTileCols) ? ({ ['--cols' as any]: uGridCols || uTileCols } as React.CSSProperties) : undefined}
                      >
                        {mainUnits.map(({ u, ghost }) => (
                          (u as any)._anim ? <AnimGhost key={`${(u as any)._gid}-anim`} u={u as unknown as AnimUnit} /> :
                          <UnitChip key={ghost ? `${u.id}-g` : u.id} u={u} ghost={ghost} anim={movingUnitIds.has(u.id) ? 'move' : undefined} bodyActive={!u.size && (u.extraSquares?.length ?? 0) > 0 && ((mode.m === 'unit' && mode.unitId === u.id) || bodyHover === u.id)} st={st} me={me} matchKey={stView ? stKey : undefined} casterGlow={areaFx && areaFx.casterId === u.id ? areaFx.id : undefined} glow={unitGlow(u.id)} selected={(mode.m === 'unit' && mode.unitId === u.id) || (mode.m === 'promptTargets' && mode.picked.includes(u.id))}
                            picked={(mode.m === 'promptTargets' || mode.m === 'magic') && mode.picked.includes(u.id)}
                            target={!!targetIds?.has(u.id)}
                            onClick={(ev) => {
                              if (clickUnitForGenesis(u)) return
                              clickUnit(u, ev)
                            }}
                            onHover={(n, f, art) => { showHover(n, f, art); setBodyHover(!u.size && (u.extraSquares?.length ?? 0) > 0 ? u.id : null) }} onArtClick={clickCarriedArtifact} artTargets={targetIds ?? undefined} />
                        ))}
                      </div>
                      {stripUnits.length > 0 && (
                        <div className="subsurface">
                          {stripUnits.map(({ u, ghost }) => (
                            (u as any)._anim ? <AnimGhost key={`${(u as any)._gid}-anim`} u={u as unknown as AnimUnit} /> :
                            <UnitChip key={ghost ? `${u.id}-g` : u.id} u={u} ghost={ghost} bodyActive={!u.size && (u.extraSquares?.length ?? 0) > 0 && ((mode.m === 'unit' && mode.unitId === u.id) || bodyHover === u.id)} st={st} me={me} matchKey={stView ? stKey : undefined} casterGlow={areaFx && areaFx.casterId === u.id ? areaFx.id : undefined} glow={unitGlow(u.id)} small selected={(mode.m === 'unit' && mode.unitId === u.id) || (mode.m === 'promptTargets' && mode.picked.includes(u.id))}
                              picked={(mode.m === 'promptTargets' || mode.m === 'magic') && mode.picked.includes(u.id)}
                              target={!!targetIds?.has(u.id)}
                              onClick={(ev) => clickUnit(u, ev)} onHover={(n, f, art) => { showHover(n, f, art); setBodyHover(!u.size && (u.extraSquares?.length ?? 0) > 0 ? u.id : null) }} onArtClick={clickCarriedArtifact} artTargets={targetIds ?? undefined} />
                          ))}
                        </div>
                      )}
                      {voidStrip.length > 0 && (
                        <div className="voidunits">
                          {voidStrip.map(({ u, ghost }) => (
                            (u as any)._anim ? <AnimGhost key={`${(u as any)._gid}-anim`} u={u as unknown as AnimUnit} /> :
                            <UnitChip key={ghost ? `${u.id}-g` : u.id} u={u} ghost={ghost} bodyActive={!u.size && (u.extraSquares?.length ?? 0) > 0 && ((mode.m === 'unit' && mode.unitId === u.id) || bodyHover === u.id)} st={st} me={me} matchKey={stView ? stKey : undefined} casterGlow={areaFx && areaFx.casterId === u.id ? areaFx.id : undefined} glow={unitGlow(u.id)} small selected={(mode.m === 'unit' && mode.unitId === u.id) || (mode.m === 'promptTargets' && mode.picked.includes(u.id))}
                              picked={(mode.m === 'promptTargets' || mode.m === 'magic') && mode.picked.includes(u.id)}
                              target={!!targetIds?.has(u.id)}
                              onClick={(ev) => clickUnit(u, ev)} onHover={(n, f, art) => { showHover(n, f, art); setBodyHover(!u.size && (u.extraSquares?.length ?? 0) > 0 ? u.id : null) }} onArtClick={clickCarriedArtifact} artTargets={targetIds ?? undefined} />
                          ))}
                        </div>
                      )}
                      {(arts.length > 0 || siteAuras.length > 0) && (
                        <div className={`ground-arts${mainUnits.length <= 4 ? ' ga-big' : ''}${arts.length + siteAuras.length > 3 ? ' ga-shrink' : ''}${arts.length + siteAuras.length > 4 ? ' ga-2col' : ''}`}>
                          {arts.map((a: any) => (
                            <div
                              key={a.id}
                              className={`ground-art ${stView && artMatchesView(st, me, a, stKey) ? 'st-match' : ''}${a.name === 'Doomsday Device' && a.counters?.fuse === 1 ? ' doom-hot' : ''}${getCard(a.name).subtypes.includes('Monument') ? (a.conjuredBy === me ? ' mono-mine' : ' mono-theirs') : ''}`}
                              data-artifact={a.id}
                              data-target={targetIds?.has(a.id) ? '1' : undefined}
                              onMouseEnter={() => showHover(a.name, false, view.cards[a.cardId]?.art)}
                              onClick={(ev) => clickGroundArtifact(a, ev)}
                              title={`${a.name} — click to pick up with a unit here`}
                            >
                              <CardImg name={a.name} art={view.cards[a.cardId]?.art} className="groundimg" />
                              {a.name === 'The Immortal Throne' && (
                                <span className="throne-level" title={`The Immortal Throne — level ${a.counters?.level ?? 0}`}>
                                  {a.counters?.level ?? 0}
                                </span>
                              )}
                              {a.name === 'Doomsday Device' && typeof a.counters?.fuse === 'number' && (
                                <span className="doomsday-fuse" title={`Doomsday Device — ${Math.max(0, a.counters.fuse)} tick(s) left`}>
                                  {Math.max(0, a.counters.fuse)}
                                </span>
                              )}
                              {artifactSilenced(st, a) && <span className="kw artsilenced" title="Silenced — its abilities are removed">🤐</span>}
                              {(a.region === 'underground' || a.region === 'underwater') && (
                                <span className={`kw artregion ${a.region}`} data-artregion={a.region} title={a.region === 'underground' ? 'Buried underground' : 'Submerged underwater'}>
                                  {a.region === 'underground' ? '⛏' : '🌊'}
                                </span>
                              )}
                            </div>
                          ))}
                          {siteAuras.map((a: any) => {
                            // single-square auras (Wildfire, singleSiteAura) are clickable just like the
                            // big 2x2 overlay ones: aura-selectable during an Enchantress "animate target
                            // aura" prompt, and a data-aura-hit card for Editor board-selection.
                            const sel = auraCands.has(a.id)
                            const editing = auraEdit && mode.m === 'editAura' && mode.auraId === a.id
                            const magicPick = auraMagicPick(a.id)
                            const clickable = sel || auraEdit || magicPick
                            return (
                              <div key={a.id}
                                className={`ground-art site-aura${a.controller === me ? ' aura-mine' : a.controller != null ? ' aura-theirs' : ''}${(sel || magicPick) ? ' aura-selectable' : ''}${!sel && !magicPick && editing ? ' aura-editing' : ''}`}
                                data-aura={a.id}
                                data-aura-hit={!sel && !magicPick && auraEdit ? a.id : undefined}
                                onMouseEnter={() => showHover(a.name, false, view.cards[a.cardId]?.art)} title={a.name}
                                style={clickable ? { cursor: 'pointer' } : undefined}
                                onClick={sel ? (e) => { e.stopPropagation(); selectAura(a.id) } : magicPick ? (e) => { e.stopPropagation(); pickTarget(a.id) } : auraEdit ? (e) => { e.stopPropagation(); selectAuraEdit(a.id) } : undefined}>
                                <CardImg name={a.name} art={view.cards[a.cardId]?.art} className="groundimg" />
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* intersection overlay: oversized units + auras sit across squares */}
          {(Object.values(view.units) as UnitState[])
            .filter((u) => u.size === '2x2')
            .map((u) => {
              const rect = overlayRect([{ x: u.x, y: u.y }, { x: u.x + 1, y: u.y }, { x: u.x, y: u.y + 1 }, { x: u.x + 1, y: u.y + 1 }], flip)
              return (
                <div key={u.id} className="overlay-item" style={rect}>
                  <UnitChip u={u} st={st} me={me} matchKey={stView ? stKey : undefined} casterGlow={areaFx && areaFx.casterId === u.id ? areaFx.id : undefined} glow={unitGlow(u.id)} big selected={(mode.m === 'unit' && mode.unitId === u.id) || (mode.m === 'promptTargets' && mode.picked.includes(u.id))}
                    picked={(mode.m === 'promptTargets' || mode.m === 'magic') && mode.picked.includes(u.id)}
                    target={!!targetIds?.has(u.id)}
                    onClick={(ev) => clickUnit(u, ev)} onHover={showHover} onArtClick={clickCarriedArtifact} artTargets={targetIds ?? undefined} />
                </div>
              )
            })}
          {/* Multi-square bodies (amoebas via occupiesAllVisited, Rack-stretched avatars,
              Yog-Sothoth): the card copies render as chips INSIDE each occupied square's unit grid
              (so they tile/shrink with any real minions sharing the square). Here we draw only the
              connective tissue — a bar between each pair of adjacent chip CENTROIDS (measured from
              the live DOM), raised above other minions while the body is hovered/selected. */}
          {bodyLines.map((s) => {
            const len = Math.hypot(s.bx - s.ax, s.by - s.ay)
            const angle = Math.atan2(s.by - s.ay, s.bx - s.ax) * 180 / Math.PI
            const TH = 18
            return (
              <div key={s.key} className={`bodylink mine-${s.mine ? 1 : 0}`} style={{
                position: 'absolute', zIndex: s.z, pointerEvents: 'none',
                left: s.ax, top: s.ay - TH / 2, width: len, height: TH,
                transformOrigin: '0 50%', transform: `rotate(${angle}deg)`,
              }} />
            )
          })}
          {/* Yog-Sothoth: while any copy is in the realm, a faint crop of its art washes the whole
              board (graphic only; unchanged by count; vanishes when the last one leaves). */}
          {yogImg && <div className="yog-overlay" style={{ backgroundImage: `url(${yogImg})` }} aria-hidden="true" />}
          {(() => {
            // Pre-pass: when several area auras share the same image square, fan their
            // card images out (stagger by stack index) so a newly cast aura does NOT
            // cover an aura already there — each stays identifiable/hoverable.
            const auraList = Object.values(view.auras) as any[]
            // aura-target selection (Enchantress) + Editor board-selection context is hoisted to the
            // component scope (shared with the single-square per-square render). See auraSelect above.
            // Oversized 2×2 minions centre their chip on the shared corner of their block; a 2×2 aura
            // anchored at the SAME square centres its card on that same intersection and gets covered.
            // Only those auras need their card nudged to the top-left (see .aura-covered in CSS).
            const big2x2Anchors = new Set(
              (Object.values(view.units) as UnitState[]).filter((u) => u.size === '2x2').map((u) => `${u.x},${u.y}`),
            )
            const imgClusterOf = (a: any) => {
              const clusters = clusterSquares(a.squares)
              const anchorCluster = a.anchor ? clusters.find((cl) => cl.some((s) => s.x === a.anchor.x && s.y === a.anchor.y)) : undefined
              return { clusters, imgCluster: anchorCluster ?? [...clusters].sort((p, q) => q.length - p.length)[0] }
            }
            const stackKey = (cl: { x: number; y: number }[]) => {
              const r = overlayRect(cl, flip)
              return `${r.left},${r.top}`
            }
            const seen = new Map<string, number>()
            const stackIndex = new Map<string, number>()
            for (const a of auraList) {
              if (a.edge || a.squares?.length === 1) continue // single-SQUARE auras render in the artifact space
              const key = stackKey(imgClusterOf(a).imgCluster)
              const n = seen.get(key) ?? 0
              stackIndex.set(a.id, n)
              seen.set(key, n + 1)
            }
            return auraList.map((a: any) => {
              // A WALL is an EDGE aura (a 2x1 aura spanning the border between two squares — that
              // second square is what an Enchantress-animated wall occupies). It must be tested BEFORE
              // the single-square case: a wall stores one anchor square in `squares` too, so checking
              // `squares.length === 1` first would wrongly render it as a 1x1 site tint instead of a
              // glowing border bar.
              if (a.edge) {
                // border wall: a glowing bar on the edge between the two squares
                const rect = wallRect(a.edge, flip)
                const sel = auraCands.has(a.id)
                // a wall is also a live TARGET when a spell/ability targets a minion/artifact/aura
                // (Displace): clicking its card picks it, exactly like a 2x2 or single-site aura.
                const magicPick = auraMagicPick(a.id)
                return (
                  <div
                    key={a.id}
                    data-aura={a.id}
                    className={`overlay-item wall${(sel || magicPick) ? ' aura-selectable' : ''}${!sel && !magicPick && auraEdit && mode.m === 'editAura' && mode.auraId === a.id ? ' aura-editing' : ''}`}
                    style={{
                      ...rect,
                      background: auraWallBg(a.name), // coloured by the wall aura's element(s)
                      borderRadius: 4,
                      boxShadow: '0 0 8px 2px rgba(255,255,255,0.5)',
                      zIndex: (sel || magicPick) ? 9 : 4,
                    }}
                    onMouseEnter={() => showHover(a.name, false, view.cards[a.cardId]?.art)}
                    title={a.name}
                  >
                    {/* only the card thumbnail is the hit target (not the whole edge bar) — for the Editor,
                        for a spell/ability that TARGETS the aura (Arjaro Exorcist), and for a targeting
                        picker (Displace). The bar itself stays click-through so the sites beneath remain
                        reachable. */}
                    <span
                      data-aura-hit={sel || magicPick || auraEdit ? a.id : undefined}
                      className={`${a.controller === me ? 'aura-mine' : a.controller != null ? 'aura-theirs' : ''}${sel || magicPick || auraEdit ? ' aura-edit-hit' : ''}`}
                      onClick={sel ? (e) => { e.stopPropagation(); selectAura(a.id) } : magicPick ? (e) => { e.stopPropagation(); pickTarget(a.id) } : auraEdit ? (e) => { e.stopPropagation(); selectAuraEdit(a.id) } : undefined}
                    >
                      <CardImg name={a.name} className="wallimg" />
                    </span>
                  </div>
                )
              }
              if (a.squares?.length === 1) {
                // A single-square aura (Wildfire, Castle's/Hamlet's Ablaze!) shows its CARD in the
                // artifact strip (clickable, player-coloured border), but its EFFECT still tints the
                // WHOLE SITE — a click-through element-coloured overlay, exactly like a 2x2 aura's area.
                return (
                  <div key={`${a.id}-tint`} data-aura-tint={a.id}
                    className="overlay-item aura"
                    style={{ ...overlayRect(a.squares, flip), ...auraTint(a.name) }}
                    title={a.name} />
                )
              }
              // one box per contiguous cluster (a Magellan-Globe-wrapped aura has two);
              // the card image sits in the cluster holding the anchor, else the largest
              const { clusters, imgCluster } = imgClusterOf(a)
              const idx = stackIndex.get(a.id) ?? 0
              // fan overlapping images down-right so earlier auras stay visible top-left
              const fan = idx ? { transform: `translate(${idx * 16}px, ${idx * 16}px)`, zIndex: 2 + idx } : undefined
              const sel = auraCands.has(a.id)
              const editing = auraEdit && mode.m === 'editAura' && mode.auraId === a.id
              const magicPick = auraMagicPick(a.id)
              // only nudge the card off the intersection when a 2×2 minion actually sits on this block
              const iax = a.anchor?.x ?? Math.min(...imgCluster.map((s: any) => s.x))
              const iay = a.anchor?.y ?? Math.min(...imgCluster.map((s: any) => s.y))
              const covered = big2x2Anchors.has(`${iax},${iay}`)
              return clusters.map((cl, i) => (
                <div
                  key={`${a.id}-${i}`}
                  data-aura={a.id}
                  className={`overlay-item aura${covered ? ' aura-covered' : ''}${(sel || magicPick) ? ' aura-selectable' : ''}${!sel && !magicPick && editing ? ' aura-editing' : ''}`}
                  // the effect AREA is coloured by the aura's ELEMENT (auraTint). It is never the click
                  // target (pointer-events:none via .overlay-item) — for BOTH Editor selection AND a spell
                  // that TARGETS an aura (Arjaro Exorcist), only the card image (below) is the hit target,
                  // so you pick the aura by its CARD (player-coloured border), not by its effect area.
                  style={{ ...overlayRect(cl, flip), ...auraTint(a.name), ...((sel || magicPick) ? { zIndex: 8 } : {}) }}
                  title={a.name}
                >
                  {cl === imgCluster && (
                    <span
                      data-aura-hit={sel || magicPick || auraEdit ? a.id : undefined}
                      className={`auraimg-wrap${a.controller === me ? ' aura-mine' : a.controller != null ? ' aura-theirs' : ''}${sel || magicPick || auraEdit ? ' aura-edit-hit' : ''}`}
                      style={{ ...fan, ...(sel || magicPick || auraEdit ? { cursor: 'pointer' as const } : {}) }} onMouseEnter={() => showHover(a.name, false, view.cards[a.cardId]?.art)} title={a.name}
                      onClick={sel ? (e) => { e.stopPropagation(); selectAura(a.id) } : magicPick ? (e) => { e.stopPropagation(); pickTarget(a.id) } : auraEdit ? (e) => { e.stopPropagation(); selectAuraEdit(a.id) } : undefined}
                    >
                      <CardImg name={a.name} className="auraimg" />
                    </span>
                  )}
                </div>
              ))
            })
          })()}
          {/* edge-aura (wall) placement: clickable hotspots on site borders (intersections) */}
          {mode.m === 'aura' && getScript(view.cards[mode.cardId]?.name ?? '')?.edgeAura && (() => {
            const name = view.cards[mode.cardId]?.name ?? ''
            const placement = getScript(name)?.auraPlacement
            const dirs = [
              { side: 'north', dx: 0, dy: 1 }, { side: 'south', dx: 0, dy: -1 },
              { side: 'east', dx: 1, dy: 0 }, { side: 'west', dx: -1, dy: 0 },
            ]
            const seen = new Set<string>()
            const spots: { key: string; edge: any; x: number; y: number; side: string }[] = []
            for (const s of Object.values(view.sites) as any[]) {
              if (placement && placement(st, me, { x: s.x, y: s.y }) !== null) continue // wall must be conjurable here
              for (const d of dirs) {
                const nx = s.x + d.dx
                const ny = s.y + d.dy
                if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue
                const key = [Math.min(s.x, nx), Math.min(s.y, ny), Math.max(s.x, nx), Math.max(s.y, ny)].join(',')
                if (seen.has(key)) continue
                seen.add(key)
                spots.push({ key, edge: { a: { x: s.x, y: s.y }, b: { x: nx, y: ny } }, x: s.x, y: s.y, side: d.side })
              }
            }
            return spots.map((sp) => (
              <div
                key={sp.key}
                data-wallspot={sp.key}
                data-clickable="1"
                className="overlay-item wall-hotspot"
                style={{ ...wallRect(sp.edge, flip), zIndex: 8 }}
                title={`Raise ${name} on this border`}
                onClick={() => {
                  send({ t: 'castSpell', cardId: (mode as any).cardId, casterId: (mode as any).casterId ?? avatar.id, at: { x: sp.x, y: sp.y }, extra: { wallSide: sp.side } })
                  setMode({ m: 'idle' })
                }}
              />
            ))
          })()}
          {/* 2x2 aura placement: a marker on each valid site INTERSECTION (the shared
              corner of the 2x2 it covers), not a full-square highlight. Carries
              data-sq (the top-left anchor) so it clicks like a square. */}
          {mode.m === 'aura' && !getScript(view.cards[mode.cardId]?.name ?? '')?.edgeAura && !getScript(view.cards[mode.cardId]?.name ?? '')?.singleSiteAura && (() => {
            const name = view.cards[mode.cardId]?.name ?? ''
            const placement = getScript(name)?.auraPlacement
            const S = 22
            const markers: React.ReactNode[] = []
            // anchors run from -1 so the board's LEFT (x=-1) and BOTTOM (y=-1) border
            // intersections are offered too — not just the interior/top/right ones. A
            // border anchor's 2x2 clips to the adjacent column/row (or wraps under the Globe).
            for (let x = -1; x < GRID_W; x++) {
              for (let y = -1; y < GRID_H; y++) {
                if (placement) { try { if (placement(st, me, { x, y }) !== null) continue } catch { continue } }
                // shared corner of the anchor's 2x2 = right/top boundary of the anchor
                // cell (flip-aware); same corner math as wallRect
                const cx = flip ? GRID_W - 1 - x : x + 1
                const ry = flip ? y + 1 : GRID_H - 1 - y
                const left = cx * (SQ_W + GAP) - GAP / 2 - S / 2
                const top = ry * (SQ_H + GAP) - GAP / 2 - S / 2
                markers.push(
                  <div
                    key={`ai${x},${y}`}
                    data-sq={`${x},${y}`}
                    data-clickable="1"
                    data-aura-anchor="1"
                    className="overlay-item aura-anchor"
                    style={{ position: 'absolute', left, top, width: S, height: S, zIndex: 8 }}
                    title={`Conjure ${name} at this intersection (covers the sites around it)`}
                    onClick={() => {
                      send({ t: 'castSpell', cardId: (mode as any).cardId, casterId: (mode as any).casterId ?? avatar.id, at: { x, y } })
                      setMode({ m: 'idle' })
                    }}
                  />,
                )
              }
            }
            return markers
          })()}

          {/* 2x2 AREA pick (Earthquake, Corpse Explosion…): a chooseSquare prompt flagged
              area2x2 renders an intersection marker per legal anchor (the same 2x2 selector
              as auras) instead of single-square highlights — so an area with void cells is
              still selectable. */}
          {prompt?.kind === 'chooseSquare' && promptIsMine && prompt.data?.area2x2 &&
            ((prompt.data?.squares ?? []) as { x: number; y: number }[]).map((a) => (
              <div key={`q2${a.x},${a.y}`} data-sq={`${a.x},${a.y}`} data-clickable="1" data-area-anchor="1"
                className="overlay-item aura-anchor" style={markerStyle(a.x, a.y)}
                title="select this 2×2 area"
                onClick={() => send({ t: 'prompt', promptId: prompt.id, choice: { x: a.x, y: a.y } })} />
            ))}

          {/* wall-border destination pick (Displace a wall): clickable hotspots on the candidate site
              borders — the same border geometry as raising a wall, but answering a prompt. */}
          {prompt?.kind === 'chooseSquare' && promptIsMine && prompt.data?.edgeSelect &&
            ((prompt.data?.edges ?? []) as { key: string; a: { x: number; y: number }; b: { x: number; y: number } }[]).map((e) => (
              <div key={`we${e.key}`} data-wallspot={e.key} data-clickable="1"
                className="overlay-item wall-hotspot" style={{ ...wallRect(e, flip), zIndex: 8 }}
                title="Displace the wall to this border"
                onClick={() => send({ t: 'prompt', promptId: prompt.id, choice: e.key })} />
            ))}

          {/* oversized (2x2) minion placement: an intersection marker per legal 2x2
              anchor (the minion occupies those four squares), not square highlights. */}
          {mode.m === 'summon' && getScript(view.cards[mode.cardId]?.name ?? '')?.oversized && (() => {
            const name = view.cards[mode.cardId]?.name ?? ''
            const markers: React.ReactNode[] = []
            for (let x = 0; x < GRID_W - 1; x++) for (let y = 0; y < GRID_H - 1; y++) {
              if (validateSummonAt(st, me, name, { x, y, region: 'surface' }) !== null) continue
              markers.push(
                <div key={`os${x},${y}`} data-sq={`${x},${y}`} data-clickable="1" data-area-anchor="1"
                  className="overlay-item aura-anchor" style={markerStyle(x, y)}
                  title={`Summon ${name} here (occupies these four squares)`}
                  onClick={() => castWithTargets(mode.cardId, mode.casterId, { x, y, region: 'surface' })} />,
              )
            }
            return markers
          })()}

          {/* multiple movement routes (pathChoice): draw an arrow along EVERY candidate path;
              the one whose panel button is hovered glows. */}
          {mode.m === 'pathChoice' && (() => {
            const u = view.units[mode.unitId]
            if (!u) return null
            const boardW = GRID_W * (SQ_W + GAP), boardH = GRID_H * (SQ_H + GAP)
            const center = (x: number, y: number): [number, number] => {
              const c = flip ? GRID_W - 1 - x : x
              const r = flip ? y : GRID_H - 1 - y
              return [c * (SQ_W + GAP) + SQ_W / 2, r * (SQ_H + GAP) + SQ_H / 2]
            }
            const palette = PATH_PALETTE
            return (
              <svg className="patharrows" width={boardW} height={boardH} viewBox={`0 0 ${boardW} ${boardH}`}
                style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 22, overflow: 'visible' }} aria-hidden="true">
                <defs>
                  <marker id="patharrowhead" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
                  </marker>
                </defs>
                {mode.paths.map((p, i) => {
                  const pts = [center(u.x, u.y), ...p.map((s) => center(s.x, s.y))]
                  const d = pts.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
                  const hovered = routeHover === p
                  const color = palette[i % palette.length]
                  return (
                    <path key={i} d={d} fill="none" stroke={color}
                      strokeWidth={hovered ? 8 : 4} strokeOpacity={hovered ? 1 : 0.5}
                      strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#patharrowhead)"
                      style={hovered ? { filter: `drop-shadow(0 0 7px ${color})` } : undefined} />
                  )
                })}
              </svg>
            )
          })()}

          {/* oversized (2x2) MOVEMENT: the whole block shifts one step, so its move
              destinations render as intersection markers at every reachable anchor
              (like summon), not single-square highlights around the bottom-left. */}
          {!isSpectator && myTurn && mode.m === 'unit' && (() => {
            const u = view.units[mode.unitId]
            if (!u || u.controller !== me || u.size !== '2x2') return null
            // EVERY reachable anchor is a marker — including shifts whose anchor sits on
            // a square the block currently occupies (a 1-step east/north shift). Clicking
            // routes through openMoveChoice so enemies in the DESTINATION footprint are
            // offered as attack targets (move-and-attack in one action).
            return reachableLocations(st, u)
              .filter((a) => a.region === 'surface')
              .map((a) => (
                <div key={`ou${a.x},${a.y}`} data-sq={`${a.x},${a.y}`} data-clickable="1" data-area-anchor="1"
                  className="overlay-item aura-anchor" style={markerStyle(a.x, a.y)}
                  title="Move here (the whole 2×2 shifts)"
                  onClick={() => {
                    const path = findPath(st, u, { x: a.x, y: a.y, region: 'surface' })
                    if (path) openMoveChoice(u, { x: a.x, y: a.y, region: 'surface' }, path, null)
                  }} />
              ))
          })()}

          {/* final-confirmation overlay for a "printed area" damage spell: a big
              element-tinted damage number sits on every affected site, with the
              affected squares outlined in the same colour. The Cast/Cancel banner
              lives below (with the other mode banners). */}
          {mode.m === 'areaConfirm' && (() => {
            const rgb = ELEM_RGB[mode.element] ?? ELEM_RGB.none
            return mode.cells.map((c) => (
              <div
                key={`ad${c.x},${c.y}`}
                className="areadmg-cell"
                style={{
                  ...overlayRect([{ x: c.x, y: c.y }], flip),
                  borderColor: `rgb(${rgb})`,
                  boxShadow: `inset 0 0 18px rgba(${rgb},0.45)`,
                  color: `rgb(${rgb})`,
                }}
                aria-hidden="true"
              >
                <span className="areadmg-num">{c.dmg}</span>
              </div>
            ))
          })()}

          {/* spell-cast reveal (BOTH players): golden caster + spell name, plus EITHER a numbered
              damage grid OR red-glowing affected sites. Full brightness 2s, fades over the next 3s. */}
          {areaFx && (() => {
            const rgb = ELEM_RGB[areaFx.element] ?? ELEM_RGB.none
            const glow = areaFx.redSites.length ? areaFx.redSites : areaFx.cells
            // name over the single glowing site if there's exactly one; otherwise over the caster
            const labelAnchor = glow.length === 1 ? { x: glow[0].x, y: glow[0].y } : areaFx.caster
            return (
              <>
                {/* the caster UNIT glows gold via its UnitChip (castfx-unitglow), not a square tile */}
                {areaFx.redSites.map((s) => (
                  <div key={`cf-red${areaFx.id}:${s.x},${s.y}`} className="castfx-red castfx-fade" style={overlayRect([s], flip)} aria-hidden="true" />
                ))}
                {areaFx.cells.map((c) => (
                  <div
                    key={`cf-cell${areaFx.id}:${c.x},${c.y}`}
                    className={`areadmg-cell castfx-fade${areaFx.element === 'doomsday' ? ' doomsday' : ''}`}
                    style={{ ...overlayRect([{ x: c.x, y: c.y }], flip), borderColor: `rgb(${rgb})`, boxShadow: `inset 0 0 18px rgba(${rgb},0.45)`, color: `rgb(${rgb})` }}
                    aria-hidden="true"
                  >
                    <span className="areadmg-num">{c.dmg}</span>
                  </div>
                ))}
                {areaFx.name && labelAnchor && (
                  <div key={`cf-name${areaFx.id}`} className="castfx-name castfx-fade" style={overlayRect([labelAnchor], flip)} aria-hidden="true">
                    <span>{areaFx.name}</span>
                  </div>
                )}
              </>
            )
          })()}

          {/* teleport: the destination square glows for 2s (outward — site z untouched). The card itself
              zaps out of its old TILE (an in-slot AnimGhost, see teleGhosts), not a full-square overlay.
              Step-wise movement and the death/removal fade are likewise drawn as real in-tile cards now. */}
          {teleFx.map((f) => (
            <div key={`tpg${f.id}`} className="tele-glow" style={{ ...overlayRect([f.to], flip), zIndex: 6 }} aria-hidden="true" />
          ))}

          {/* mana-gain floats: a "+n ◆" rises over each source that just provided mana (start-of-turn
              sites/passives, a tapped Field Laborers, a freshly-played site…), ~1s each. */}
          {manaFx.map((f) => (
            <div key={`mana${f.id}`} className="mana-float" style={overlayRect([{ x: f.x, y: f.y }], flip)} aria-hidden="true">
              +{f.amount} ◆
            </div>
          ))}

          {/* level-up floats: a green "level n" rises over The Immortal Throne each time it levels
              up, over ~3s (see recordLevelUp in the engine). */}
          {levelFx.map((f) => (
            <div key={`lvl${f.id}`} className="level-float" style={overlayRect([{ x: f.x, y: f.y }], flip)} aria-hidden="true">
              <span className="lvl-arrow">⬆</span> level {f.level}
            </div>
          ))}

          {/* Doomsday Device ticker floats: a white-bordered black number flashes over the device
              each time it counts down (see recordTick in the engine). */}
          {tickFx.map((f) => {
            // the closer to detonation, the bigger the flash: fuse 5→~40px … fuse 1→~72px, ☢→~84px
            const n = parseInt(f.text, 10)
            const size = isNaN(n) ? 84 : 40 + (6 - Math.min(6, Math.max(0, n))) * 8
            return (
              <div key={`tick${f.id}`} className="tick-float" style={overlayRect([{ x: f.x, y: f.y }], flip)} aria-hidden="true">
                <span className="tick-text" style={{ fontSize: `${size}px` }}>{f.text}</span>
              </div>
            )
          })}

          {/* floating action panel: the unit/site/artifact action buttons spawn next
              to the selected board square (flip-aware, board-space so it scales with
              the board), instead of in the fixed stat column. Falls back gracefully
              when the selected entity has no resolvable board square. */}
          {!isSpectator && myTurn && (() => {
            const panel =
              unitActions(st, view, me, mode, setMode, send, myTurn, verticalMove) ??
              siteActions(st, view, me, mode, setMode, send) ??
              artifactActions(st, view, me, mode, setMode, send)
            if (!panel) return null
            // resolve the selected entity's board square
            const ent =
              mode.m === 'unit' ? view.units[mode.unitId]
              : mode.m === 'site' ? (view.sites as any)[mode.siteId]
              : mode.m === 'artifact' ? (view.artifacts as any)[mode.artifactId]
              : null
            if (!ent || typeof ent.x !== 'number' || typeof ent.y !== 'number') return null
            const rect = overlayRect([{ x: ent.x, y: ent.y }], flip) as any
            const boardW = GRID_W * (SQ_W + GAP)
            const boardH = GRID_H * (SQ_H + GAP)
            const PANEL_W = 220
            // Anchor OUT OF THE MINION itself (its measured on-board rect) when a unit is selected;
            // fall back to the square for sites/artifacts. Spawn hugging the anchor's RIGHT edge; if
            // that overflows (right-edge unit), flip to the LEFT of the anchor.
            const useUnit = mode.m === 'unit' && !!unitAnchor
            const aLeft = useUnit ? unitAnchor!.left : (rect.left as number)
            const aRight = useUnit ? unitAnchor!.right : (rect.left as number) + SQ_W
            const aTop = useUnit ? unitAnchor!.top : (rect.top as number)
            let left = aRight + 4
            if (left + PANEL_W > boardW) left = Math.max(0, aLeft - PANEL_W - 4)
            // keep the panel on the board (a bottom-row unit's panel shifts up, not off the board)
            const top = Math.min(Math.max(0, aTop), Math.max(0, boardH - 120))
            return (
              <div className="actionfloat" style={{ left, top, width: PANEL_W }}>
                {panel}
              </div>
            )
          })()}
        </div>
        </div>
        </div>
        {/* corner zoom control (kept minimal — mirrors the +/−/0 keys & pinch); shows current % */}
        <div className="zoomctl" aria-label="Board zoom">
          <button className="zoombtn" title="Zoom out (−)" onClick={() => applyZoom(zoom - ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>−</button>
          <button className="zoombtn zoomreset" title="Reset zoom (0)" onClick={() => applyZoom(1)} disabled={zoom === 1}>{Math.round(zoom * 100)}%</button>
          <button className="zoombtn" title="Zoom in (+)" onClick={() => applyZoom(zoom + ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>+</button>
        </div>
        </div>

        {/* my bar + hand (desktop only — mobile shows both bars in the top bar) */}
        {!mobile && (
        <PlayerBar view={view} pid={me} isMe active={view.activePlayer === me} onZone={(zone) => setZoneView({ pid: me, zone })}
          onInfo={() => setBarInfo(me)}
          clockMs={clockShown ? clockShown[me] : null} clockRunning={clockRunSeat === me} onHover={showHover} onCastTop={castCultTop} />
        )}

        {/* The old avatar life/mana/threshold panel here was fully redundant with the player
            bar directly above it (life ❤, mana ◆ and thresholds all shown there), so it's gone
            — the hand now uses the full width. "Tap: draw site" lives in the avatar's own
            action panel (click the avatar). */}
        <div className="handrow">
          {/* mana widget — remaining / total this turn (total = remaining + spent), sits under
              your player bar at hand level */}
          {!mobile && (
            <div className="manawidget" title="Mana — remaining / total this turn (total = remaining + spent so far)">
              <span className="mw-glyph">◆</span>
              <span className="mw-nums"><b>{myPlayer.mana}</b><span className="mw-slash">/</span>{myPlayer.mana + ((myPlayer as any).manaSpent ?? 0)}</span>
              <span className="mw-label">mana</span>
            </div>
          )}
          <div className={`hand ${faqView ? 'faq-mode' : ''} ${stView ? 'subtype-mode' : ''}`}>
            {/* zero-width, full-card-tall invisible item on the FIRST line, so the hand row is
                always one portrait spell-card tall (giving a card's worth of down-scroll) even
                when the hand holds only short site cards or is empty — like an invisible spell
                card in hand. Does NOT stretch the mana widget (handrow is align-items:flex-start). */}
            {!mobile && <div className="hand-spacer" aria-hidden="true" />}
            {view.phase !== 'mulligan' &&
              myPlayer.hand.map((cardId: string, i: number) => {
                if (cardId === 'hidden') return null
                const sel = mode.m !== 'idle' && 'cardId' in mode && (mode as any).cardId === cardId
                const lk = castLock(cardId)
                const stolen = stolenLock(cardId) // sealed by a thief (Pith Imp)
                const mini = lk?.name ?? stolen?.name // caster (Omphalos) or thief (Pith Imp) miniature
                const handDisabled = (lk && !lk.alive) || !!stolen
                return (
                  <div key={cardId + i}
                    data-hand={cardId}
                    data-card={view.cards[cardId]?.name ?? '?'}
                    data-disabled={handDisabled ? '1' : undefined}
                    className={`handcard ${sel ? 'selected' : ''} ${lk && !lk.alive ? 'locked-dead' : ''} ${stolen ? 'sealed' : ''} ${hasFaq(view.cards[cardId]?.name) ? 'has-faq' : ''} ${(() => { try { return stView && handMatchesView(st, me, view.cards[cardId]?.name ?? '', stKey) ? 'st-match' : '' } catch { return '' } })()}`}
                    onClick={() => { clickHandCard(cardId); if (mobile && !faqView) setHandOpen(false) }} onMouseEnter={() => showHover(view.cards[cardId]?.name ?? null)}
                    title={stolen ? `Stolen by ${stolen.name} — sealed until it leaves` : lk ? (lk.alive ? `Only ${lk.name} may cast this` : `Only ${lk.name} could cast this — it is gone`) : undefined}>
                    <CardImg name={view.cards[cardId]?.name ?? '?'} art={view.cards[cardId]?.art} className="handimg" />
                    {(() => {
                      // an unconditional casting-cost change (Court of Equity etc.): show the card's
                      // ACTUAL current cost as a ◆ badge (red if it costs more, green if less than printed)
                      const d = (myPlayer as any).handCostDelta?.[cardId] as number | undefined
                      if (!d) return null
                      const printed = (() => { try { return getCard(view.cards[cardId]?.name ?? '').cost ?? 0 } catch { return 0 } })()
                      const eff = Math.max(0, printed + d)
                      return (
                        <span className={`handcost-badge ${d > 0 ? 'up' : 'down'}`}
                          title={`Costs ${eff} to cast right now (printed ${printed})`}>
                          {eff} ◆
                        </span>
                      )
                    })()}
                    {mini && (
                      <span className={`castlock ${stolen ? 'stolen' : lk && lk.alive ? '' : 'gone'}`} title={stolen ? `Sealed by ${mini}` : `Cast by ${mini}`}>
                        <CardImg name={mini} className="castlockimg" />
                      </span>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* right side: log + preview */}
      <aside className="sidebar">
        <div className="preview">
          {faqView
            ? <FaqPanel name={hover} />
            : (hover ?? oppPlay) && <CardHover name={(hover ?? oppPlay)!} flipped={hover ? hoverFlip : false} art={hover ? hoverArt : undefined} />}
        </div>
        <div className="log">
          {view.log.slice(-40).map((e, i) => (
            <div key={i} className="logline">
              <LogLine msg={e.msg} onPick={setHover} />
            </div>
          ))}
        </div>
      </aside>

      {/* mulligan */}
      {view.phase === 'mulligan' && !isSpectator && !myPlayer.keptHand && (
        <div className="mull-dim" aria-hidden="true" />
      )}
      {view.phase === 'mulligan' && !isSpectator && !myPlayer.keptHand && (
        <div className={`modal mulligan ${myPlayer.hand.length > 6 ? 'crowded' : ''}`} style={mullPos ? { transform: `translate(calc(-50% + ${mullPos.x}px), calc(-50% + ${mullPos.y}px))` } : undefined}>
          <h3 className="draghandle" style={{ cursor: 'move', touchAction: 'none' }} onPointerDown={startMullDrag}>Opening hand — select up to 3 cards to return, or keep</h3>
          <div className="mull-firstplayer">{view.firstPlayer === me ? '🥇 You go first this game (Player 1).' : '🥈 You go second this game (Player 2).'}</div>
          <div className="mull-oppstatus">{opp.keptHand ? `✓ ${opp.name} is ready — waiting on you.` : `⏳ ${opp.name} is still choosing their hand…`}</div>
          <div className="mullhand">
            {(() => {
              // two rows, as equal as possible (equal when the hand size is even; e.g. 7 → 4 + 3)
              const h = myPlayer.hand as string[]
              const half = Math.ceil(h.length / 2)
              return [h.slice(0, half), h.slice(half)].filter((r) => r.length).map((row, ri) => (
                <div key={ri} className="mullrow">
                  {row.map((cardId) => (
                    <div key={cardId} className={`handcard ${mullSel.includes(cardId) ? 'selected' : ''}`}
                      onMouseEnter={() => showHover(view.cards[cardId]?.name ?? null)}
                      onClick={() => setMullSel(mullSel.includes(cardId) ? mullSel.filter((c) => c !== cardId) : mullSel.length < 3 ? [...mullSel, cardId] : mullSel)}>
                      <CardImg name={view.cards[cardId]?.name ?? '?'} art={view.cards[cardId]?.art} className="handimg" />
                    </div>
                  ))}
                </div>
              ))
            })()}
          </div>
          <div className="mull-actions">
            {confirmKeep ? (
              <div className="mull-confirm">
                <span>Keep this opening hand?</span>
                <button data-confirm="1" onClick={() => { send({ t: 'keepHand' }); setMullSel([]); setConfirmKeep(false) }}>✓ Yes, keep</button>
                <button data-cancel="1" onClick={() => setConfirmKeep(false)}>Cancel</button>
              </div>
            ) : (
              <>
                <button onClick={() => setConfirmKeep(true)}>Keep hand</button>
                <button disabled={mullSel.length === 0} onClick={() => { send({ t: 'mulligan', back: mullSel }); setMullSel([]) }}>
                  Mulligan {mullSel.length} card(s)
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {view.phase === 'mulligan' && !isSpectator && myPlayer.keptHand && (
        <div className="modal"><h3>Waiting for {opp.name} to keep their hand…</h3></div>
      )}

      {/* Pathfinder easier-blaze confirm: laying its topmost atlas site into the clicked void.
          "Blaze here" carries data-confirm so the confirmation hotkey (Enter) resolves it. */}
      {blazeAsk && (
        <div className="modal confirm-concede" data-promptbox="blazeConfirm">
          <h3>Blaze a trail?</h3>
          <p>Play Pathfinder's topmost atlas site at {squareLabel(blazeAsk.x, blazeAsk.y)} and move there.</p>
          <div className="confirm-actions">
            <button data-confirm="1" onClick={() => {
              setBlazePending({ x: blazeAsk.x, y: blazeAsk.y })
              send({ t: 'activate', sourceId: blazeAsk.unitId, ability: 'blaze' })
              setBlazeAsk(null)
              setMode({ m: 'idle' })
            }}>✓ Blaze here</button>
            <button data-cancel="1" onClick={() => setBlazeAsk(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* prompts — hidden while the area-damage confirmation banner is up: the
          direction pick that opened it is still the live engine prompt, so its
          PromptBox would otherwise sit (clickable) behind the Cast/Cancel panel.
          Cancelling areaConfirm returns to idle and re-shows this prompt. */}
      {prompt && promptIsMine && !isSpectator && mode.m !== 'areaConfirm' && (
        <PromptBox view={view} prompt={prompt} send={send} me={me} flip={flip} onHover={showHover} onGoBack={onGoBack} interceptAnswer={tryAreaConfirmFromPrompt} onDirHover={setDirHover} dirPos={dirPanelPos} onDefenderHover={setHoveredDefender} />
      )}
      {prompt && (!promptIsMine || isSpectator) && (
        <div className="promptbanner">Waiting for {view.players[prompt.player].name}…</div>
      )}
      {view.interject && !prompt && (
        <div className="promptbanner">
          ✋ {view.players[view.interject.player].name} is interjecting — each action needs the opponent's approval.
        </div>
      )}

      {mode.m === 'chooseCaster' && (
        <div className="promptbanner" data-modebanner="chooseCaster">
          Who casts {view.cards[mode.cardId]?.name}? — click a caster ({mode.casters.length} legal){' '}
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}
      {mode.m === 'chooseArts' && (() => {
        const cur = mode
        const unit = view.units[cur.unitId]
        const toggle = (id: string) =>
          setMode({ ...cur, picked: cur.picked.includes(id) ? cur.picked.filter((x) => x !== id) : [...cur.picked, id] })
        return (
          <div className="modal" data-promptbox="chooseArts">
            <h3>{cur.kind === 'pickup' ? 'Pick up which artifacts?' : 'Drop which artifacts?'}</h3>
            <div className="mullhand">
              {cur.artIds.map((id) => {
                const a: any = (view.artifacts as any)[id]
                if (!a) return null
                return (
                  <div key={id} data-artchoice={id}
                    className={`handcard ${cur.picked.includes(id) ? 'selected' : ''}`}
                    onMouseEnter={() => showHover(a.name, false, view.cards[a.cardId]?.art)}
                    onClick={() => toggle(id)}>
                    <CardImg name={a.name} className="handimg" />
                  </div>
                )
              })}
            </div>
            <button data-confirm="1" disabled={cur.picked.length === 0}
              onClick={() => {
                if (cur.picked.length === 0) return
                send(cur.kind === 'pickup'
                  ? { t: 'pickUp', unitId: cur.unitId, artifactIds: cur.picked }
                  : { t: 'drop', unitId: cur.unitId, artifactIds: cur.picked })
                setMode(unit ? { m: 'unit', unitId: cur.unitId } : { m: 'idle' })
              }}>
              {cur.kind === 'pickup' ? 'Pick up' : 'Drop'} ({cur.picked.length}/{cur.artIds.length})
            </button>
            <button data-cancel="1" onClick={() => setMode(unit ? { m: 'unit', unitId: cur.unitId } : { m: 'idle' })}>Cancel</button>
          </div>
        )
      })()}
      {mode.m === 'animistChoice' && (
        <AnimistChoiceModal
          cardName={view.cards[mode.cardId]?.name ?? '?'}
          onMagic={() => beginNormalCast(mode.cardId)}
          onSpirit={() => {
            send({ t: 'activate', sourceId: avatar.id, ability: 'animate', extra: { cardId: mode.cardId } })
            setMode({ m: 'idle' })
          }}
          onCancel={() => setMode({ m: 'idle' })}
        />
      )}
      {mode.m === 'siteOrSpell' && (
        <div className="modal" data-modebanner="siteOrSpell">
          <h3>Play as a site, or cast as {mode.morph}?</h3>
          <button data-choice="site" onClick={() => setMode({ m: 'placeSite', cardId: mode.cardId })}>Play as site</button>
          <button data-choice="spell" onClick={() => startMorphCast(mode.cardId, mode.morph, mode.casterId)}>🔥 Cast as {mode.morph}</button>
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>Cancel</button>
        </div>
      )}
      {/* direction picker for ranged / fireball */}
      {mode.m === 'shoot' && (
        <div className="modal" data-modebanner="shoot" style={dirPanelPos ? { left: dirPanelPos.left, top: dirPanelPos.top } : undefined}>
          <h3>Choose a direction</h3>
          {(['n', 'w', 'e', 's'] as const).map((d) => (
            <button key={d} data-choice={d}
              onMouseEnter={() => setDirHover(d)} onMouseLeave={() => setDirHover(null)}
              onClick={() => {
                const isCard = mode.unitId.startsWith('c')
                if (isCard) send({ t: 'castSpell', cardId: mode.unitId, casterId: mode.casterId ?? avatar.id, extra: { direction: d } })
                else send({ t: 'activate', sourceId: mode.unitId, ability: 'ranged', extra: { direction: d } })
                setDirHover(null); setMode({ m: 'idle' })
              }}>
              {dirLabel(d, flip)}
            </button>
          ))}
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>Cancel</button>
        </div>
      )}

      {/* Chaos Twister: blow direction + cone confirm */}
      {mode.m === 'blowTarget' && (
        <div className="promptbanner" data-modebanner="blowTarget">
          🌪 Click the minion to place on the back of your hand — <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}
      {mode.m === 'blowOrigin' && (
        <div className="promptbanner" data-modebanner="blowOrigin">
          🌪 Click the square you blow FROM — <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}
      {mode.m === 'blowDir' && (
        <div className="modal" data-modebanner="blowDir">
          <h3>🌪 Blow in which direction?</h3>
          {(['n', 'w', 'e', 's'] as const).map((d) => (
            <button key={d} data-choice={d} onClick={() => setMode({ m: 'blowConfirm', cardId: mode.cardId, casterId: mode.casterId, targetId: mode.targetId, origin: mode.origin, dir: d })}>
              {d === 'n' ? (flip ? '↓' : '↑') : d === 's' ? (flip ? '↑' : '↓') : d === 'e' ? (flip ? '←' : '→') : flip ? '→' : '←'}
            </button>
          ))}
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>Cancel</button>
        </div>
      )}
      {mode.m === 'blowConfirm' && (
        <div className="promptbanner" data-modebanner="blowConfirm">
          🌪 The cone is drawn — 50% it lands in the cone, 20% elsewhere, 30% off the board.{' '}
          <button
            data-confirm="1"
            onClick={() => {
              send({ t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId, targets: [mode.targetId], extra: { origin: mode.origin, direction: mode.dir } })
              setMode({ m: 'idle' })
            }}
          >
            Blow!
          </button>
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}

      {/* final confirmation for a "printed area" damage spell */}
      {mode.m === 'areaConfirm' && (
        <div className="promptbanner" data-modebanner="areaConfirm">
          {view.cards[(mode.commit as any).cardId ?? '']?.name ?? mode.name}: this area will be damaged.{' '}
          <button
            data-confirm="1"
            onClick={() => { send(mode.commit); setMode({ m: 'idle' }) }}
          >
            Cast
          </button>
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>Cancel</button>
        </div>
      )}

      {/* rip animation overlay */}
      {rip && (
        <div className="ripoverlay">
          <div className="riphalf left">
            <CardImg name={rip} className="ripimg" />
          </div>
          <div className="riphalf right">
            <CardImg name={rip} className="ripimg" />
          </div>
        </div>
      )}

      {/* multi-target prompt accumulation (Swap: pick two) */}
      {mode.m === 'promptTargets' && prompt && mode.promptId === prompt.id && (
        <div className="promptbanner" data-modebanner="promptTargets">
          {prompt.title} ({mode.picked.length}/{prompt.data?.count ?? 1} picked) —{' '}
          {(prompt.data?.upTo || mode.picked.length === (prompt.data?.count ?? 1)) && (
            <button data-confirm="1" onClick={() => { send({ t: 'prompt', promptId: prompt.id, choice: mode.picked }); setMode({ m: 'idle' }) }}>confirm</button>
          )}
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>clear selection</button>
        </div>
      )}

      {/* genesis target skip */}
      {mode.m === 'genesisTargets' && (
        <div className="promptbanner" data-modebanner="genesisTargets">
          Choose a target for {view.cards[mode.cardId]?.name}'s Genesis (click a unit) —{' '}
          <button data-skip="1" onClick={() => { send({ t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId, at: mode.at, targets: [] }); setMode({ m: 'idle' }) }}>
            skip
          </button>
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}

      {(mode.m === 'magic' || mode.m === 'abilityTargets') && (
        <div className="promptbanner" data-modebanner={mode.m} data-spec-what={currentSpec()?.what ?? undefined}>
          {currentSpec()?.label ?? 'Choose a target'} —{' '}
          {/* optional (`upTo`) choices — e.g. the Gifts' "an allied minion" — can be declined:
              cast/activate with whatever's been picked so far (0 for a bare Gift → just draws). */}
          {currentSpec()?.upTo && (mode.m === 'magic' || mode.m === 'abilityTargets') && (
            <button data-skip="1" onClick={() => {
              if (mode.m === 'magic') send({ t: 'castSpell', cardId: mode.cardId, casterId: mode.casterId, targets: mode.picked })
              else if (mode.m === 'abilityTargets') send({ t: 'activate', sourceId: mode.sourceId, ability: mode.abilityKey, targets: mode.picked })
              setMode({ m: 'idle' })
            }}>skip</button>
          )}{' '}
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}
      {(mode.m === 'placeSite' || mode.m === 'summon' || mode.m === 'aura') && (
        <div className="promptbanner" data-modebanner={mode.m}>
          {mode.m === 'summon' && getScript(view.cards[mode.cardId]?.name ?? '')?.summonTargetsCarriable
            ? 'Choose a square or carriable artifact'
            : 'Choose a square'} — <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}
      {mode.m === 'conjure' && (
        <div className="promptbanner" data-modebanner="conjure">
          Click a site to place the artifact, or a highlighted unit to hand it over —{' '}
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}
      {mode.m === 'moveRegion' && (
        <div className="promptbanner" data-modebanner="moveRegion">
          Move where?{' '}
          {mode.regions.map((r) => (
            <button
              key={r}
              data-choice={r}
              onClick={() => {
                if (mode.m !== 'moveRegion') return
                const u = view.units[mode.unitId]
                if (!u) return setMode({ m: 'idle' })
                // Surface → the attack CHOOSER first (openMoveChoice finds any enemies/site to
                // fight, plus move/dive options), which defers into the route picker per choice.
                // Subsurface → a plain relocation: route-pick directly (dive is a single step).
                if (r === 'surface') {
                  const p = findPath(st, u, { x: mode.x, y: mode.y, region: 'surface' })
                  const foeSite = mode.siteId ? (view.sites as any)[mode.siteId] : null
                  if (p !== null) openMoveChoice(u, { x: mode.x, y: mode.y, region: 'surface' }, p, foeSite)
                } else {
                  beginRouteSelection(u, { x: mode.x, y: mode.y, region: r })
                }
              }}
            >
              {r === 'surface' ? '🏔 Surface' : r === 'underground' ? '⛏ Underground' : r === 'underwater' ? '🌊 Underwater' : '🌀 Void'}
            </button>
          ))}
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}
      {mode.m === 'summonRegion' && (
        <div className="promptbanner" data-modebanner="summonRegion">
          Summon where?{' '}
          {mode.regions.map((r) => (
            <button key={r} data-choice={r} onClick={() => { castWithTargets(mode.cardId, mode.casterId, { x: mode.x, y: mode.y, region: r }); }}>
              {r === 'surface' ? '🏔 Surface' : r === 'underground' ? '⛏ Underground' : r === 'underwater' ? '🌊 Underwater' : '🌀 Void'}
            </button>
          ))}
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}
      {mode.m === 'moveChoice' && (
        <div className="promptbanner" data-modebanner="moveChoice"
          style={moveChoicePos ? { left: moveChoicePos.left, top: moveChoicePos.top, bottom: 'auto' } : undefined}>
          {mode.choices.map((c, i) => (
            <button key={i} data-choice={i}
              onMouseEnter={() => {
                setHoveredChoice(i)
                const uid = c.attack && 'unit' in c.attack ? c.attack.unit : c.pick?.[0]
                const sid = c.attack && 'site' in c.attack ? c.attack.site : undefined
                if (uid) showHover(view.units[uid]?.name ?? null)
                else if (sid) showHover((view.sites as any)[sid]?.name ?? null)
              }}
              onMouseLeave={() => setHoveredChoice(null)}
              onClick={() => { if (mode.m === 'moveChoice') commitMoveChoice(mode.unitId, c, mode.path) }}>
              {c.label}
            </button>
          ))}
          {mode.path.length > 0 && (
            <button data-choice="move-only" onClick={() => { if (mode.m === 'moveChoice') commitMoveChoice(mode.unitId, {}, mode.path) }}>
              🚶 Move only
            </button>
          )}
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}
      {mode.m === 'pickTargetUnit' && (
        <div className="promptbanner" data-modebanner="pickTargetUnit">
          <span>Attack which {mode.name}? <b>Click one.</b></span>
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}
      {mode.m === 'pathChoice' && (
        <div className="promptbanner" data-modebanner="pathChoice"
          style={pathChoicePos ? { left: pathChoicePos.left, top: pathChoicePos.top, bottom: 'auto' } : undefined}>
          <span>Route to {squareLabel(mode.dest.x, mode.dest.y)}?</span>
          {mode.paths.map((p, i) => {
            const via = p.slice(0, -1).map((s) => `${squareLabel(s.x, s.y)}`).join(' → ')
            return (
              <button key={i} data-choice={i} data-route={i}
                style={{ borderLeft: `5px solid ${PATH_PALETTE[i % PATH_PALETTE.length]}` }}
                onMouseEnter={() => setRouteHover(p)} onMouseLeave={() => setRouteHover(null)}
                onClick={() => {
                  setRouteHover(null)
                  // `after` fires the pre-chosen attack along the route; otherwise it just moves.
                  if (mode.m !== 'pathChoice') return
                  const mover = view.units[mode.unitId]
                  if (mover) resolveRoute(mover, mode.dest, p, mode.after)
                }}>
                {via ? `via ${via}` : 'direct'}
              </button>
            )
          })}
          <button data-cancel="1" onClick={() => { setRouteHover(null); setMode({ m: 'idle' }) }}>cancel</button>
        </div>
      )}
      {mode.m === 'howMove' && (
        <div className="promptbanner" data-modebanner="howMove"
          style={pathChoicePos ? { left: pathChoicePos.left, top: pathChoicePos.top, bottom: 'auto' } : undefined}>
          <span>Move to {squareLabel(mode.dest.x, mode.dest.y)} — how?</span>
          <button data-choice="auto" onClick={() => {
            if (mode.m !== 'howMove') return
            const mover = view.units[mode.unitId]
            // the true shortest route is findPath's BFS result, NOT the shortest of the (possibly
            // budget-truncated) enumerated set. dest is reachable here (we're only in howMove because
            // routes exist), so findPath always returns a path.
            const p = mover && findPath(st, mover, mode.dest)
            if (mover && p) resolveRoute(mover, mode.dest, p, mode.after)
          }}>⚡ Auto (shortest)</button>
          <button data-choice="manual" onClick={() => {
            if (mode.m !== 'howMove') return
            const mover = view.units[mode.unitId]
            if (mover) setMode({ m: 'manualMove', unitId: mover.id, dest: mode.dest, steps: [], budget: maxSteps(st, mover), after: mode.after })
          }}>👣 Make manual steps</button>
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}
      {mode.m === 'manualMove' && (() => {
        const ms = manualState()
        if (!ms) return null
        const at = ms.pos
        const remaining = mode.budget - ms.spent
        return (
          <div className="promptbanner" data-modebanner="manualMove"
            style={pathChoicePos ? { left: pathChoicePos.left, top: pathChoicePos.top, bottom: 'auto' } : undefined}>
            {mode.stuck ? (
              <>
                <span>Ended at {squareLabel(at.x, at.y)}, not {squareLabel(mode.dest.x, mode.dest.y)}. Move there anyway?</span>
                <button data-confirm="1" onClick={() => { if (mode.m === 'manualMove') resolveRoute(ms.u, mode.dest, mode.steps, mode.after) }}>Move there</button>
                <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>Cancel</button>
              </>
            ) : mode.atDest ? (
              <>
                <span>🏁 Reached {squareLabel(at.x, at.y)} — <b>{remaining}</b> step{remaining === 1 ? '' : 's'} still left</span>
                <button data-stop="1" onClick={() => manualStop()}>⏹ Stop here</button>
                <button data-continue="1" onClick={() => { if (mode.m === 'manualMove') setMode({ ...mode, atDest: false }) }}>▶ Keep moving</button>
                <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>Cancel</button>
              </>
            ) : (
              <>
                <span>👣 Step toward {squareLabel(mode.dest.x, mode.dest.y)} — <b>{remaining}</b> step{remaining === 1 ? '' : 's'} left</span>
                <button data-stop="1" onClick={() => manualStop()}>⏹ Stop here</button>
                <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>Cancel</button>
              </>
            )}
          </div>
        )
      })()}
      {mode.m === 'judgePlace' && (
        <div className="promptbanner" data-modebanner="judgePlace" data-judge-place={mode.op}>
          ⚖ {mode.op === 'move' ? 'Move to' : mode.op === 'moveArtifact' ? 'Move artifact to' : mode.op === 'placeSite' ? 'Place site at' : mode.op === 'spawnArtifact' ? 'Spawn artifact at' : 'Summon at'}{' '}
          <b>{mode.op === 'move' ? (view.units[mode.unitId!]?.name ?? '') : mode.op === 'moveArtifact' ? (view.artifacts?.[mode.artifactId!]?.name ?? '') : mode.name}</b> — click a square.
          {mode.op !== 'placeSite' && (
            <select
              data-judge-region
              value={mode.region}
              onChange={(e) => setMode({ ...mode, region: e.target.value as Region })}
            >
              <option value="surface">surface</option>
              <option value="underground">underground</option>
              <option value="underwater">underwater</option>
              <option value="void">void</option>
            </select>
          )}
          <button data-cancel="1" onClick={() => setMode({ m: 'idle' })}>cancel</button>
        </div>
      )}

      {/* judge tools */}
      {showJudge && !isSpectator && (
        <JudgePanel view={view} me={me} send={send} selectedUnitId={mode.m === 'unit' ? mode.unitId : null} selectedSiteId={mode.m === 'site' ? mode.siteId : null} selectedArtifactId={mode.m === 'artifact' ? mode.artifactId : null} selectedAuraId={mode.m === 'editAura' ? mode.auraId : null} setMode={setMode} onClose={() => setShowJudge(false)} onSaveScenario={onSaveScenario} />
      )}

      {/* zone viewer: cemetery / banished (both public) / your collection */}
      {zoneView && zoneView.zone === 'collection' && (() => {
        const col: Record<string, number> = (view.players[me] as any).collection ?? {}
        const owned = Object.keys(col).filter((n) => col[n] > 0).sort()
        return (
          <div className="modal" style={zoneDrag.style}>
            <h3 {...zoneDrag.handleProps}>{myPlayer.name}'s collection ({owned.length} distinct)</h3>
            <div className="mullhand">
              {owned.map((n) => (
                <div key={n} className="handcard" onMouseEnter={() => showHover(n)}>
                  <CardImg name={n} className="handimg" />
                  <span className="artbadge">×{col[n]}</span>
                </div>
              ))}
              {owned.length === 0 && <i>empty — this deck has no collection</i>}
            </div>
            <button onClick={() => setZoneView(null)}>Close</button>
          </div>
        )
      })()}
      {zoneView && zoneView.zone !== 'collection' && (() => {
        const pl = view.players[zoneView.pid]
        const ids: string[] = zoneView.zone === 'cemetery' ? pl.cemetery : pl.banished
        // "from cemetery" activatable abilities, grouped by card — for YOUR own cemetery on your turn.
        const cemActs = zoneView.zone === 'cemetery' && zoneView.pid === me ? cemeteryActivations(st, me) : []
        const actsByCard = new Map(cemActs.map((c) => [c.cardId, c.abilities]))
        // fire a cemetery ability through the same path the avatar's ability buttons use (targets → picker)
        const activateCem = (a: any) => {
          setZoneView(null)
          const specs = a.targets ?? []
          const needed = specs.reduce((n: number, s: any) => n + s.count, 0)
          if (needed > 0) setMode({ m: 'abilityTargets', sourceId: avatar.id, abilityKey: a.key, specs, picked: [] })
          else send({ t: 'activate', sourceId: avatar.id, ability: a.key })
        }
        return (
          <div className="modal" style={zoneDrag.style}>
            <h3 {...zoneDrag.handleProps}>{pl.name}'s {zoneView.zone}</h3>
            <div className="mullhand">
              {ids.map((id) => {
                const name = view.cards[id]?.name ?? '?'
                const castable =
                  zoneView.zone === 'cemetery' && zoneView.pid === me && myTurn &&
                  !!getScript(name)?.castFromCemetery && legalCasters(id).length > 0
                const acts = actsByCard.get(id) ?? []
                // a slimy-green glow marks a card with any "from the cemetery" effect
                const glow = acts.length > 0
                return (
                  <div key={id} className="handcard" data-cem-glow={glow ? '1' : undefined}
                    style={glow ? { boxShadow: '0 0 12px 3px #9acd32, inset 0 0 6px #6b8e23', borderRadius: 6 } : undefined}
                    onMouseEnter={() => showHover(name)}>
                    <CardImg name={name} className="handimg" />
                    {castable && (
                      <button data-cast-cemetery={id} onClick={() => { setZoneView(null); clickHandCard(id) }}>⚰ Cast</button>
                    )}
                    {myTurn && acts.map((a: any) => {
                      const ok = (() => { try { return canActivate(st, me, avatar.id, a.key) === null } catch { return false } })()
                      return (
                        <button key={a.key} data-cem-activate={a.key} disabled={!ok} title={a.label}
                          onClick={() => activateCem(a)}>⚗ {a.label}</button>
                      )
                    })}
                  </div>
                )
              })}
              {ids.length === 0 && <i>empty</i>}
            </div>
            <button onClick={() => setZoneView(null)}>Close</button>
          </div>
        )
      })()}

      {/* expandable per-player detail: thresholds, deck counts, and zone shortcuts —
          opened by clicking a player bar (the compact mobile bars hide these inline). */}
      {barInfo !== null && (
        <PlayerInfoPopup
          view={view}
          pid={barInfo}
          me={me}
          onZone={(z) => { setZoneView({ pid: barInfo, zone: z }); setBarInfo(null) }}
          onClose={() => setBarInfo(null)}
        />
      )}
    </div>
  )
}

function PlayerInfoPopup({ view, pid, me, onZone, onClose }: {
  view: PlayerView; pid: PlayerId; me: PlayerId
  onZone: (zone: 'cemetery' | 'banished' | 'collection') => void
  onClose: () => void
}) {
  const p = view.players[pid]
  const avatar = view.units[p.avatarUnitId]
  const aff = affinity(view as any, pid)
  // "from the cemetery" abilities of your own graveyard cards, grouped by card, for the widget tooltip
  const cemActs = pid === me ? cemeteryActivations(view as any, me) : []
  const cemTip = cemActs.length
    ? 'From your cemetery:\n' + cemActs.map((c) => `• ${c.name}: ${c.abilities.map((a) => a.label).join('; ')}`).join('\n')
    : null
  return (
    <div className="modal playerinfo" data-playerinfo={pid}>
      <h3>{p.name}</h3>
      <div className="pi-row">
        <span title="Life">❤ {avatar?.life ?? '-'}</span>
        <span title="Mana">◆ {p.mana}</span>
      </div>
      <div className="pi-row pi-thresh" title="Elemental thresholds (from controlled sites)">
        <span className="el-air"><ThreshTri el="air" />{aff.air}</span>
        <span className="el-earth"><ThreshTri el="earth" />{aff.earth}</span>
        <span className="el-fire"><ThreshTri el="fire" />{aff.fire}</span>
        <span className="el-water"><ThreshTri el="water" />{aff.water}</span>
      </div>
      <div className="pi-row pi-decks">
        <span title="Cards in hand">hand {p.handCounts.spells + p.handCounts.sites}</span>
        <span title="Spellbook (spell deck)">spellbook {p.spellbookCount}</span>
        <span title="Atlas (site deck)">atlas {p.atlasCount}</span>
      </div>
      <div className="pi-row pi-zones">
        <button data-cem-tip={cemTip ? '1' : undefined} title={cemTip ?? (pid === me ? 'Open/close your cemetery (C)' : "Open/close opponent's cemetery (X)")} onClick={() => onZone('cemetery')}>⚰ Cemetery ({p.cemetery.length}{cemActs.length ? ` · ⚗${cemActs.length}` : ''})</button>
        <button onClick={() => onZone('banished')}>🚫 Banished ({p.banished.length})</button>
        {pid === me && <button title="Open/close your collection (A)" onClick={() => onZone('collection')}>🎴 Collection</button>}
      </div>
      <button onClick={onClose}>Close</button>
    </div>
  )
}

// ---- subcomponents ----

/** pixel rect spanning the displayed squares (board coords → CSS, flip-aware) */
// Site squares use the NATIVE site-art aspect ratio (531:380 ≈ 1.3974) so the art
// fills the square with no cropping (object-fit: cover == contain at this ratio).
const SQ_W = 211
const SQ_H = 151
const GAP = 4
const DWELL = 500 // ms a walking unit dwells per square (also how long the battle popup waits for a walk)
// Fixed mobile "design" canvas: the whole game is laid out at this size then uniformly
// scaled to the device's visible viewport (see uiScale). Matches the phone-frame
// simulator (.app.mobile-sim.at-game) and the .game.mobile CSS width/height.
const MOBILE_DESIGN_W = 866
const MOBILE_DESIGN_H = 400
// Fixed DESKTOP "design" canvas: the whole game is laid out at this size (16:9) then
// uniformly scaled to the viewport, so the view is IDENTICAL on any resolution monitor
// (bigger/smaller, never reflowed). Keep in sync with `.game.scaled` in styles.css.
const DESKTOP_DESIGN_W = 1600
const DESKTOP_DESIGN_H = 900
// Left action rail (square icon+label tiles, like the mobile left menu) and the right sidebar
// (card preview + log). Both are kept compact so the central board gets the most room. A column
// gap separates the rail from the board (and the board from the sidebar).
const RAIL_W = 94
const SIDEBAR_MIN = 286
const COL_GAP = 24
// Width of the vertical scrollbar reserved inside the (scrollable) board column, so the board
// stays flush and never triggers a HORIZONTAL scrollbar. BOARD_SCROLL_GAP is extra space placed
// between the board's right edge and that scrollbar (the board is left-aligned in its column).
const SCROLLBAR_W = 14
const BOARD_SCROLL_GAP = 22
// The board is EITHER width- or height-limited (whichever is smaller). NONBOARD_V is the HEIGHT
// budget reserved for everything else in the board column (topbar + the two player bars + the
// hand's visible TOP HALF + margins), so the height cap `availH = 900 - NONBOARD_V` keeps the
// board from growing so tall that the hand is pushed off-screen. On a WIDE-aspect viewport (e.g.
// a real browser with tabs/address-bar chrome) the board is height-limited, so this — not the
// sidebar (a width lever) — is what controls its size there. Tuned so the board + bars + the
// hand's top half fit the visible column and only the hand's lower half scrolls below the fold.
const NONBOARD_V = 220
/** How many columns to pack a crowded location into, so >6 co-located minions
 *  tile into a progressively smaller, non-overlapping grid instead of spilling
 *  over the square. Rows follow as ceil(n/cols) (grid-auto-rows: 1fr fills the
 *  square), reproducing the requested layouts: 8→2×4, 12→3×4, 15→3×5, 18→3×6,
 *  28→4×7. Returns 0 for the normal (≤6) free-flow layout. */
function unitsGridCols(n: number): number {
  if (n <= 6) return 0
  if (n <= 12) return 4
  if (n <= 15) return 5
  if (n <= 18) return 6
  return 7 // ≥19 (and beyond 28 — no point tiling smaller)
}
/** For an UNCROWDED location (≤6 units) — how many columns to tile into so fewer
 *  units render BIGGER: 1 or 2 across (big), 3 across (medium), 4 as a 2×2, 5–6 as
 *  3-across (3 / 3+2 / 3+3). Each cell then sizes its chip to fit while keeping the
 *  card's portrait shape (see .units.tiled). Returns 0 when the crowded grid applies. */
function unitsTileCols(n: number): number {
  if (n <= 0 || n > 6) return 0
  if (n <= 2) return n // 1 → single centred cell (small chip); 2 → 2 across
  if (n === 4) return 2 // 2×2
  return 3 // 3, 5, 6 → 3 across
}
/** split an aura's squares into 4-connected clusters, so a Magellan-Globe-wrapped
 *  aura (two groups on opposite edges) renders as separate boxes, not one blob. */
function clusterSquares(squares: { x: number; y: number }[]): { x: number; y: number }[][] {
  const key = (s: { x: number; y: number }) => `${s.x},${s.y}`
  const byKey = new Map(squares.map((s) => [key(s), s]))
  const visited = new Set<string>()
  const clusters: { x: number; y: number }[][] = []
  for (const s of squares) {
    if (visited.has(key(s))) continue
    const stack = [s]
    const cluster: { x: number; y: number }[] = []
    visited.add(key(s))
    while (stack.length) {
      const c = stack.pop()!
      cluster.push(c)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nk = `${c.x + dx},${c.y + dy}`
        if (byKey.has(nk) && !visited.has(nk)) { visited.add(nk); stack.push(byKey.get(nk)!) }
      }
    }
    clusters.push(cluster)
  }
  return clusters
}

function overlayRect(squares: { x: number; y: number }[], flip: boolean): React.CSSProperties {
  const cols = squares.map((s) => (flip ? GRID_W - 1 - s.x : s.x))
  const rows = squares.map((s) => (flip ? s.y : GRID_H - 1 - s.y))
  const c0 = Math.min(...cols)
  const c1 = Math.max(...cols)
  const r0 = Math.min(...rows)
  const r1 = Math.max(...rows)
  return {
    position: 'absolute',
    left: c0 * (SQ_W + GAP),
    top: r0 * (SQ_H + GAP),
    width: (c1 - c0 + 1) * SQ_W + (c1 - c0) * GAP,
    height: (r1 - r0 + 1) * SQ_H + (r1 - r0) * GAP,
  }
}

/** a bar covering the border between two adjacent squares */
function wallRect(edge: { a: { x: number; y: number }; b: { x: number; y: number } }, flip: boolean): React.CSSProperties {
  const col = (x: number) => (flip ? GRID_W - 1 - x : x)
  const row = (y: number) => (flip ? y : GRID_H - 1 - y)
  const THICK = 10
  if (edge.a.y === edge.b.y) {
    // vertical wall between horizontal neighbors
    const cRight = Math.max(col(edge.a.x), col(edge.b.x))
    const r = row(edge.a.y)
    return {
      position: 'absolute',
      left: cRight * (SQ_W + GAP) - GAP / 2 - THICK / 2,
      top: r * (SQ_H + GAP) + 8,
      width: THICK,
      height: SQ_H - 16,
    }
  }
  // horizontal wall between vertical neighbors
  const rLower = Math.max(row(edge.a.y), row(edge.b.y))
  const c = col(edge.a.x)
  return {
    position: 'absolute',
    left: c * (SQ_W + GAP) + 8,
    top: rLower * (SQ_H + GAP) - GAP / 2 - THICK / 2,
    width: SQ_W - 16,
    height: THICK,
  }
}

/**
 * Animated blue aura for warded units/sites. An absolutely-positioned SVG
 * frame that pulses via CSS opacity (compositor-only → cheap). Drawn inset so
 * it survives the parent's `overflow: hidden`. pointer-events:none so clicks
 * still reach the card underneath.
 */
// ---- log card-name linking -----------------------------------------------
// A single regex of every card name (longest first so multi-word names win over
// their fragments; case-SENSITIVE so common words like "sleep" in prose don't get
// mistaken for the card "Sleep"). Built lazily on first log render.
let _cardRegex: RegExp | null = null
function cardNameRegex(): RegExp {
  if (!_cardRegex) {
    const names = allCards.map((c) => c.name).filter(Boolean).sort((a, b) => b.length - a.length)
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    _cardRegex = new RegExp('(' + names.map(esc).join('|') + ')', 'g')
  }
  return _cardRegex
}
/** css class for a card's colour: (one of) its elements, or colourless. */
function cardElemClass(name: string): string {
  const els = (findCard(name)?.elements ?? []) as string[]
  return `cardref elem-${(els[0] ?? 'none').toLowerCase()}`
}

// Element → RGB triplet for on-board aura tinting (matches the .elem-* log-ref palette).
// Colourless auras (no element) keep the original purple.
const ELEM_RGB: Record<string, string> = {
  fire: '255,122,92', water: '90,166,255', air: '134,212,240', earth: '201,160,66', none: '175,130,240',
  doomsday: '18,18,22', // Doomsday Device blast — an ominous near-black grid (numbers re-lit in CSS)
}
// Auras use DEEPER fire/water than the shared element palette: a bloodier red and a darker blue that
// won't be mistaken for the player-control colours (salmon #ff7a7a / sky #56b7ff) on aura borders.
const AURA_ELEM_RGB: Record<string, string> = { fire: '178,34,34', water: '30,96,200' }
/** the element colours of an aura card (one → [c], multi → [c1,c2…], none → the purple fallback) */
function auraRgbs(name: string): string[] {
  const els = ((findCard(name)?.elements ?? []) as string[]).map((e) => e.toLowerCase()).filter((e) => ELEM_RGB[e])
  return (els.length ? els : ['none']).map((e) => AURA_ELEM_RGB[e] ?? ELEM_RGB[e])
}
/** inline tint for a 2x2 / 1x1 area-aura box, coloured by its element(s) (multi = blended). */
function auraTint(name: string): React.CSSProperties {
  const rgbs = auraRgbs(name)
  const multi = rgbs.length > 1
  // The aura's EFFECT AREA is coloured by its ELEMENT(S) — fill, inner glow, and border. (Control
  // colour goes on the aura's CARD instead, so the two read distinctly: element = the effect, player
  // = who owns it.) The BOTTOM border is kept far more transparent than the other three, so it doesn't
  // blend with the site's owner colour-bar (a 4px strip along the site's bottom edge).
  const base: React.CSSProperties = {
    background: multi
      ? `linear-gradient(135deg, ${rgbs.map((c) => `rgba(${c},0.16)`).join(', ')})`
      : `rgba(${rgbs[0]},0.16)`,
    // a tight border-hugging inner glow (bright, small spread) over the softer area glow, so the border
    // reads as luminous element-light bleeding inward
    boxShadow: `inset 0 0 9px rgba(${rgbs[0]},0.60), inset 0 0 22px rgba(${rgbs[0]},0.30)`,
  }
  if (multi) {
    // gradient border on top/right/left; the bottom (image-width 0) falls back to the faint colour
    return {
      ...base,
      borderColor: `rgba(${rgbs[0]},0.12)`,
      borderImageSource: `linear-gradient(135deg, ${rgbs.map((c) => `rgb(${c})`).join(', ')})`,
      borderImageSlice: 1,
      borderImageWidth: '1 1 0 1',
    }
  }
  return {
    ...base,
    borderTopColor: `rgba(${rgbs[0]},0.78)`,
    borderLeftColor: `rgba(${rgbs[0]},0.78)`,
    borderRightColor: `rgba(${rgbs[0]},0.78)`,
    borderBottomColor: `rgba(${rgbs[0]},0.12)`,
  }
}
/** saturated fill for a thin wall-aura bar, coloured by its element(s). */
function auraWallBg(name: string): string {
  const rgbs = auraRgbs(name)
  return rgbs.length > 1
    ? `linear-gradient(135deg, ${rgbs.map((c) => `rgba(${c},0.85)`).join(', ')})`
    : `rgba(${rgbs[0]},0.85)`
}
/** a log line with every card name turned into a coloured, clickable reference
 *  (click / hover → show it in the lateral detail panel). */
function LogLine({ msg, onPick }: { msg: string; onPick: (name: string) => void }) {
  const re = cardNameRegex()
  re.lastIndex = 0
  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(msg)) !== null) {
    if (m.index > last) out.push(<span key={k++}>{msg.slice(last, m.index)}</span>)
    const name = m[0]
    out.push(
      <span key={k++} className={cardElemClass(name)} onClick={() => onPick(name)} onMouseEnter={() => onPick(name)}>
        {name}
      </span>,
    )
    last = m.index + name.length
    if (re.lastIndex === m.index) re.lastIndex++ // guard against any zero-length match
  }
  if (last < msg.length) out.push(<span key={k++}>{msg.slice(last)}</span>)
  return <>{out}</>
}

/** FAQ view side panel: the hovered/tapped card's name, a small image, and its official Q/A
 *  rulings. Shows a hint when nothing is hovered or the card has no FAQ. */
function FaqPanel({ name }: { name: string | null }) {
  const qas = faqFor(name)
  return (
    <div className="faqpanel">
      {!name ? (
        <p className="faq-hint">📖 <b>FAQ view</b> — cards with official rulings glow gold. Hover (or tap on mobile) one to read its FAQ here.</p>
      ) : !qas ? (
        <>
          <div className="faq-cardname">{name}</div>
          <p className="faq-hint">No FAQ entries for this card.</p>
        </>
      ) : (
        <>
          <div className="faq-head">
            <CardImg name={name} className="faq-thumb" />
            <div className="faq-cardname">{name}<span className="faq-count">{qas.length} ruling{qas.length > 1 ? 's' : ''}</span></div>
          </div>
          <div className="faq-list">
            {qas.map((e, i) => (
              <div key={i} className="faq-qa">
                <div className="faq-q"><b>Q.</b> {e.q}</div>
                <div className="faq-a"><b>A.</b> {e.a}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function WardGlow({ strong }: { strong?: boolean }) {
  return (
    <svg className={`wardglow${strong ? ' wardglow-strong' : ''}`} preserveAspectRatio="none" aria-hidden="true">
      <rect x="1.5%" y="1.5%" width="97%" height="97%" rx="6" ry="6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Evil icon: a red, fully-geometric inverted pentacle — a {5/2} star polygon inscribed in a
 *  circle, from its EXACT vertices (5 points at 18°/90°/162°/234°/306° on a radius-9.5 circle,
 *  connected every-other), stroked. Pure geometry (circle + straight lines), hard-coded red. */
function EvilIcon({ className }: { className?: string }) {
  return (
    <svg className={`evil-ico ${className ?? ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10.6" />
      <path d="M21.04 14.94 L2.96 14.94 L17.58 4.31 L12 21.5 L6.42 4.31 Z" />
    </svg>
  )
}

/**
 * Big center pop-up announcing a card the opponent just played into the realm
 * (art + full text, same detail as the lateral panel). It auto-dismisses after
 * 3s, but hovering it pauses the countdown (so you can read it), and the ▶
 * continue button dismisses it immediately. The parent keys this by the play
 * counter, so each fresh play remounts it with a fresh timer.
 */
function OppPlayPopup({ name, onClose }: { name: string; onClose: () => void }) {
  const [paused, setPaused] = useState(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => closeRef.current(), 3000)
    return () => clearTimeout(t)
  }, [paused])
  return (
    <div className="oppplay-pop" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="oppplay-card">
        <div className="oppplay-label">Opponent played</div>
        <CardHover name={name} />
      </div>
      <button className="oppplay-continue" onClick={onClose} title="Continue">▶</button>
    </div>
  )
}

/**
 * Close-only popup shown to the OPPONENT when a player publicly reveals card(s)
 * (Common Sense's tutor, Black Mass's drawn Evil minions…). Lists each revealed card as a
 * thumbnail; hovering/clicking one mirrors it into the lateral detail panel (onHover). It
 * does nothing else — the only control is Close. It persists until dismissed (no timer), so
 * you don't miss it. `data-reveal-pop` marks it for tests.
 */
function RevealPopup({ names, onHover, onClose }: { names: string[]; onHover: (name: string | null) => void; onClose: () => void }) {
  return (
    <div className="reveal-pop" data-reveal-pop>
      <div className="reveal-pop-head">👁 Opponent revealed{names.length > 1 ? ` ${names.length} cards` : ''}</div>
      <div className="reveal-pop-cards">
        {names.map((name, i) => (
          <button key={`${name}-${i}`} className="reveal-pop-card" data-reveal-card={name}
            onMouseEnter={() => onHover(name)} onFocus={() => onHover(name)} onClick={() => onHover(name)} title={name}>
            <CardImg name={name} className="reveal-pop-img" />
            <span className="reveal-pop-name">{name}</span>
          </button>
        ))}
      </div>
      <button className="reveal-pop-close" onClick={onClose}>Close</button>
    </div>
  )
}

// ---- cardinal-direction helpers (shared by the projectile picker and any
// chooseOption prompt whose options are the cardinal directions) ----
const CARDINALS = ['n', 's', 'e', 'w']
function isCardinalOptions(opts: string[]): boolean {
  return opts.length > 0 && opts.every((o) => CARDINALS.includes(o))
}
/** board-oriented label for a cardinal direction (player 1 sees it flipped). */
function dirLabel(d: string, flip: boolean): string {
  if (d === 'n') return flip ? '↓ toward you' : '↑ away'
  if (d === 's') return flip ? '↑ away' : '↓ toward you'
  if (d === 'e') return flip ? '←' : '→'
  if (d === 'w') return flip ? '→' : '←'
  return d
}
/** present the given directions in a stable compass order (top, left, right, bottom). */
function cardinalOrder(opts: string[]): string[] {
  return (['n', 'w', 'e', 's'] as const).filter((d) => opts.includes(d))
}
/** on-SCREEN direction a board cardinal points once the board flip is applied (matches dirLabel:
 *  the board renders higher y at the TOP for p0, and is mirrored for p1). Drives the conveyor
 *  chevron rotation so it always points the way the direction's option arrow does. */
function beltScreenDir(dir: string, flip: boolean): 'up' | 'down' | 'left' | 'right' {
  if (dir === 'n') return flip ? 'down' : 'up'
  if (dir === 's') return flip ? 'up' : 'down'
  if (dir === 'e') return flip ? 'left' : 'right'
  return flip ? 'right' : 'left' // 'w'
}
/** colour for the conveyor chevrons — the element of the magic (or the source unit). */
function elementColor(elements?: string[]): string {
  const s = (elements ?? []).map((e) => e.toLowerCase())
  if (s.includes('fire')) return '#ff6a3d'
  if (s.includes('water')) return '#4fb8ff'
  if (s.includes('air')) return '#ffe04a'
  if (s.includes('earth')) return '#7bd88a'
  return '#8ad6c8' // None / colourless → soft teal
}

/**
 * Unit status aura (ward = blue, branded-Evil = red, stealth = military green).
 * `ring` nests multiple auras as concentric frames so a unit with several shows
 * all of them at once instead of one covering the others.
 */
type AuraVariant = 'ward' | 'evil' | 'stealth' | 'door'
function Aura({ variant, ring = 0 }: { variant: AuraVariant; ring?: number }) {
  const inset = 1.5 + ring * 4
  const size = 100 - 2 * inset
  return (
    <svg className={`aura aura-${variant}`} preserveAspectRatio="none" aria-hidden="true">
      <rect x={`${inset}%`} y={`${inset}%`} width={`${size}%`} height={`${size}%`} rx="6" ry="6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// A unit rendered by the animation layer rather than the engine: a death fade, a teleport zap, or a
// mid-WALK chip. It rides in the normal per-square unit list so it tiles at the SAME card size/slot a real
// card would, plays its keyframes, and is dropped. `_slot` is its original tile index (death/teleout).
// CRITICAL: the 'move' variant is driven purely by the moveAnim record (name + route), NOT the live unit —
// a Move & Attack frequently kills the attacker, so the card must be able to walk even after it's gone.
type AnimUnit = UnitState & { _anim: 'death' | 'teleout' | 'move'; _slot: number; _gid: string | number }

// The card-sized chip for an AnimUnit: a plain `.unit` (so it inherits the grid/tile sizing of its square)
// showing just the art + tapped rotation, non-interactive, running the death/teleport/walk animation.
function AnimGhost({ u }: { u: AnimUnit }) {
  return (
    <div className={`unit anim-ghost anim-${u._anim} ${u.tapped ? 'tapped' : ''}`} aria-hidden="true">
      <CardImg name={u.name} flipped={u.flipped} className="unitimg" />
    </div>
  )
}

function UnitChip({ u, st, me, small, big, ghost, bodyActive, selected, picked, target, glow, anim, matchKey, casterGlow, onClick, onHover, onArtClick, artTargets }: {
  u: UnitState; st: any; me: PlayerId; small?: boolean; big?: boolean; ghost?: boolean; bodyActive?: boolean; selected?: boolean; picked?: boolean; target?: boolean
  glow?: 'target' | 'defender' | 'defender-hot' | 'attacker' | 'atk' // combat prompt: attack target (gold, big) / defenders (gold, small; -hot on hover) / attacker (red) / 'atk' = a same-square strike target while I have a unit selected (gold + "⚔ Attack" tooltip)
  anim?: 'move' // this real unit is mid-walk (see moveFx) — glow + float it above its square-mates
  matchKey?: string // subtype view active: highlight this unit if it matches the selected subtype
  casterGlow?: number // spell-cast reveal: this unit just cast — glow gold; the number (reveal id) restarts the animation
  onClick: (ev: React.MouseEvent) => void; onHover: (name: string, flipped?: boolean, art?: string) => void
  onArtClick?: (artId: string, ev: React.MouseEvent) => void; artTargets?: Set<string>
}) {
  let atk = 0
  let def = 0
  try {
    atk = effAttack(st, u)
    def = effDefence(st, u)
  } catch { /* token defs */ }
  const kw = (() => { try { return effKeywords(st, u) } catch { return {} as any } })()
  const disabled = (() => { try { return isDisabled(st, u) } catch { return false } })()
  const branded = st.flow?.branded?.unitId === u.id && st.flow?.branded?.turn === st.turn
  // a masked Imposter wears another avatar's face: show THAT avatar's art (+ a 🎭 badge)
  const maskName: string | undefined =
    u.isAvatar && u.name === 'Imposter' ? st.flow?.imposterMask?.[u.controller] : undefined
  const auras: AuraVariant[] = []
  if (u.isAvatar && u.deathsDoor) auras.push('door')
  // ward is a LIVE mark (u.ward) the engine clears when the unit is disabled or silenced —
  // exactly like stealth below, don't glow off the printed keyword (kw.ward never expires),
  // or a disabled warded unit keeps its glow after its ward has guttered out.
  if (u.ward) auras.push('ward')
  if (branded) auras.push('evil')
  // stealth is a spendable TOKEN (u.stealth), not a permanent trait: a revealed
  // printed-Stealth minion must not keep glowing (kw.stealth never expires)
  if (u.stealth) auras.push('stealth')
  return (
    <div
      data-unit={u.id}
      data-unitname={u.name}
      data-avatar={u.isAvatar ? '1' : undefined}
      data-target={target ? '1' : undefined}
      data-picked={picked ? '1' : undefined}
      data-glow={glow ?? undefined}
      className={`unit ${u.controller === me ? 'mine' : 'theirs'} ${u.tapped ? 'tapped' : ''} ${selected ? 'selected' : ''} ${target ? 'hl-target' : ''} ${glow ? `glow-${glow}` : ''} ${anim ? `anim-${anim}` : ''} ${u.isAvatar ? 'avatar' : ''} ${small ? 'small' : ''} ${big ? 'big' : ''} ${ghost ? 'bodyghost' : ''} ${bodyActive ? 'body-active' : ''} ${hasFaq(u.name) ? 'has-faq' : ''} ${(() => { try { return matchKey && unitMatchesView(st, u, matchKey) ? 'st-match' : '' } catch { return '' } })()}`}
      onClick={onClick}
      onMouseEnter={() => onHover(maskName ?? u.name, maskName ? false : u.flipped, maskName ? undefined : st.cards?.[u.cardId]?.art)}
      title={glow === 'atk' ? `⚔ Attack ${u.name}` : u.name}
    >
      <CardImg name={maskName ?? u.name} flipped={maskName ? false : u.flipped} art={maskName ? undefined : st.cards?.[u.cardId]?.art} className="unitimg" />
      {casterGlow !== undefined && <span key={casterGlow} className="castfx-unitglow castfx-fade" aria-hidden="true" />}
      {auras.map((v, i) => <Aura key={v} variant={v} ring={i} />)}
      <span className="unitstats" title={u.isAvatar ? 'Life / Power' : 'Power / Defence'}>
        <span className="statval">
          {u.isAvatar ? `❤${u.life} ⚔${atk}` : `${atk}/${def}${u.damage ? `(-${u.damage})` : ''}`}
          {/* ranged sits on the RIGHT; lethal is on the right too by default, moving to the LEFT only
              when both are present (so a lone symbol keeps its usual spot). Both absolute → atk/def never moves. */}
          {kw.lethal && <span className={`statbadge kwglyph-white ${kw.ranged ? 'statbadge-left' : 'statbadge-right'}`} title="Lethal — any damage it deals destroys the unit it hits">🗡</span>}
          {kw.ranged && <span className="statbadge statbadge-right kwglyph-white" title={`Ranged ${kw.ranged} — strikes a unit up to ${kw.ranged} location${kw.ranged > 1 ? 's' : ''} away without a counter-strike`}>🏹</span>}
        </span>
      </span>
      {/* status badges laid out in a strip (top-right) so they never overlap each other */}
      <span className="kwbar">
        {maskName && <span className="kw" title={`Masked as ${maskName}`}>🎭</span>}
        {kw.airborne && !maskName && <span className="kw" title="Airborne">🪽</span>}
        {isSummoningSick(st as any, u) && <span className="kw" title="Summoning sickness">🌀</span>}
        {u.stealth && <span className="kw" title="Stealth">👁</span>}
        {u.silenced && <span className="kw" title="Silenced — its abilities are removed">🤐</span>}
        {disabled && <span className="kw" title="Disabled — abilities removed and can't act">🚫</span>}
        {u.ward && <span className="kw" title="Ward">🛡</span>}
        {branded && <span className="kw kw-evil" title="Branded Evil"><EvilIcon /></span>}
        {u.carriedBy && <span className="kw" title="Being carried">🧺</span>}
        {(u.carryingUnits?.length ?? 0) > 0 && <span className="kw" title="Carrying a unit">🐎</span>}
      </span>
      {(u.carrying ?? []).length > 0 && (
        <span className={`carriedarts${(u.carrying ?? []).length === 1 ? ' single' : ''}`} data-count={(u.carrying ?? []).length}>
          {(u.carrying ?? []).map((id) => {
            const art = st.artifacts?.[id]
            if (!art) return null
            return (
              <span key={id} className={`carriedart${art.name === 'Doomsday Device' && art.counters?.fuse === 1 ? ' doom-hot' : ''}${(() => { try { return matchKey && artMatchesView(st, me, art, matchKey) ? ' st-match' : '' } catch { return '' } })()}`} data-artifact={id} data-target={artTargets?.has(id) ? '1' : undefined} title={art.name} onMouseEnter={() => onHover(art.name)} onClick={onArtClick ? (ev) => onArtClick(id, ev) : undefined}>
                <CardImg name={art.name} className="artthumb" />
                {art.name === 'Doomsday Device' && typeof art.counters?.fuse === 'number' && (
                  <span className="doomsday-fuse" title={`Doomsday Device — ${Math.max(0, art.counters.fuse)} tick(s) left`}>{Math.max(0, art.counters.fuse)}</span>
                )}
                {artifactSilenced(st, art) && <span className="kw artsilenced" title="Silenced — its abilities are removed">🤐</span>}
              </span>
            )
          })}
        </span>
      )}
      {/* Dragonlord's set-aside Unique Dragon — shown small (like a carried artifact) inside
          the avatar card. Only on YOUR own Dragonlord (the pick is hidden from the opponent). */}
      {u.isAvatar && u.name === 'Dragonlord' && u.controller === me && st.flow?.dragonlordPick?.[me] && (
        <span className="carriedarts dragonaside">
          <span className="carriedart" data-dragon-aside={st.flow.dragonlordPick[me]} title={`Set aside: ${st.flow.dragonlordPick[me]}`} onMouseEnter={() => onHover(st.flow.dragonlordPick[me])}>
            <CardImg name={st.flow.dragonlordPick[me]} className="artthumb" />
          </span>
        </span>
      )}
      {/* Masked Imposter: the board shows the MASK's face, so pin the REAL Imposter card small in the
          bottom-left — hover it for the card panel / its FAQ ruling. (Masking is public, so both seats see it.) */}
      {maskName && (
        <span className="carriedarts imposterreal">
          <span className={`carriedart ${hasFaq('Imposter') ? 'has-faq' : ''}`} data-imposter-real title="Really an Imposter" onMouseEnter={() => onHover('Imposter')}>
            <CardImg name="Imposter" className="artthumb" />
          </span>
        </span>
      )}
      {/* Brobdingnag Bullfrog (and any belly-carrier): its meal is swallowed out of sight, so pin the
          SWALLOWED minion's card small in the bottom-left — hover it for the card panel / FAQ. */}
      {(u.carryingUnits ?? []).some((id) => { const m = st.units?.[id]; return !!m && carriedInside(st, m) }) && (
        <span className="carriedarts bellymeal">
          {(u.carryingUnits ?? []).map((id) => {
            const meal = st.units?.[id]
            if (!meal || !carriedInside(st, meal)) return null
            return (
              <span key={id} className={`carriedart ${hasFaq(meal.name) ? 'has-faq' : ''}`} data-belly-meal={meal.name} title={`Swallowed: ${meal.name}`} onMouseEnter={() => onHover(meal.name)}>
                <CardImg name={meal.name} className="artthumb" />
              </span>
            )
          })}
        </span>
      )}
      {disabled && <img className="marker" src="/tokens/disabled.webp" alt="disabled" title="Disabled" />}
      {(() => {
        // cards this minion is holding face-down (Pith Imp's stolen spell, etc.)
        const held = ((st.flow?.stolen ?? []) as { unitId: string }[]).filter((e) => e.unitId === u.id).length
        return held > 0 ? (
          <span className="heldcards" title={`Holding ${held} hidden card${held > 1 ? 's' : ''}`}>
            {/* a covered card is always a spell — show the real spellbook back */}
            <CardBack kind="spell" className="heldcard" />
            {held > 1 && <span className="heldcount">{held}</span>}
          </span>
        ) : null
      })()}
      {u.region === 'underground' && <span className="kw" title="Underground (burrowing)">⛏</span>}
      {u.region === 'underwater' && <span className="kw" title="Underwater (submerged)">🌊</span>}
      {u.region === 'void' && <span className="kw" title="Void (voidwalk)">🕳</span>}
    </div>
  )
}

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

// Sorcery elemental threshold glyphs as inline SVG (equilateral triangles; colour
// comes from the surrounding el-* class via currentColor). Fire △, Water ▽, Air △
// with a crossbar slightly over the base, Earth ▽ with a crossbar slightly under it.
function ThreshTri({ el }: { el: 'air' | 'earth' | 'fire' | 'water' }) {
  const down = el === 'water' || el === 'earth'
  const line = el === 'air' || el === 'earth'
  const tri = down ? '50,86 12,16 88,16' : '50,14 12,84 88,84'
  const barY = down ? 36 : 64 // parallel to and just inside the base (top for ▽, bottom for △)
  return (
    <svg viewBox="0 0 100 100" width="0.82em" height="0.82em" style={{ verticalAlign: '-0.11em', marginRight: 1 }} aria-hidden="true">
      <polygon points={tri} fill="none" stroke="currentColor" strokeWidth={10} strokeLinejoin="round" />
      {line && <line x1={22.9} y1={barY} x2={77.1} y2={barY} stroke="currentColor" strokeWidth={10} strokeLinecap="round" />}
    </svg>
  )
}

function PlayerBar({ view, pid, isMe, active, onZone, onInfo, clockMs, clockRunning, onAddTime, onHover, onCastTop }: {
  view: PlayerView; pid: PlayerId; isMe: boolean; active: boolean; onZone: (zone: 'cemetery' | 'banished' | 'collection') => void
  onInfo?: () => void
  clockMs?: number | null; clockRunning?: boolean; onAddTime?: () => void; onHover: (name: string) => void
  /** provided only when THIS player's revealed spellbook top is an Evil minion they can take up (Doomsday Cult) */
  onCastTop?: () => void
}) {
  const p = view.players[pid]
  const avatar = view.units[p.avatarUnitId]
  // elemental thresholds this player currently has (from their controlled sites);
  // public info, so it's shown for both players
  const aff = affinity(view as any, pid)
  const hasThresh = aff.air > 0 || aff.earth > 0 || aff.fire > 0 || aff.water > 0
  // opponent hand cards you've been shown (Lookout / Accusation / The Inquisition)
  const revealed: string[] = isMe ? [] : (p.hand ?? []).filter((id: string) => id !== 'hidden')
  return (
    <div className={`playerbar ${isMe ? 'me' : 'opp'} ${active ? 'active' : ''}`}
      onClick={() => onInfo?.()} style={onInfo ? { cursor: 'pointer' } : undefined}
      title="Click for thresholds, cemetery, banished & collection">
      {active && <span className="activedot" title="It's this player's turn">▶</span>}
      <b>{p.name}</b>
      {clockMs != null && (
        <span
          className={`clock ${clockRunning ? 'running' : ''} ${clockMs <= 10000 ? 'low' : ''} ${!isMe && onAddTime ? 'giftable' : ''}`}
          title={!isMe && onAddTime ? 'Click to give your opponent extra time' : 'Time remaining'}
          onClick={!isMe && onAddTime ? (e) => { e.stopPropagation(); onAddTime() } : undefined}
        >
          ⏱ {fmtClock(clockMs)}
        </span>
      )}
      <span title="Life">❤ {avatar?.life ?? '-'}</span>
      <span title="Mana">◆ {p.mana}</span>
      {hasThresh && (
        <span className="barthresh" title="Elemental thresholds (from controlled sites)">
          {aff.air > 0 && <span className="el-air" title="Air threshold"><ThreshTri el="air" />{aff.air}</span>}
          {aff.earth > 0 && <span className="el-earth" title="Earth threshold"><ThreshTri el="earth" />{aff.earth}</span>}
          {aff.fire > 0 && <span className="el-fire" title="Fire threshold"><ThreshTri el="fire" />{aff.fire}</span>}
          {aff.water > 0 && <span className="el-water" title="Water threshold"><ThreshTri el="water" />{aff.water}</span>}
        </span>
      )}
      {(p.handCounts as any).mixed ? (
        // Magician: sites share the spellbook/back — reveal only the total, not the site/spell split
        <span className="deckcount" title={`Hand: ${p.handCounts.spells} cards`}>
          hand: {p.handCounts.spells}<CardBack kind="spell" className="backicon" />
        </span>
      ) : (
        <span className="deckcount" title={`Hand: ${p.handCounts.spells} spells, ${p.handCounts.sites} sites`}>
          hand: {p.handCounts.spells}<CardBack kind="spell" className="backicon" /> {p.handCounts.sites}<CardBack kind="site" className="backicon" />
        </span>
      )}
      <span className="deckcount" title="Spellbook (spell deck)">spellbook: {p.spellbookCount}<CardBack kind="spell" className="backicon" /></span>
      {/* Doomsday Cult: the top of this player's spellbook is revealed to everyone. Clickable for YOU
          when it's an Evil minion you can take up to the Cult (fires the avatar's Cult ability). */}
      {(() => {
        const topId = (p as any).spellbookTop as string | undefined
        const card = topId ? view.cards[topId] : undefined
        if (!card) return null
        const castable = isMe && !!onCastTop
        return (
          <span className={`revealedtop${castable ? ' castable' : ''}`}
            title={`Top of ${isMe ? 'your' : 'their'} spellbook, revealed by the Doomsday Cult: ${card.name}${castable ? ' — click to take it up and cast at the Cult' : ''}`}
            onMouseEnter={() => onHover(card.name)}
            onClick={castable ? (e) => { e.stopPropagation(); onCastTop!() } : undefined}
            style={castable ? { cursor: 'pointer' } : undefined}>
            📖<CardImg name={card.name} art={card.art} className="revealimg" />
          </span>
        )
      })()}
      <span className="deckcount" title="Atlas (site deck)">atlas: {p.atlasCount}<CardBack kind="site" className="backicon" /></span>
      <button onClick={(e) => { e.stopPropagation(); onZone('cemetery') }}>⚰ {p.cemetery.length}</button>
      <button onClick={(e) => { e.stopPropagation(); onZone('banished') }}>🚫 {p.banished.length}</button>
      {isMe && <button onClick={(e) => { e.stopPropagation(); onZone('collection') }}>🎴 collection</button>}
      {revealed.length > 0 && (
        <span className="revealedhand" title="Their hand, revealed to you">
          👁
          {revealed.map((id, i) => (
            <span key={id + i} onMouseEnter={() => onHover(view.cards[id]?.name ?? '?')}>
              <CardImg name={view.cards[id]?.name ?? '?'} art={view.cards[id]?.art} className="revealimg" />
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

// Make a `.modal` draggable by its header, the same way the mulligan panel works:
// track an offset from the default centered position and apply it via inline
// transform, so an undragged modal keeps its current centering. `handleProps`
// goes on the drag handle (the title), `style` on the `.modal` root.
// The mobile game canvas is uniformly scaled by `uiScale` (see MOBILE_DESIGN); a drag
// offset is applied in the UNSCALED coordinate space, so to track the finger 1:1 on screen
// we divide the pointer delta by that scale. GameInner keeps this in sync (1 on desktop).
const dragScale = { current: 1 }

// Keep any draggable panel from being dragged up over the turn bar (`.topbar`). Every draggable
// panel lives inside the uniformly-scaled canvas, so a panel's on-screen rect and the topbar's
// rect share ONE scaled coordinate space; changing the (unscaled) drag offset by Δy moves the
// panel's screen top by Δy * scale. We sample the panel's top ONCE at drag start (it already
// reflects the base offset) and predict where a candidate offset would land, snapping it back to
// the bar's bottom edge if it would cross. Returns the clamped y offset (unscaled).
function clampDragTop(panel: HTMLElement | null | undefined, startTop: number, baseY: number, candY: number, s: number): number {
  if (!panel) return candY
  const bar = panel.ownerDocument.querySelector('.topbar') as HTMLElement | null
  if (!bar) return candY
  const barBottom = bar.getBoundingClientRect().bottom
  const predictedTop = startTop + (candY - baseY) * s
  return predictedTop < barBottom ? baseY + (barBottom - startTop) / s : candY
}

function useDraggable(centered = true) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  // Pointer events so the modal drags identically under mouse AND touch (mobile).
  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const base = pos ?? { x: 0, y: 0 }
    const panel = (e.currentTarget as HTMLElement).closest('.modal, .judgepanel') as HTMLElement | null
    const startTop = panel ? panel.getBoundingClientRect().top : 0
    const onMove = (ev: PointerEvent) => {
      const s = dragScale.current || 1
      const y = clampDragTop(panel, startTop, base.y, base.y + (ev.clientY - startY) / s, s)
      setPos({ x: base.x + (ev.clientX - startX) / s, y })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }
  return {
    handleProps: { className: 'draghandle', style: { cursor: 'move' as const, touchAction: 'none' as const }, onPointerDown: start },
    // centered modals translate from their -50%/-50% anchor; edge-anchored panels (the editor)
    // translate straight from their fixed corner.
    style: pos
      ? { transform: centered ? `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` : `translate(${pos.x}px, ${pos.y}px)` }
      : undefined,
  }
}

// Animist "cast as Magic / cast as Spirit" chooser — a small draggable modal shown
// when an Animist avatar clicks a magic in hand. Owns its own drag state.
function AnimistChoiceModal({ cardName, onMagic, onSpirit, onCancel }: {
  cardName: string; onMagic: () => void; onSpirit: () => void; onCancel: () => void
}) {
  const drag = useDraggable()
  return (
    <div className="modal" style={drag.style} data-modebanner="animistChoice">
      <h3 {...drag.handleProps}>Cast {cardName}…</h3>
      <button data-choice="magic" onClick={onMagic}>Cast as Magic</button>
      <button data-choice="spirit" onClick={onSpirit}>✨ Cast as Spirit (power = cost)</button>
      <button data-cancel="1" onClick={onCancel}>Cancel</button>
    </div>
  )
}

/** Text disambiguation for a set of unit choices (the defend prompt): tag each with the SMALLEST set of
 *  distinguishing attributes, tried in priority order — location → damage taken → carried artifacts →
 *  silenced — dropping any dimension that doesn't actually tell some pair apart. Units still identical
 *  after all of them are indifferent and share a label (e.g. two identical Foot Soldiers both at b1). */
function disambiguateUnits(view: any, ids: string[]): Map<string, string> {
  const units = ids.map((id) => view.units[id]).filter(Boolean)
  const dims: ((u: any) => string)[] = [
    (u) => squareLabel(u.x, u.y), // location
    (u) => (u.damage ? `${u.damage} dmg` : ''), // damage taken
    (u) => ((u.carrying ?? []) as string[]).map((aid) => view.artifacts?.[aid]?.name).filter(Boolean).join('+'), // carried artifacts
    (u) => (u.silenced ? 'silenced' : ''), // silenced
    (u) => (u.ward ? 'warded' : ''), // warded
  ]
  const parts = new Map<string, string[]>(ids.map((id) => [id, [] as string[]]))
  const labelKey = (u: any) => `${u.name} ${(parts.get(u.id) ?? []).join('')}`
  for (const dim of dims) {
    // group by the CURRENT label (name + tags so far); apply the dimension ONLY to an ambiguous group
    // it actually splits, and only to the units it splits — so e.g. coordinates appear only when they
    // tell same-name units apart, never on a minion its name already distinguishes.
    const groups = new Map<string, any[]>()
    for (const u of units) { const k = labelKey(u); const g = groups.get(k) ?? []; g.push(u); groups.set(k, g) }
    for (const [, group] of groups) {
      if (group.length < 2) continue
      if (new Set(group.map(dim)).size <= 1) continue // this dimension doesn't distinguish within the group
      for (const u of group) { const v = dim(u); if (v) parts.get(u.id)!.push(v) } // drop empty (useless) values
    }
  }
  const out = new Map<string, string>()
  for (const id of ids) { const p = parts.get(id) ?? []; out.set(id, p.length ? ` (${p.join(', ')})` : '') }
  return out
}

function PromptBox({ view, prompt, send, me, flip, onHover, onGoBack, interceptAnswer, onDirHover, dirPos, onDefenderHover }: { view: PlayerView; prompt: any; send: (a: Action) => void; me: PlayerId; flip: boolean; onHover?: (name: string) => void; onGoBack?: () => void; interceptAnswer?: (prompt: any, choice: any) => boolean; onDirHover?: (d: string | null) => void; dirPos?: { left: number; top: number } | null; onDefenderHover?: (id: string | null) => void }) {
  const drag = useDraggable()
  const [sel, setSel] = useState<string[]>([])
  const [selErr, setSelErr] = useState<string | null>(null) // inline validation (e.g. defend selection)
  const [alloc, setAlloc] = useState<Record<string, number>>({})
  // an area-damage direction pick is diverted to a board confirm panel first (the
  // caller sends the held answer on confirm); everything else answers immediately.
  const answer = (choice: any) => {
    if (interceptAnswer?.(prompt, choice)) return
    send({ t: 'prompt', promptId: prompt.id, choice })
  }

  // a "peeked" card (Seer, the Rivers, Riddle Sphinx…): show its full art + text right
  // in the prompt (and mirror it to the lateral detail panel on hover) so keep/bottom
  // decisions aren't made blind.
  const reveal: string | undefined = prompt.data?.reveal
  const revealCard = reveal ? (
    <div className="promptcard" onMouseEnter={() => onHover?.(reveal)}>
      <CardHover name={reveal} />
    </div>
  ) : null

  const content = ((): JSX.Element => {
    switch (prompt.kind) {
    case 'drawDeck':
      return (
        <div className="modal" style={drag.style} data-promptbox="drawDeck">
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          <button data-choice="spellbook" onClick={() => answer('spellbook')}>Spellbook (spells)</button>
          <button data-choice="atlas" onClick={() => answer('atlas')}>Atlas (sites)</button>
        </div>
      )
    case 'defend': {
      const ids = (prompt.data.candidates ?? []) as string[]
      const tags = disambiguateUnits(view, ids) // text disambiguation: location → damage → artifacts → silenced
      return (
        <div className="modal" style={drag.style} data-promptbox="defend">
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          <div className="choices">
            {ids.map((id: string) => {
              const u = view.units[id]
              if (!u) return null
              return (
                <button key={id} data-choice={id} className={sel.includes(id) ? 'selected' : ''}
                  onMouseEnter={() => { onDefenderHover?.(id); onHover?.(u.name) }}
                  onMouseLeave={() => onDefenderHover?.(null)}
                  onClick={() => { setSelErr(null); setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]) }}>
                  {u.name}{u.carriedBy ? ` (carried by ${view.units[u.carriedBy]?.name ?? 'ally'})` : ''}{tags.get(id) ?? ''}
                </button>
              )
            })}
          </div>
          {selErr && <p className="prompterr">{selErr}</p>}
          <button data-confirm="1" disabled={sel.length === 0} onClick={() => {
            if (sel.length === 0) return // "defend with 0 units" isn't an option — use Don't defend
            // a carried minion can only defend if its carrier defends too
            const badRider = sel.map((id) => view.units[id]).find((u) => u?.carriedBy && !sel.includes(u.carriedBy))
            if (badRider) {
              const carrier = view.units[badRider.carriedBy!]
              setSelErr(`${badRider.name} can only defend if its carrier${carrier ? ` (${carrier.name})` : ''} defends too — select the carrier as well.`)
              return
            }
            answer(sel)
          }}>Defend with {sel.length} unit{sel.length === 1 ? '' : 's'}</button>
          <button data-skip="1" onClick={() => answer([])}>Don't defend</button>
        </div>
      )
    }
    case 'intercept':
      return (
        <div className="modal" style={drag.style} data-promptbox="intercept">
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          {(prompt.data.candidates ?? []).map((id: string) => {
            const u = view.units[id]
            return u ? <button key={id} data-choice={id} onClick={() => answer(id)}>Intercept with {u.name}</button> : null
          })}
          <button data-skip="1" onClick={() => answer(null)}>Don't intercept</button>
        </div>
      )
    case 'stayInFight':
      return (
        <div className="modal" style={drag.style} data-promptbox="stayInFight">
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          <button data-choice="true" onClick={() => answer(true)}>Stay in the fight</button>
          <button data-choice="false" onClick={() => answer(false)}>Withdraw</button>
        </div>
      )
    case 'allocateDamage': {
      const power: number = prompt.data.power ?? 0
      const spent = Object.values(alloc).reduce((a: number, b) => a + (b as number), 0)
      const left = power - spent
      return (
        <div className="modal" style={drag.style} data-promptbox="allocateDamage">
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          <p>
            Damage left to assign: <b>{left}</b> / {power}
          </p>
          {(prompt.data.candidates ?? []).map((id: string) => {
            const u = view.units[id]
            if (!u) return null
            const n = alloc[id] ?? 0
            // current (remaining) life: avatars carry it directly; a minion's life is its
            // effective defence minus the damage already on it.
            const life = u.isAvatar ? u.life : (() => { try { return Math.max(0, effDefence(view as any, u) - (u.damage ?? 0)) } catch { return undefined } })()
            return (
              <div key={id} className="allocrow">
                <span>
                  {u.name} {life !== undefined ? `(❤${life})` : ''}
                </span>
                <button data-alloc-minus={id} onClick={() => setAlloc({ ...alloc, [id]: Math.max(0, n - 1) })}>−</button>
                <b className="allocnum">{n}</b>
                <button data-alloc-plus={id} disabled={left <= 0} onClick={() => setAlloc({ ...alloc, [id]: n + 1 })}>+</button>
                <button data-alloc-all={id} disabled={left <= 0} onClick={() => setAlloc({ ...alloc, [id]: n + left })}>all</button>
              </div>
            )
          })}
          <button
            data-confirm="1"
            disabled={left !== 0}
            onClick={() => {
              answer({ strikerId: prompt.data.strikerId, allocation: alloc })
              setAlloc({})
            }}
          >
            Strike!
          </button>
        </div>
      )
    }
    case 'yesNo':
      return (
        <div className="modal" style={drag.style} data-promptbox="yesNo">
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          {revealCard}
          <button data-choice="true" onClick={() => answer(true)}>Yes</button>
          <button data-choice="false" onClick={() => answer(false)}>No</button>
        </div>
      )
    case 'chooseOption': {
      const options: string[] = prompt.data.options ?? []
      // when a prompt asks for a cardinal direction, show the oriented compass
      // (same picker as projectiles) instead of raw n/s/e/w letters
      const opts = isCardinalOptions(options) ? cardinalOrder(options) : options
      // any option that names a real card (Archimago's dead magics, Monstermorphosis'
      // hand Monsters, …) is SHOWN as its card image; a trailing "(collection)" tag is
      // stripped to resolve the art. Non-card options stay as plain buttons.
      const cardOf = (o: string): string | null => {
        if (isCardinalOptions(options)) return null
        if (findCard(o)) return o
        const base = o.replace(/\s*\(collection\)$/i, '')
        return base !== o && findCard(base) ? base : null
      }
      const cardOpts = opts.filter((o) => cardOf(o))
      const plainOpts = opts.filter((o) => !cardOf(o))
      return (
        <div className="modal" style={{ ...drag.style, ...(dirPos ? { left: dirPos.left, top: dirPos.top } : {}) }} data-promptbox="chooseOption">
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          {revealCard}
          {cardOpts.length > 0 && (
            <div className="mullhand">
              {cardOpts.map((o) => (
                <div key={o} data-choice={o} className="handcard" title={o} onMouseEnter={() => onHover?.(cardOf(o)!)} onClick={() => answer(o)}>
                  <CardImg name={cardOf(o)!} className="handimg" />
                </div>
              ))}
            </div>
          )}
          {plainOpts.map((o: string) => (
            <button key={o} data-choice={o} onClick={() => answer(o)}
              onMouseEnter={isCardinalOptions(options) ? () => onDirHover?.(o) : undefined}
              onMouseLeave={isCardinalOptions(options) ? () => onDirHover?.(null) : undefined}>
              {isCardinalOptions(options) ? dirLabel(o, flip) : o}
            </button>
          ))}
        </div>
      )
    }
    case 'nameCard': {
      const fromCollection = !!prompt.data?.fromCollection
      // the engine already narrowed `names` to the acting player's collection; use
      // its counts for the ×N labels
      const col: Record<string, number> = fromCollection ? ((view.players[me] as any).collection ?? {}) : {}
      const pool: string[] = prompt.data?.names ?? allCards.map((c) => c.name)
      // a restricted list (or a collection fetch) is shown as a clickable CHOICE,
      // not a free-text search
      const asChoice = fromCollection || (!!prompt.data?.names && pool.length <= 40)
      if (asChoice) {
        return (
          <div className="modal" style={drag.style} data-promptbox="nameCard">
            <h3 {...drag.handleProps}>{prompt.title}</h3>
            <div className="mullhand">
              {[...pool].sort().map((n) => (
                <div key={n} data-choice={n} className="handcard" onMouseEnter={() => onHover?.(n)} onClick={() => answer(n)}>
                  <CardImg name={n} className="handimg" />
                  {fromCollection && col[n] > 1 && <span className="artbadge">×{col[n]}</span>}
                </div>
              ))}
              {pool.length === 0 && <i>{fromCollection ? 'Nothing eligible in this deck’s collection.' : 'No options.'}</i>}
            </div>
            <button data-skip="1" onClick={() => answer('')}>Cancel</button>
          </div>
        )
      }
      // open name-a-card (Feast for Crows, Hyter Sprites): free-text with datalist
      const typed = sel[0] ?? ''
      const valid = pool.some((n) => n.toLowerCase() === typed.toLowerCase())
      return (
        <div className="modal" style={drag.style} data-promptbox="nameCard" data-namecard-free={pool.length}>
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          <input
            list="cardnames"
            data-namecard-input="1"
            value={typed}
            placeholder="type a card name…"
            onChange={(e) => setSel([e.target.value])}
            style={{ width: '100%', padding: 8, fontSize: 16 }}
            autoFocus
          />
          <datalist id="cardnames">
            {pool.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <button
            data-confirm="1"
            disabled={!valid}
            onClick={() => {
              const exact = pool.find((n) => n.toLowerCase() === typed.toLowerCase())!
              answer(exact)
              setSel([])
            }}
          >
            Name it
          </button>
        </div>
      )
    }
    case 'sitePermutation':
      // Earthquake: author the 2x2 rearrangement in a self-contained panel, then send the permutation.
      // view/me/flip let the panel show each site's occupants and lay the grid out in board orientation.
      return <QuakeArrange data={prompt.data} view={view} me={me} flip={flip} onAnswer={(c) => answer(c)} onHover={onHover} style={drag.style} handleProps={drag.handleProps} />
    case 'firstSite': {
      // forced first-turn site: click one of your hand's sites; it's placed under
      // your avatar (mandatory — no skip). data carries parallel ids + names.
      const ids: string[] = prompt.data?.ids ?? []
      const names: string[] = prompt.data?.names ?? []
      return (
        <div className="modal" style={drag.style} data-promptbox="firstSite">
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          <div className="mullhand">
            {ids.map((id, i) => (
              <div key={id} data-choice={id} className="handcard" onMouseEnter={() => onHover?.(names[i] ?? '')} onClick={() => answer(id)}>
                <CardImg name={names[i] ?? '?'} className="handimg" />
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'chooseCards': {
      // pick up to N cards from a revealed list (shown with art)
      const max: number = prompt.data.pick ?? 1
      const cards: string[] = prompt.data.cards ?? []
      return (
        <div className="modal" style={drag.style} data-promptbox="chooseCards">
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          <div className="mullhand">
            {cards.map((name, i) => (
              <div
                key={name + i}
                data-choice={i}
                className={`handcard ${sel.includes(`${i}`) ? 'selected' : ''}`}
                onMouseEnter={() => onHover?.(name)}
                onClick={() =>
                  setSel(sel.includes(`${i}`) ? sel.filter((x) => x !== `${i}`) : sel.length < max ? [...sel, `${i}`] : sel)
                }
              >
                <CardImg name={name} className="handimg" />
              </div>
            ))}
          </div>
          <button
            data-confirm="1"
            onClick={() => {
              answer(sel.map((s) => Number(s)))
              setSel([])
            }}
          >
            Confirm ({sel.length}/{max})
          </button>
          {prompt.data.upTo !== false && (
            <button data-skip="1" onClick={() => { answer([]); setSel([]) }}>{prompt.data.skipLabel ?? 'Take none'}</button>
          )}
        </div>
      )
    }
    case 'orderCards': {
      // click the revealed cards in the order you want them; `sel` holds index-strings
      const cards: string[] = prompt.data.cards ?? []
      const place: string = prompt.data.place
      // optional per-card captions (e.g. board coords disambiguating same-named effects)
      const labels: string[] = prompt.data.labels ?? []
      const allPlaced = sel.length === cards.length
      return (
        <div className="modal" style={drag.style} data-promptbox="orderCards">
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          <p>{place === 'resolve'
            ? 'Click them in the order they should resolve — the first you pick resolves first.'
            : place === 'top'
            ? 'Click them in order — the first you pick is the top of your deck (drawn next).'
            : 'Click them in order — the last you pick sits at the very bottom of your deck.'}</p>
          <div className="mullhand">
            {cards.map((name, i) => {
              const pos = sel.indexOf(String(i))
              return (
                <div key={name + i} data-choice={i} className={`handcard ${pos >= 0 ? 'selected' : ''}`}
                  onMouseEnter={() => onHover?.(name)}
                  onClick={() => setSel(pos >= 0 ? sel.filter((x) => x !== String(i)) : [...sel, String(i)])}>
                  <CardImg name={name} className="handimg" />
                  {labels[i] && <span className="ordercoord">{labels[i]}</span>}
                  {pos >= 0 && <span className="artbadge">{pos + 1}</span>}
                </div>
              )
            })}
          </div>
          <button data-confirm="1" disabled={!allPlaced} onClick={() => { answer(sel.map(Number)); setSel([]) }}>
            Confirm order ({sel.length}/{cards.length})
          </button>
          <button data-reset="1" onClick={() => setSel([])}>Reset</button>
        </div>
      )
    }
    case 'chooseTargets': {
      const kind = prompt.data?.kind
      const label = kind === 'site' ? 'site' : kind === 'unitOrSite' ? 'unit or site' : kind === 'unitOrAura' ? 'unit or aura' : kind === 'aura' ? 'aura' : 'unit'
      return (
        <div className="promptbanner" data-promptbox="chooseTargets" data-target-kind={kind === 'site' ? 'site' : kind === 'aura' ? 'aura' : 'unit'}>
          {prompt.title} (click {kind === 'aura' ? 'an' : 'a'} {label} on the board)
          {prompt.data?.upTo && <button data-skip="1" onClick={() => answer([])}>skip</button>}
        </div>
      )
    }
    case 'chooseSquare':
      // handled by clicking a highlighted square on the board (see clickSquare);
      // a non-blocking banner, NOT the default modal (whose OK→null would send an
      // invalid choice — chooseSquare is always a mandatory pick from data.squares).
      return (
        <div className="promptbanner" data-promptbox="chooseSquare">
          {prompt.title} (click a highlighted square on the board)
        </div>
      )
    default:
      return (
        <div className="modal" style={drag.style} data-promptbox={prompt.kind}>
          <h3 {...drag.handleProps}>{prompt.title}</h3>
          <button data-choice="null" onClick={() => answer(null)}>OK</button>
        </div>
      )
    }
  })()
  // A card's FIRST prompt gets a free "↩ Go back": nothing has been committed yet
  // (locally the pre-cast snapshot is restored; online the tentative cast is rolled
  // back, so the opponent + shared log never saw it). Injected as the box's last child.
  if (onGoBack && isValidElement(content)) {
    return cloneElement(
      content,
      {},
      ...Children.toArray((content.props as any).children),
      <button key="__goback" className="promptback" data-goback onClick={onGoBack} title="Undo — nothing has happened yet">↩ Go back</button>,
    )
  }
  return content
}

/** manual "tabletop" adjustments for card text the engine doesn't automate */
// keyword grants the judge can hand out (mapped to the engine's keyword modifier strings)
const JUDGE_KEYWORDS: { label: string; kw: string }[] = [
  { label: 'airborne', kw: 'airborne' },
  { label: 'burrowing', kw: 'burrowing' },
  { label: 'submerge', kw: 'submerge' },
  { label: 'voidwalk', kw: 'voidwalk' },
  { label: 'stealth', kw: 'stealth' },
  { label: 'ward', kw: 'ward' },
  { label: 'lethal', kw: 'lethal' },
  { label: 'charge', kw: 'charge' },
  { label: 'ranged 1', kw: 'ranged 1' },
  { label: 'spellcaster', kw: 'spellcaster' },
  { label: 'movement +1', kw: 'movement +1' },
]

type JudgeTab = 'table' | 'create' | 'modify' | 'avatars'
type ModType = 'unit' | 'site' | 'artifact' | 'aura'
function JudgePanel({ view, me, send, selectedUnitId, selectedSiteId, selectedArtifactId, selectedAuraId, setMode, onClose, onSaveScenario }: {
  view: PlayerView; me: PlayerId; send: (a: Action) => void
  selectedUnitId: string | null; selectedSiteId: string | null; selectedArtifactId: string | null; selectedAuraId: string | null
  setMode: (m: Mode) => void; onClose: () => void
  onSaveScenario?: (name: string, isPublic: boolean) => Promise<void>
}) {
  const drag = useDraggable(false) // draggable by its header; edge-anchored (not centered)
  const [saveOpen, setSaveOpen] = useState(false)
  const [scenName, setScenName] = useState('')
  const [scenPublic, setScenPublic] = useState(true)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function doSaveScenario() {
    if (!onSaveScenario || !scenName.trim() || saving) return
    setSaving(true); setSaveMsg(null)
    try {
      await onSaveScenario(scenName.trim(), scenPublic)
      setSaveMsg('Saved ✓'); setSaveOpen(false); setScenName('')
    } catch (e: any) {
      setSaveMsg(e?.message ?? 'Save failed.')
    } finally {
      setSaving(false)
    }
  }
  const [tokenName, setTokenName] = useState('Foot Soldier')
  const [siteId, setSiteId] = useState('')
  // "replace this site with another site" modal (an atomic destroy-and-place in the same spot)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [replaceQuery, setReplaceQuery] = useState('')
  const [artSel, setArtSel] = useState('')
  const [avatarPick, setAvatarPick] = useState<Record<number, string>>({})
  const [createName, setCreateName] = useState('Foot Soldier')
  // remembers the last non-empty create name so blurring an emptied field restores it
  const lastCreateName = useRef(createName)
  useEffect(() => { if (createName) lastCreateName.current = createName }, [createName])
  const [createType, setCreateType] = useState<'any' | 'Minion' | 'Site' | 'Artifact' | 'Magic' | 'Aura'>('any')
  const [createOwner, setCreateOwner] = useState<PlayerId>(me)
  const [artName, setArtName] = useState('')
  const [kwSel, setKwSel] = useState('airborne')
  const [kwDur, setKwDur] = useState<'endOfTurn' | 'permanent'>('permanent')
  const [powDur, setPowDur] = useState<'endOfTurn' | 'permanent'>('permanent')
  // multi-page layout: which tab is open, and (on the Modify tab) which object type + which unit.
  const [tab, setTab] = useState<JudgeTab>(selectedUnitId || selectedSiteId || selectedArtifactId ? 'modify' : 'create')
  const [modType, setModType] = useState<ModType>(selectedSiteId ? 'site' : selectedArtifactId ? 'artifact' : 'unit')
  const [unitSel, setUnitSel] = useState<string>(selectedUnitId ?? '')
  const [auraSel, setAuraSel] = useState<string>('')
  const [discardSel, setDiscardSel] = useState<Record<number, string>>({}) // per-player: which visible hand card to discard
  // clicking an object on the board (with the Editor open) focuses the Modify tab on it.
  useEffect(() => { if (selectedUnitId) { setUnitSel(selectedUnitId); setModType('unit'); setTab('modify') } }, [selectedUnitId])
  useEffect(() => { if (selectedSiteId) { setSiteId(selectedSiteId); setModType('site'); setTab('modify') } }, [selectedSiteId])
  useEffect(() => { if (selectedArtifactId) { setArtSel(selectedArtifactId); setModType('artifact'); setTab('modify') } }, [selectedArtifactId])
  useEffect(() => { if (selectedAuraId) { setAuraSel(selectedAuraId); setModType('aura'); setTab('modify') } }, [selectedAuraId])
  const judge = (op: any) => send({ t: 'judge', op })
  // an inline alternative-art picker row — shown only when the selected card actually HAS other printings.
  // Changing art here goes through a judge op so it syncs (revealed-only) to the opponent.
  const artPickerRow = (name: string, cardId?: string) => {
    const arts = cardId ? printingsFor(name) : []
    if (!cardId || arts.length < 2) return null
    const cur = view.cards[cardId]?.art
    return (
      <div className="jp-row">
        <span className="jp-group jp-art">
          🎨 art:
          {arts.map((p) => {
            const sel = cur ? cur === p.slug : !!p.default
            return (
              <button key={p.slug} className={`jp-art-opt ${sel ? 'sel' : ''}`} title={p.artist ? `${p.set} — art by ${p.artist}` : p.set}
                onClick={() => judge({ k: 'setArt', cardId, slug: p.default ? null : p.slug })}>
                <CardImg name={name} art={p.slug} className="jp-art-thumb" />
              </button>
            )
          })}
        </span>
      </div>
    )
  }
  // bury / submerge / surface a minion or artifact IN PLACE (setRegion grants Burrowing/Submerge so a plain
  // minion survives below). Only the terrain-appropriate below option is offered — underground under a land
  // site, underwater under a water one — and only when the square has a site to go beneath.
  const regionButtons = (obj: { x: number; y: number; region?: Region }, id: string) => {
    const site = (Object.values(view.sites) as any[]).find((s) => s.x === obj.x && s.y === obj.y && !s.isRubble)
    if (!site) return null
    const water = isWaterSite(view as any, site, getCard)
    const cur = (obj.region ?? 'surface') as Region
    const set = (r: Region) => judge({ k: 'setRegion', id, region: r })
    return (
      <label title="Surface, or send it below (underground on land, underwater in water)">
        region
        <button disabled={cur === 'surface'} title="Bring to the surface" onClick={() => set('surface')}>🏔 surface</button>
        {water
          ? <button disabled={cur === 'underwater'} title="Submerge underwater" onClick={() => set('underwater')}>🌊 submerge</button>
          : <button disabled={cur === 'underground'} title="Bury underground" onClick={() => set('underground')}>⛏ bury</button>}
      </label>
    )
  }
  // the unit under edit: the dropdown pick, or (until the sync effect runs) the board selection.
  const u = ((unitSel && view.units[unitSel]) || (selectedUnitId ? view.units[selectedUnitId] : undefined)) as UnitState | undefined
  const units = Object.values(view.units) as UnitState[]
  const sites = Object.values(view.sites) as any[]
  const site = view.sites[siteId] as any
  const artifacts = Object.values((view as any).artifacts ?? {}) as any[]
  const art = (view as any).artifacts?.[artSel]
  const auras = Object.values((view as any).auras ?? {}) as any[]
  const aura = (view as any).auras?.[auraSel] ?? (selectedAuraId ? (view as any).auras?.[selectedAuraId] : undefined)
  const avatarNames = useMemo(() => allCards.filter((c) => c.type === 'Avatar').map((c) => c.name), [])

  // card names for the datalist, filtered by the type select
  const nameOptions = useMemo(
    () => allCards.filter((c) => createType === 'any' || c.type === createType).map((c) => c.name),
    [createType],
  )
  // route the "→ board" destination by the created card's type
  const createDef = findCard(createName)
  const boardOp: 'summonUnit' | 'placeSite' | 'spawnArtifact' | null =
    createDef?.type === 'Minion' || createDef?.type === 'Avatar'
      ? 'summonUnit'
      : createDef?.type === 'Site'
        ? 'placeSite'
        : createDef?.type === 'Artifact'
          ? 'spawnArtifact'
          : null

  const TABS: { id: JudgeTab; label: string }[] = [
    { id: 'table', label: '🎲 Table' },
    { id: 'create', label: '✚ Create' },
    { id: 'modify', label: '✎ Modify' },
    { id: 'avatars', label: '👑 Avatars' },
  ]
  const MOD_TYPES: { id: ModType; label: string }[] = [
    { id: 'unit', label: 'Unit' },
    { id: 'site', label: 'Site' },
    { id: 'artifact', label: 'Artifact' },
    { id: 'aura', label: 'Aura' },
  ]
  return (
    <div className="judgepanel" style={drag.style}>
      <div className="jp-head">
        <span {...drag.handleProps} title="Drag to move the panel">
          <b>✎ Editor tools</b> <span className="jp-hint">for resolving card text manually — everything is logged</span>
        </span>
        {onSaveScenario && (
          <button data-judge-savescenario onClick={() => { setSaveOpen((v) => !v); setSaveMsg(null) }} title="Save this board as a reusable scenario">💾 Save as scenario…</button>
        )}
        <button onClick={onClose}>×</button>
      </div>
      {/* page tabs */}
      <div className="jp-tabs">
        {TABS.map((t) => (
          <button key={t.id} data-judge-tab={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {saveOpen && onSaveScenario && (
        <div className="jp-row" data-judge-savebox>
          <span className="jp-group">
            name
            <input data-judge-scenname value={scenName} onChange={(e) => setScenName(e.target.value)} placeholder="My scenario" style={{ width: '12em' }} autoFocus />
            <label title="Public scenarios are loadable by everyone; private ones only by you.">
              <input type="checkbox" data-judge-scenpublic checked={scenPublic} onChange={(e) => setScenPublic(e.target.checked)} /> public
            </label>
            <button data-judge-scensave disabled={!scenName.trim() || saving} onClick={doSaveScenario}>{saving ? 'saving…' : 'save'}</button>
            <button onClick={() => setSaveOpen(false)}>cancel</button>
            {saveMsg && <span className="jp-hint">{saveMsg}</span>}
          </span>
        </div>
      )}
      {tab === 'table' && (<>
      <div className="jp-row">
        {[0, 1].map((p) => (
          <span key={p} className="jp-group">
            {view.players[p].name}:
            <button onClick={() => judge({ k: 'life', player: p, delta: 1 })}>❤+1</button>
            <button onClick={() => judge({ k: 'life', player: p, delta: -1 })}>❤−1</button>
            <button onClick={() => judge({ k: 'mana', player: p, delta: 1 })}>◆+1</button>
            <button onClick={() => judge({ k: 'mana', player: p, delta: -1 })}>◆−1</button>
            <button onClick={() => judge({ k: 'draw', player: p, deck: 'spellbook' })}>draw 📜</button>
            <button onClick={() => judge({ k: 'draw', player: p, deck: 'atlas' })}>draw 🗺</button>
          </span>
        ))}
      </div>
      {/* discard a card from hand — only offered for hands this client can SEE (your own; the
          opponent's hidden hand isn't shown, so you can't discard from it) */}
      <div className="jp-row">
        {[0, 1].map((p) => {
          const seen = view.players[p].hand.filter((id: string) => id !== 'hidden')
          if (!seen.length) return null
          const sel = discardSel[p] && seen.includes(discardSel[p]) ? discardSel[p] : seen[0]
          return (
            <span key={p} className="jp-group">
              {view.players[p].name} hand:
              <select data-judge-discardsel={p} value={sel} onChange={(e) => setDiscardSel({ ...discardSel, [p]: e.target.value })}>
                {seen.map((id: string) => <option key={id} value={id}>{view.cards[id]?.name ?? '?'}</option>)}
              </select>
              <button data-judge-discard={p} title="Send this card to the cemetery" onClick={() => { judge({ k: 'discard', cardId: sel }); setDiscardSel({ ...discardSel, [p]: '' }) }}>discard →⚰</button>
            </span>
          )
        })}
      </div>
      {/* player extras: absolute setters + untap-all */}
      <div className="jp-row">
        {[0, 1].map((p) => (
          <span key={p} className="jp-group">
            {view.players[p].name}:
            <label>life=<input data-judge-life-input={p} defaultValue="20" style={{ width: '3.5em' }} id={`jp-life-${p}`} /></label>
            <button
              data-judge-setlife-go={p}
              onClick={() => {
                const el = document.getElementById(`jp-life-${p}`) as HTMLInputElement | null
                const v = Number(el?.value ?? '0')
                if (Number.isFinite(v)) judge({ k: 'setLife', player: p, value: v })
              }}
            >
              set ❤
            </button>
            <label>mana=<input data-judge-mana-input={p} defaultValue="0" style={{ width: '3.5em' }} id={`jp-mana-${p}`} /></label>
            <button
              data-judge-setmana-go={p}
              onClick={() => {
                const el = document.getElementById(`jp-mana-${p}`) as HTMLInputElement | null
                const v = Number(el?.value ?? '0')
                if (Number.isFinite(v)) judge({ k: 'setMana', player: p, value: v })
              }}
            >
              set ◆
            </button>
            <button data-judge-untap={p} onClick={() => judge({ k: 'untap', player: p })}>untap all</button>
          </span>
        ))}
      </div>
      {/* threshold override: nudge each element's affinity per player (persistent) */}
      <div className="jp-row">
        {([0, 1] as PlayerId[]).map((p) => {
          const aff = affinity(view as any, p)
          return (
            <span key={p} className="jp-group" data-judge-thresh-group={p}>
              {view.players[p].name}:
              {(['air', 'earth', 'fire', 'water'] as const).map((el) => (
                <label key={el} className={`el-${el}`}>
                  {el[0].toUpperCase()}
                  {aff[el]}
                  <button data-judge-thresh={`${p},${el},1`} onClick={() => judge({ k: 'threshold', player: p, element: el, delta: 1 })}>+</button>
                  <button data-judge-thresh={`${p},${el},-1`} onClick={() => judge({ k: 'threshold', player: p, element: el, delta: -1 })}>−</button>
                </label>
              ))}
            </span>
          )
        })}
      </div>
      <div className="jp-row">
        <span className="jp-group">
          Token:
          <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} style={{ width: '9em' }} />
          <button
            onClick={() => {
              const avatar = view.units[view.players[me].avatarUnitId]
              judge({ k: 'token', name: tokenName, player: me, x: avatar.x, y: avatar.y, region: 'surface' })
            }}
          >
            summon at my avatar
          </button>
        </span>
      </div>
      </>)}
      {/* CREATE: materialize any real card into hand / cemetery / board */}
      {tab === 'create' && (
      <div className="jp-row">
        <span className="jp-group">
          Create:
          <select data-judge-type value={createType} onChange={(e) => {
            const t = e.target.value as typeof createType
            setCreateType(t)
            // pick an appropriate default card of the new type (was always "Foot Soldier")
            if (t !== 'any') {
              const cur = findCard(createName)
              if (!cur || cur.type !== t) { const first = allCards.find((c) => c.type === t); if (first) setCreateName(first.name) }
            }
          }}>
            <option value="any">any</option>
            <option value="Minion">Minion</option>
            <option value="Site">Site</option>
            <option value="Artifact">Artifact</option>
            <option value="Magic">Magic</option>
            <option value="Aura">Aura</option>
          </select>
          <input
            data-judge-name
            list="jp-card-names"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            // click/focus empties the field so you can type a new name right away (and the
            // datalist shows the full card list); if you leave it blank, the last name is restored.
            onFocus={() => setCreateName('')}
            onBlur={() => { if (!createName) setCreateName(lastCreateName.current) }}
            style={{ width: '11em' }}
          />
          <datalist id="jp-card-names">
            {nameOptions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <select data-judge-owner value={createOwner} onChange={(e) => setCreateOwner(Number(e.target.value) as PlayerId)}>
            <option value={0}>{view.players[0].name}</option>
            <option value={1}>{view.players[1].name}</option>
          </select>
          <button
            data-judge-dest="hand"
            disabled={!createDef}
            onClick={() => judge({ k: 'addToHand', name: createName, player: createOwner })}
          >
            → hand
          </button>
          <button
            data-judge-dest="cemetery"
            disabled={!createDef}
            onClick={() => judge({ k: 'addToCemetery', name: createName, player: createOwner })}
          >
            → cemetery
          </button>
          <button
            data-judge-dest="collection"
            disabled={!createDef}
            title="Add a copy to the owner's collection pool (what 'from your collection' effects draw from)"
            onClick={() => judge({ k: 'addToCollection', name: createName, player: createOwner })}
          >
            → collection
          </button>
          <button
            data-judge-dest="board"
            disabled={!boardOp && !(createDef?.type === 'Magic' || createDef?.type === 'Aura')}
            title={boardOp ? 'Materialize directly on a board square' : (createDef?.type === 'Magic' || createDef?.type === 'Aura') ? "Put it in this player's hand with free mana + thresholds, then click it in hand to CAST it with the normal interface (auras: 2×2 / border / 1×1; magics: targeting)" : undefined}
            onClick={() => {
              if (boardOp) { setMode({ m: 'judgePlace', op: boardOp, name: createName, player: createOwner, region: 'surface' }); return }
              // Magic / Aura: no direct board materialize — set up a FREE cast. Give the owner the
              // card + plenty of mana + all thresholds, then close the editor so they cast it from
              // hand using the real cast UI (aura placement markers / magic target picker).
              if (createDef?.type === 'Magic' || createDef?.type === 'Aura') {
                judge({ k: 'addToHand', name: createName, player: createOwner })
                judge({ k: 'mana', player: createOwner, delta: 20 })
                for (const el of ['air', 'earth', 'fire', 'water'] as const) judge({ k: 'threshold', player: createOwner, element: el, delta: 5 })
                onClose()
              }
            }}
          >
            {boardOp ? '→ board (click a square)' : (createDef?.type === 'Magic' || createDef?.type === 'Aura') ? '→ cast (free, from hand)' : '→ board'}
          </button>
          {boardOp === 'summonUnit' && (
            <button
              data-judge-dest="board-nogenesis"
              title="Old behaviour: materialize a bare unit WITHOUT firing its Genesis (no self-setup — e.g. Yog-Sothoth lands as a plain head, oversized/aura footprints aren't laid out)"
              onClick={() => setMode({ m: 'judgePlace', op: 'summonUnit', name: createName, player: createOwner, region: 'surface', noGenesis: true })}
            >
              → board (no genesis)
            </button>
          )}
        </span>
      </div>
      )}
      {tab === 'modify' && (<>
      <div className="jp-modtabs">
        {MOD_TYPES.map((mt) => (
          <button key={mt.id} data-judge-modtype={mt.id} className={modType === mt.id ? 'active' : ''} onClick={() => setModType(mt.id)}>{mt.label}</button>
        ))}
      </div>
      {modType === 'unit' && (<>
      <div className="jp-row">
        <span className="jp-group">
          Unit
          <select data-judge-unitsel value={unitSel || selectedUnitId || ''} onChange={(e) => setUnitSel(e.target.value)}>
            <option value="">—</option>
            {units.map((un) => (
              <option key={un.id} value={un.id}>
                {un.name} {squareLabel(un.x, un.y)} · {view.players[un.controller]?.name}
              </option>
            ))}
          </select>
          {u ? <b>{u.name}</b> : <i>(pick one, or click it on the board)</i>}:
          {u && (
            <>
              <button onClick={() => judge({ k: 'damage', unitId: u.id, amount: 1 })}>dmg 1</button>
              <button onClick={() => judge({ k: 'heal', unitId: u.id, amount: 1 })}>heal 1</button>
              <label>
                pow
                <button data-judge-pow="up" onClick={() => judge({ k: 'power', unitId: u.id, amount: 1, duration: powDur })}>+1</button>
                <button data-judge-pow="down" onClick={() => judge({ k: 'power', unitId: u.id, amount: -1, duration: powDur })}>−1</button>
                <select data-judge-pow-dur value={powDur} onChange={(e) => setPowDur(e.target.value as any)}>
                  <option value="permanent">permanent</option>
                  <option value="endOfTurn">turn</option>
                </select>
              </label>
              <label title="Grant or reduce movement (extra steps this turn). Uses the duration above.">
                move
                <button data-judge-mv="up" onClick={() => judge({ k: 'keyword', unitId: u.id, keyword: 'movement +1', duration: powDur })}>+1</button>
                <button data-judge-mv="down" onClick={() => judge({ k: 'keyword', unitId: u.id, keyword: 'movement -1', duration: powDur })}>−1</button>
              </label>
              <button onClick={() => judge({ k: 'tap', id: u.id, tapped: !u.tapped })}>{u.tapped ? 'untap' : 'tap'}</button>
              <button onClick={() => judge({ k: 'disable', unitId: u.id, on: !u.disabled })}>{u.disabled ? 'enable' : 'disable'}</button>
              <button onClick={() => judge({ k: 'stealth', unitId: u.id, on: !u.stealth })}>stealth</button>
              <button onClick={() => judge({ k: 'ward', unitId: u.id, on: !u.ward })}>ward</button>
              {!u.isAvatar && (
                <>
                  <button onClick={() => judge({ k: 'silence', unitId: u.id, on: !u.silenced })}>{u.silenced ? 'unsilence' : 'silence'}</button>
                  <button title="Toggle summoning sickness (can't attack/tap the turn it entered)" onClick={() => judge({ k: 'summonSick', unitId: u.id, on: !isSummoningSick(view as any, u) })}>{isSummoningSick(view as any, u) ? 'unsick' : 'summon sick'}</button>
                  <button title="Dies (to the cemetery), firing death triggers" onClick={() => judge({ k: 'kill', unitId: u.id })}>kill →⚰</button>
                  <button title="Removed from the game completely (no death triggers)" onClick={() => judge({ k: 'banish', unitId: u.id })}>destroy 🚫</button>
                  <button onClick={() => judge({ k: 'bounce', unitId: u.id })}>to hand</button>
                  <button title="Give control of this minion to the other player" onClick={() => judge({ k: 'setController', unitId: u.id, player: (1 - u.controller) as PlayerId })}>⇄ control → {view.players[(1 - u.controller) as PlayerId].name}</button>
                  {regionButtons(u, u.id)}
                </>
              )}
            </>
          )}
        </span>
      </div>
      {/* unit extras: judge move, keyword grant, give artifact */}
      {u && (
        <div className="jp-row">
          <span className="jp-group">
            <button
              data-judge-move={u.id}
              onClick={() => {
                setMode({ m: 'judgePlace', op: 'move', unitId: u.id, player: u.controller, region: u.region })
              }}
            >
              move (click a square)
            </button>
            <label>
              effect
              <select data-judge-kw value={kwSel} onChange={(e) => setKwSel(e.target.value)}>
                {JUDGE_KEYWORDS.map((k) => (
                  <option key={k.kw} value={k.kw}>{k.label}</option>
                ))}
              </select>
              <select data-judge-kw-dur value={kwDur} onChange={(e) => setKwDur(e.target.value as any)}>
                <option value="permanent">permanent</option>
                <option value="endOfTurn">turn</option>
              </select>
              <button data-judge-kw-go={u.id} onClick={() => judge({ k: 'keyword', unitId: u.id, keyword: kwSel, duration: kwDur })}>grant</button>
              <button data-judge-kw-rm={u.id} title="Strip this keyword (works even on a printed one)" onClick={() => judge({ k: 'keyword', unitId: u.id, keyword: kwSel, duration: kwDur, remove: true })}>remove</button>
            </label>
            <label>
              give artifact
              <input data-judge-artname value={artName} list="jp-card-names" onChange={(e) => setArtName(e.target.value)} style={{ width: '9em' }} />
              <button
                data-judge-giveart={u.id}
                disabled={!artName || findCard(artName)?.type !== 'Artifact'}
                title={artName && findCard(artName)?.type !== 'Artifact' ? 'Not an artifact.' : undefined}
                onClick={() => judge({ k: 'spawnArtifact', name: artName, player: u.controller, x: u.x, y: u.y, giveTo: u.id })}
              >
                to {u.name}
              </button>
            </label>
          </span>
        </div>
      )}
      </>)}
      {modType === 'unit' && u && artPickerRow(u.name, u.cardId)}
      {modType === 'site' && (
      <div className="jp-row">
        <span className="jp-group">
          Site:
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">—</option>
            {sites.filter((s) => !s.isRubble).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {squareLabel(s.x, s.y)}
              </option>
            ))}
          </select>
          {site && (
            <>
              <button onClick={() => judge({ k: 'tap', id: site.id, tapped: !site.tapped })}>{site.tapped ? 'untap' : 'tap'}</button>
              <button onClick={() => judge({ k: 'siteWard', siteId: site.id, on: !site.ward })}>{site.ward ? 'unward' : 'ward'}</button>
              <button onClick={() => judge({ k: 'flood', siteId: site.id, on: !site.flooded })}>{site.flooded ? 'drain' : 'flood'}</button>
              <button title="Swap this site for another site in the same spot (same controller)" onClick={() => { setReplaceQuery(''); setReplaceOpen(true) }}>🔄 replace…</button>
              <button title="Destroyed → cemetery, leaves rubble (fires 'when destroyed' triggers)" onClick={() => judge({ k: 'destroySite', siteId: site.id })}>destroy →⚰</button>
              <button title="Removed from the game completely; the square is cleared" onClick={() => { judge({ k: 'destroySite', siteId: site.id, toBanish: true }); setSiteId('') }}>remove 🚫</button>
            </>
          )}
        </span>
      </div>
      )}
      {replaceOpen && site && (
        <div className="jp-replace-overlay" onClick={() => setReplaceOpen(false)}>
          <div className="jp-replace-box" onClick={(e) => e.stopPropagation()}>
            <div className="jp-replace-head">
              <b>Replace {site.name} {squareLabel(site.x, site.y)} with…</b>
              <button title="Close" onClick={() => setReplaceOpen(false)}>✕</button>
            </div>
            <input autoFocus placeholder="search sites…" value={replaceQuery} onChange={(e) => setReplaceQuery(e.target.value)} />
            <div className="jp-replace-grid">
              {allCards
                .filter((c) => c.type === 'Site' && c.name.toLowerCase().includes(replaceQuery.toLowerCase()))
                .slice(0, 120)
                .map((c) => (
                  <button
                    key={c.name}
                    className="jp-replace-opt"
                    title={c.name}
                    onClick={() => { judge({ k: 'replaceSite', siteId: site.id, name: c.name }); setReplaceOpen(false); setSiteId('') }}
                  >
                    <CardImg name={c.name} className="jp-replace-thumb" />
                    <span>{c.name}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {modType === 'site' && site && artPickerRow(site.name, site.cardId)}
      {modType === 'artifact' && (
      <div className="jp-row">
        <span className="jp-group">
          Artifact:
          <select data-judge-artsel value={artSel} onChange={(e) => setArtSel(e.target.value)}>
            <option value="">—</option>
            {artifacts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.carriedBy ? ` (carried by ${view.units[a.carriedBy]?.name ?? '?'})` : ` ${squareLabel(a.x, a.y)}`}
              </option>
            ))}
          </select>
          {art && (
            <>
              <button onClick={() => judge({ k: 'tap', id: art.id, tapped: !art.tapped })}>{art.tapped ? 'untap' : 'tap'}</button>
              <button
                data-judge-moveart={art.id}
                onClick={() => setMode({ m: 'judgePlace', op: 'moveArtifact', artifactId: art.id, player: me, region: art.region ?? 'surface' })}
              >
                move (click a square)
              </button>
              {regionButtons({ x: art.x, y: art.y, region: art.region }, art.id)}
              {!art.carriedBy && (
                <button title="Give control of this artifact/monument to the other player"
                  onClick={() => judge({ k: 'setArtifactController', artifactId: art.id, player: (1 - (art.conjuredBy ?? 0)) as PlayerId })}>
                  ⇄ control → {view.players[(1 - (art.conjuredBy ?? 0)) as PlayerId].name}
                </button>
              )}
              <button title="To the cemetery (breaks normally)" onClick={() => { judge({ k: 'removeArtifact', artifactId: art.id }); setArtSel('') }}>destroy →⚰</button>
              <button title="Removed from the game completely" onClick={() => { judge({ k: 'removeArtifact', artifactId: art.id, toBanish: true }); setArtSel('') }}>remove 🚫</button>
            </>
          )}
        </span>
      </div>
      )}
      {modType === 'artifact' && art && artPickerRow(art.name, art.cardId)}
      {modType === 'aura' && (
      <div className="jp-row">
        <span className="jp-group">
          Aura:
          <select data-judge-aurasel value={auraSel || selectedAuraId || ''} onChange={(e) => setAuraSel(e.target.value)}>
            <option value="">—</option>
            {auras.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.squares?.[0] ? ` ${squareLabel(a.squares[0].x, a.squares[0].y)}` : ''} · {view.players[a.controller]?.name}
              </option>
            ))}
          </select>
          {aura ? (
            <>
              <button title="Destroyed → its card goes to the cemetery" onClick={() => { judge({ k: 'removeAura', auraId: aura.id }); setAuraSel('') }}>destroy →⚰</button>
              <button title="Removed from the game completely" onClick={() => { judge({ k: 'removeAura', auraId: aura.id, toBanish: true }); setAuraSel('') }}>remove 🚫</button>
            </>
          ) : <i>(pick one)</i>}
        </span>
      </div>
      )}
      </>)}
      {/* swap either player's avatar to a different one (keeps life & position) */}
      {tab === 'avatars' && (
      <div className="jp-row">
        <span className="jp-group">
          Avatar:
          {[0, 1].map((p) => (
            <label key={p} data-judge-avatar-group={p}>
              {view.players[p].name}
              <select value={avatarPick[p] ?? ''} onChange={(e) => setAvatarPick({ ...avatarPick, [p]: e.target.value })}>
                <option value="">— now: {view.units[view.players[p].avatarUnitId]?.name} —</option>
                {avatarNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <button data-judge-setavatar={p} disabled={!avatarPick[p]} onClick={() => avatarPick[p] && judge({ k: 'setAvatar', player: p as PlayerId, name: avatarPick[p] })}>set</button>
            </label>
          ))}
        </span>
      </div>
      )}
      {/* per-player avatar art — only shown for avatars that actually have an alternative printing */}
      {tab === 'avatars' && ([0, 1] as PlayerId[]).map((p) => {
        const av = view.units[view.players[p].avatarUnitId]
        const row = av ? artPickerRow(av.name, av.cardId) : null
        return row ? <div key={`aart${p}`} className="jp-avatar-art"><span className="jp-art-who">{view.players[p].name}’s avatar</span>{row}</div> : null
      })}
    </div>
  )
}

/** contextual action buttons for the selected unit */
// activated abilities on one of your own selected sites (Floodplain's Overflow, etc.)
function siteActions(st: any, view: PlayerView, me: PlayerId, mode: Mode, setMode: (m: Mode) => void, send: (a: Action) => void) {
  if (mode.m !== 'site') return null
  const site = (view.sites as any)[mode.siteId]
  if (!site || site.controller !== me) return null
  const abilities = getScript(site.name)?.abilities ?? []
  if (!abilities.length) return null
  const activate = (ability: { key: string; targets?: any[]; cost?: any }) => {
    const specs = ability.targets ?? []
    const needed = specs.reduce((a: number, s2: any) => a + s2.count, 0)
    if (needed > 0) {
      setMode({ m: 'abilityTargets', sourceId: site.id, abilityKey: ability.key, specs, picked: [] })
      return
    }
    send({ t: 'activate', sourceId: site.id, ability: ability.key })
  }
  return (
    <div className="unitactions">
      <b>{site.name}</b>
      {abilities.map((a: any) => {
        const reason = (() => { try { return canActivate(st, me, site.id, a.key) } catch { return null } })()
        return (
          <button key={a.key} data-ability={a.key} data-source={site.id} onClick={() => activate(a)}
            disabled={reason !== null} title={reason ?? undefined}>
            {a.label}
          </button>
        )
      })}
    </div>
  )
}

// activated abilities on a STANDALONE (uncarried) artifact you control, sitting on a
// site (Cradle of Etherrum, Hemogoblet, Pile of Skulls). Carried-artifact abilities
// are handled by unitActions via the bearer instead.
function artifactActions(st: any, view: PlayerView, me: PlayerId, mode: Mode, setMode: (m: Mode) => void, send: (a: Action) => void) {
  if (mode.m !== 'artifact') return null
  const art = (view.artifacts as any)[mode.artifactId]
  if (!art || art.carriedBy || art.conjuredBy !== me) return null
  const abilities = getScript(art.name)?.abilities ?? []
  const activateVia = (sourceId: string, ability: { key: string; targets?: any[]; cost?: any }) => {
    const specs = ability.targets ?? []
    const needed = specs.reduce((a: number, s2: any) => a + s2.count, 0)
    if (needed > 0) {
      setMode({ m: 'abilityTargets', sourceId, abilityKey: ability.key, specs, picked: [] })
      return
    }
    send({ t: 'activate', sourceId, ability: ability.key })
  }
  const here = (Object.values(view.units) as UnitState[]).filter(
    (u) => u.controller === me && u.x === art.x && u.y === art.y && u.region === art.region && !u.carriedBy,
  )
  // abilities this GROUND artifact grants to units standing on it (Rolling Boulder's
  // "Tap → push"). Surface them on the artifact's own panel too — routed through a
  // co-located unit — so selecting the artifact is enough to use them.
  const grantsFn = getScript(art.name)?.artifactGrantsAbilities
  const grantedHere: { unit: UnitState; ability: any }[] = []
  if (grantsFn) {
    for (const u of here) {
      try { for (const ab of grantsFn(st, art.id, u)) grantedHere.push({ unit: u, ability: ab }) } catch { /* ignore */ }
    }
  }
  if (!abilities.length && !grantedHere.length && here.length === 0) return null
  return (
    <div className="unitactions">
      <b>{art.name}</b>
      {abilities.map((a: any) => {
        const reason = (() => { try { return canActivate(st, me, art.id, a.key) } catch { return null } })()
        return (
          <button key={a.key} data-ability={a.key} data-source={art.id} onClick={() => activateVia(art.id, a)}
            disabled={reason !== null} title={reason ?? undefined}>
            {a.label}
          </button>
        )
      })}
      {grantedHere.map(({ unit, ability }) => {
        const reason = (() => { try { return canActivate(st, me, unit.id, ability.key) } catch { return null } })()
        return (
          <button key={unit.id + ability.key} data-ability={ability.key} data-source={unit.id} data-granted="1"
            disabled={reason !== null} title={reason ?? undefined}
            onClick={() => activateVia(unit.id, ability)}>
            {ability.label}{here.length > 1 ? ` (via ${unit.name})` : ''}
          </button>
        )
      })}
      {here.length > 0 && isCarriableArtifact(art.name) && (
        // Monuments/Automatons are immovable — never offer to pick them up (the engine rejects it too)
        <button data-pickup={art.id} onClick={() => send({ t: 'pickUp', unitId: here[0].id, artifactIds: [art.id] })}>Pick up with {here[0].name}</button>
      )}
    </div>
  )
}

function unitActions(st: any, view: PlayerView, me: PlayerId, mode: Mode, setMode: (m: Mode) => void, send: (a: Action) => void, myTurn: boolean, verticalMove: (u: UnitState, vdest: { x: number; y: number; region: Region }) => void) {
  // abilities with declared target specs go through the board target picker
  const activateAbilityClick = (sourceId: string, ability: { key: string; targets?: any[] }) => {
    const specs = ability.targets ?? []
    const needed = specs.reduce((a: number, s2: any) => a + s2.count, 0)
    if (needed > 0) {
      setMode({ m: 'abilityTargets', sourceId, abilityKey: ability.key, specs, picked: [] })
      return
    }
    send({ t: 'activate', sourceId, ability: ability.key })
  }
  if (mode.m !== 'unit') return null
  const u = view.units[mode.unitId] as UnitState | undefined
  if (!u || u.controller !== me) return null
  let kw: any = {}
  try { kw = effKeywords(st, u) } catch { /* ignore */ }
  const script = getScript(u.name)
  const artsHere = Object.values(view.artifacts).filter((a: any) => a.x === u.x && a.y === u.y && !a.carriedBy && isCarriableArtifact(a.name)) // Monuments/Automatons are immovable
  // units this carrier could pick up right here — either via its OWN "may carry" spec, OR because the
  // cargo invites itself onto any matching carrier (Sir Tom Thumb: "May be carried by any Beast"), which
  // needs no carryUnits spec on the carrier and ignores who owns the cargo (any Beast, allied or enemy).
  const carrySpec = script?.carryUnits
  const unitsHere = (Object.values(view.units) as UnitState[]).filter((o) => {
    if (o.id === u.id || o.carriedBy) return false
    if (o.x !== u.x || o.y !== u.y || o.region !== u.region) return false
    // self-inviting cargo (carriedByAnyone) — the engine allows even avatars here, so don't gate on that
    try {
      const invite = getScript(o.name)?.carriedByAnyone
      if (invite && !o.silenced && invite(st, u)) return true
    } catch { /* ignore */ }
    if (!carrySpec) return false
    if (o.isAvatar && !carrySpec.allowAvatar) return false // avatars only for "may carry an ally"
    try {
      return !carrySpec.filter || carrySpec.filter(st, u, o)
    } catch {
      return false
    }
  })
  return (
    <div className="unitactions">
      <b>{u.name}</b>
      {/* the avatar's built-in "Tap → draw a site from your atlas" surfaces here, like
          any other ability, instead of a standalone panel under the board. */}
      {u.isAvatar && myTurn && !u.tapped && !script?.noStandardSiteAction && !script?.noAtlasDraw && (
        <button data-tap-draw-site="1" onClick={() => send({ t: 'avatarSite', mode: 'draw' })}>Tap: draw site</button>
      )}
      {kw.ranged && !u.tapped && !isSummoningSick(view as any, u) && <button data-ability="ranged" data-source={u.id} onClick={() => setMode({ m: 'shoot', unitId: u.id })}>Shoot (Ranged {kw.ranged})</button>}
      {/* Burrow / Submerge / Surface — ONE context action: dive when on the surface, resurface
          when below. Only when untapped & not summoning-sick, and only if the region step is
          legal here. Surfacing/emerging into enemies then opens the usual attack chooser. */}
      {(kw.burrowing || kw.submerge) && myTurn && !u.tapped && !isSummoningSick(view as any, u) && (() => {
        const vdest = reachableLocations(st, u).find((loc) => loc.x === u.x && loc.y === u.y && loc.region !== u.region)
        if (!vdest) return null
        const label = vdest.region === 'underground' ? '⛏ Burrow' : vdest.region === 'underwater' ? '🌊 Submerge' : '🏔 Surface'
        return <button data-vmove={vdest.region} data-source={u.id} onClick={() => verticalMove(u, vdest)}>{label}</button>
      })()}
      {artsHere.length === 1 && (
        <button data-pickup-arts={u.id} onClick={() => send({ t: 'pickUp', unitId: u.id, artifactIds: [artsHere[0].id] })}>Pick up {artsHere[0].name}</button>
      )}
      {/* 2+ pickable artifacts here → let the player choose which ones (multi-select) */}
      {artsHere.length > 1 && (
        <button data-pickup-arts={u.id} onClick={() => setMode({ m: 'chooseArts', kind: 'pickup', unitId: u.id, artIds: artsHere.map((a: any) => a.id), picked: [] })}>Pick up artifacts…</button>
      )}
      {unitsHere.map((o) => (
        <button key={o.id} data-carry={o.id} data-source={u.id} onClick={() => send({ t: 'pickUp', unitId: u.id, artifactIds: [], unitIds: [o.id] })}>
          Carry {o.name}
        </button>
      ))}
      {/* Drop is offered only when the unit hasn't interacted this turn and isn't a
          can't-let-go carrier. The menu appears only if it CAN drop 2+ artifacts
          (artifacts flagged cantDrop, e.g. cursed gear, are excluded from the count). */}
      {(() => {
        if (u.interactedTurn === view.turn) return null
        if (getScript(u.name)?.unitCantDrop && !u.silenced) return null
        const droppable = u.carrying.filter((id) => !getScript((view.artifacts as any)[id]?.name ?? '')?.cantDrop)
        if (droppable.length === 1) {
          const only = (view.artifacts as any)[droppable[0]]
          return <button data-drop-arts={u.id} onClick={() => send({ t: 'drop', unitId: u.id, artifactIds: [droppable[0]] })}>Drop {only?.name ?? 'artifact'}</button>
        }
        if (droppable.length > 1) {
          return <button data-drop-arts={u.id} onClick={() => setMode({ m: 'chooseArts', kind: 'drop', unitId: u.id, artIds: droppable, picked: [] })}>Drop artifacts…</button>
        }
        return null
      })()}
      {/* activated abilities on carried artifacts (e.g. Rip Erik's Curiosa) */}
      {u.carrying.map((artId) => {
        const art = (view.artifacts as any)[artId]
        const artScript = art ? getScript(art.name) : null
        return artScript?.abilities?.map((a) => {
          const reason = (() => { try { return canActivate(st, me, artId, a.key) } catch { return null } })()
          return (
            <button key={artId + a.key} data-ability={a.key} data-source={artId}
              disabled={reason !== null} title={reason ?? undefined}
              onClick={() => activateAbilityClick(artId, a)}>
              {art.name}: {a.label}
            </button>
          )
        })
      })}
      {!(getScript(u.name)?.carriedCantDrop && !u.silenced) && u.interactedTurn !== view.turn && u.carryingUnits?.map((id) => {
        const o = view.units[id]
        return o ? (
          <button key={id} data-setdown={id} data-source={u.id} onClick={() => send({ t: 'drop', unitId: u.id, artifactIds: [], unitIds: [id] })}>
            Set down {o.name}
          </button>
        ) : null
      })}
      {script?.abilities?.filter((a) => { try { return a.available ? a.available(st, u.id) : true } catch { return true } }).map((a) => {
        const reason = (() => { try { return canActivate(st, me, u.id, a.key) } catch { return null } })()
        const label = (() => { try { return a.dynamicLabel ? a.dynamicLabel(st, u.id) : a.label } catch { return a.label } })()
        return (
          <button key={a.key} data-ability={a.key} data-source={u.id}
            disabled={reason !== null} title={reason ?? undefined}
            onClick={() => activateAbilityClick(u.id, a)}>
            {label}
          </button>
        )
      })}
      {(() => {
        try {
          return grantedAbilities(st, u).filter((a) => { try { return a.available ? a.available(st, u.id) : true } catch { return true } }).map((a) => {
            const reason = (() => { try { return canActivate(st, me, u.id, a.key) } catch { return null } })()
            const label = (() => { try { return a.dynamicLabel ? a.dynamicLabel(st, u.id) : a.label } catch { return a.label } })()
            return (
              <button key={a.key} data-ability={a.key} data-source={u.id} data-granted="1"
                disabled={reason !== null} title={reason ?? undefined}
                onClick={() => activateAbilityClick(u.id, a)}>
                {label}
              </button>
            )
          })
        } catch {
          return null
        }
      })()}
    </div>
  )
}
