// The core DOM-level playability driver + detectors.
//
// castThroughDom(harness, cardName) clicks the hand card via the DOM, then loops
// (budget ~30): after each render it decides what the UI MUST be offering —
//   • an engine prompt is pending for the acting player (state.prompts.length>0), OR
//   • the client is mid-cast in a targeting mode (a mode banner is showing)
// — collects every clickable affordance currently in the DOM, and:
//   • if NONE exist while the flow is incomplete → records NO_AFFORDANCE
//   • else clicks the FIRST affordance (preferring a real pick over skip) and loops
// It ALSO cross-checks, where enumerable, the COUNT of engine-offered choices
// against the count of enabled DOM affordances (CHOICE_PARITY).
//
// Findings:
//   OK            — card left the hand / spell resolved, prompts empty, no findings
//   NO_AFFORDANCE — engine/UI waiting for input but the DOM has nothing clickable
//   ENGINE_REJECT — a DOM click sent an action the engine rejected (harness drift)
//   CHOICE_PARITY — engine offers N choices, DOM renders a different enabled count
//   NOT_CLICKABLE — clicking the hand card did nothing though the engine says it is
//                   castable (planCast != 'blocked')
//   STUCK         — budget exhausted with affordances still cycling
//
// Board: the SAME scaffold scripts/audit_playable.ts uses, imported from the shared
// engine (auditboard.ts). audit_playable targets units only via engine-enumerated
// prompt candidates / `sq:` refs, so it can use fake `fzu…` ids; the DOM driver
// CLICKS a unit chip whose data-unit is the real object id, so a unit it must
// TARGET is minted with an engine-valid `u…` id via usummon().

import {
  planCast,
  canCast,
  validateSummonAt,
  findPath,
  getScript,
  applyAction,
  board as sharedBoard,
  cinject as sharedCinject,
  usummon as sharedUsummon,
  place as sharedPlace,
  ALL_SQUARES,
  type GameState,
  type PlayerId,
  type Region,
} from '@sorcery/shared'
import type { GameHarness } from './harness'

// re-export the shared scaffolding so specs import board helpers from one place.
// The DOM audit injects cards via cinject (engine-valid `c…` ids) so the client's
// hand-cast-vs-unit-ability disambiguation (shoot mode) routes correctly.
export const board = sharedBoard
export const inject = sharedCinject
export const usummon = sharedUsummon
export const place = sharedPlace

// ---- affordance collection ----

export interface Affordance {
  el: Element
  kind: string   // 'square' | 'unit-target' | 'choice' | 'skip' | 'confirm' | 'cancel' | 'namecard-input'
  skip: boolean  // true for skip/cancel/decline — deprioritised, and NEVER auto-clicked
}

/** Every element the UI currently makes clickable, in the current mode.
 *  nearSq: when provided, genesisTargets unit affordances are sorted by
 *  Chebyshev distance to this square (closest first) so that units at/adjacent
 *  to the summon location are tried before distant ones. */
export function collectAffordances(root: HTMLElement, nearSq?: { x: number; y: number }): Affordance[] {
  const out: Affordance[] = []
  const seen = new Set<Element>()
  const push = (el: Element | null, kind: string, skip = false) => {
    if (!el || seen.has(el)) return
    if ((el as HTMLButtonElement).disabled) return
    seen.add(el)
    out.push({ el, kind, skip })
  }
  // chooseCaster mode: the legal casters are the clickable set (data-target="1").
  // Prefer the AVATAR (data-avatar="1") so the deterministic drive keeps the existing
  // expectations stable — a human could pick any, but the audit wants the avatar unless
  // a test overrides it. Push the avatar FIRST (not skipped), then the rest.
  if (root.querySelector('[data-modebanner="chooseCaster"]')) {
    const cands = [...root.querySelectorAll('[data-target="1"][data-unit]')]
    for (const el of cands) if (el.getAttribute('data-avatar') === '1') push(el, 'caster')
    for (const el of cands) push(el, 'caster')
  }
  // clickable board squares (highlighted this mode) + wall hotspots
  for (const el of root.querySelectorAll('[data-clickable="1"]')) push(el, 'square')
  // board target units / sites flagged as legal targets (chooseTargets / conjure).
  // Deprioritise avatar chips: an avatar is a LEGAL target for many spells, but when a
  // non-avatar target exists we want the driver to try it first (e.g. Duel/Shatter Strike
  // where the observable is an enemy MINION struck, not the far-off enemy Avatar). The
  // `push` dedup means this leading pass fixes the skip flag before the magic/genesis
  // branches re-encounter the same elements.
  for (const el of root.querySelectorAll('[data-target="1"]')) push(el, 'unit-target', el.getAttribute('data-avatar') === '1')
  // site-kind chooseTargets: the client sets NO per-site marker (clickSite handles
  // the click directly), so surface the candidate site CARDS as affordances so the
  // driver can complete a mandatory site pick. The banner exposes the kind.
  if (root.querySelector('[data-promptbox="chooseTargets"][data-target-kind="site"]')) {
    for (const el of root.querySelectorAll('[data-site]')) push(el, 'site-target')
  }
  // Client-side magic / ability target modes make board units/sites clickable.
  // After fix 1, legal targets now carry data-target="1" (set by the extended
  // targetIds computation), so we prefer those over the old catch-all. We still
  // fall back to all units when the spec type is not enumerated by targetIds.
  const magicBanner = root.querySelector('[data-modebanner="magic"],[data-modebanner="abilityTargets"]')
  if (magicBanner) {
    const what = magicBanner.getAttribute('data-spec-what')
    if (what === 'site') {
      for (const el of root.querySelectorAll('[data-site]')) push(el, 'unit-target')
    } else if (what === 'artifact') {
      for (const el of root.querySelectorAll('.ground-art')) push(el, 'unit-target')
    } else {
      // unit / minion / avatar / undefined: prefer data-target="1" chips (engine-validated
      // legal targets). Deprioritise avatars as before (but don't exclude them).
      const targeted = root.querySelectorAll('[data-unit][data-target="1"]')
      const allUnits = root.querySelectorAll('[data-unit]')
      const source = targeted.length > 0 ? targeted : allUnits
      for (const el of source) push(el, 'unit-target', el.getAttribute('data-avatar') === '1')
    }
  }
  // Already-picked targets carry data-picked="1". Exclude them so the driver always
  // clicks a FRESH candidate and never deselects — both for chooseTargets prompts
  // (promptTargets mode: Swap count:2, Dhol Chants upTo) AND for client-side multi-target
  // magic casts (magic mode: Meteor Shower's three distinct sites). Without this the
  // driver re-clicks the first site three times and the spell rejects "no shared borders".
  if (root.querySelector('[data-modebanner="promptTargets"],[data-modebanner="magic"]')) {
    const pickedEls = new Set(root.querySelectorAll('[data-picked="1"]'))
    for (let j = out.length - 1; j >= 0; j--) {
      if (pickedEls.has(out[j].el as Element)) out.splice(j, 1)
    }
  }
  // conjure mode: a highlighted site places the artifact, a highlighted unit carries it
  if (root.querySelector('[data-modebanner="conjure"]')) {
    for (const el of root.querySelectorAll('[data-target="1"]')) push(el, 'unit-target')
  }
  // genesisTargets mode: click a board unit (the genesis target).
  // Sort by Chebyshev distance to the summon square so units at the same or
  // adjacent square are tried first — satisfying 'here' / 'adjacent' / 'nearby'
  // genesis constraints before distant units.
  if (root.querySelector('[data-modebanner="genesisTargets"]')) {
    const units = [...root.querySelectorAll('[data-unit]')]
    if (nearSq) {
      const unitDist = (el: Element) => {
        // unit chip is inside its square div (data-sq="x,y"); walk up to find it
        const sqEl = el.closest('[data-sq]')
        const sq = (sqEl?.getAttribute('data-sq') ?? '').split(',')
        return sq.length >= 2
          ? Math.max(Math.abs(+sq[0] - nearSq.x), Math.abs(+sq[1] - nearSq.y))
          : 99
      }
      units.sort((a, b) => unitDist(a) - unitDist(b))
    }
    for (const el of units) push(el, 'unit-target', el.getAttribute('data-avatar') === '1')
  }
  // prompt / choice-grid cells + choice buttons in modals & banners
  for (const el of root.querySelectorAll('[data-choice]')) push(el, 'choice')
  // free-text nameCard input (typed, not clicked)
  for (const el of root.querySelectorAll('[data-namecard-input="1"]')) push(el, 'namecard-input')
  // allocateDamage: +/all buttons
  for (const el of root.querySelectorAll('[data-alloc-all],[data-alloc-plus]')) push(el, 'alloc')
  // confirm buttons (multi-pick prompts)
  for (const el of root.querySelectorAll('[data-confirm="1"]')) push(el, 'confirm')
  // skip / decline / cancel affordances (deprioritised — a real pick is preferred)
  for (const el of root.querySelectorAll('[data-skip="1"]')) push(el, 'skip', true)
  for (const el of root.querySelectorAll('[data-cancel="1"]')) push(el, 'cancel', true)
  return out
}

/** Is the client mid-flow and needing input? Either an engine prompt is pending
 *  for the acting player, or a client-side mode banner is showing. */
export function needsInput(state: GameState, root: HTMLElement): { pending: boolean; reason: string } {
  if (state.prompts.length > 0) {
    const p = state.prompts[0]
    return { pending: true, reason: `prompt:${p.kind} "${p.title}"` }
  }
  const banner = root.querySelector('[data-modebanner]')
  if (banner) {
    return { pending: true, reason: `mode:${banner.getAttribute('data-modebanner')}` }
  }
  return { pending: false, reason: '' }
}

// ---- CHOICE_PARITY: engine-offered choice count vs rendered enabled affordances ----

/** How many distinct choices does the engine offer for the current decision, and
 *  how many enabled affordances SHOULD the DOM render for it? Returns null when the
 *  current surface is not one we enumerate yet. */
export function engineChoiceCount(state: GameState, me: PlayerId): { kind: string; engine: number; extra?: any } | null {
  const p = state.prompts[0]
  if (p) {
    const d: any = p.data ?? {}
    switch (p.kind) {
      case 'chooseOption': return { kind: 'chooseOption', engine: (d.options ?? []).length }
      case 'drawDeck': {
        // the client always shows exactly the two deck buttons (spellbook + atlas)
        return { kind: 'drawDeck', engine: 2 }
      }
      case 'defend': return { kind: 'defend', engine: (d.candidates ?? []).length }
      case 'intercept': return { kind: 'intercept', engine: (d.candidates ?? []).length }
      case 'chooseTargets': {
        // Only UNIT-target chooseTargets is enumerable via the DOM: the client marks
        // each candidate unit chip with data-target="1" (Game.tsx targetIds). A
        // site-kind chooseTargets renders NO per-candidate marker — the player clicks
        // the site card directly — so parity there is not DOM-measurable (skip it).
        if (!Array.isArray(d.candidates) || d.kind === 'site') return null
        return { kind: 'chooseTargets', engine: d.candidates.length }
      }
      case 'chooseCards': {
        // The engine supplies the card list; the client renders one toggle per card.
        // `pick` is the selection cap (not a parity count — parity is card count).
        const cards: string[] = d.cards ?? []
        return { kind: 'chooseCards', engine: cards.length, extra: { pick: d.pick ?? 1 } }
      }
      case 'orderCards': {
        // The engine supplies the card list; the client renders one tile per card.
        const cards: string[] = d.cards ?? []
        return { kind: 'orderCards', engine: cards.length }
      }
      case 'nameCard': {
        // Restricted-choice nameCard (asChoice path in Game.tsx: names present AND
        // pool.length <= 40, or fromCollection). The client renders one data-choice
        // per name. Free-text path (pool.length > 40 or no names) is not parity-
        // enumerable by count — we check confirm-gate behaviour there via the driver.
        const pool: string[] = d.names ?? []
        const asChoice = !!d.fromCollection || (pool.length > 0 && pool.length <= 40)
        if (!asChoice) return null
        return { kind: 'nameCard', engine: pool.length }
      }
      case 'chooseSquare': {
        // The engine narrows the legal squares; the client highlights exactly those
        // squares with data-clickable on the board. An empty `squares` means ALL
        // squares are legal (e.g. Plague of Frogs before any frog); we skip parity in
        // that case (any of 20 squares is valid, and the DOM naturally shows all 20).
        const squares: any[] = d.squares ?? []
        if (squares.length === 0) return null // all-squares: skip parity
        return { kind: 'chooseSquare', engine: squares.length }
      }
      case 'stayInFight': {
        // always exactly 2 choices (Stay / Withdraw)
        return { kind: 'stayInFight', engine: 2 }
      }
      case 'allocateDamage': {
        // one allocRow per candidate; parity on candidate count (not confirm state)
        const candidates: string[] = d.candidates ?? []
        return { kind: 'allocateDamage', engine: candidates.length, extra: { power: d.power ?? 0 } }
      }
      default: return null
    }
  }
  return null
}

/** count the DOM affordances that correspond to the engine's enumerated choices. */
export function domChoiceCount(kind: string, root: HTMLElement): number {
  switch (kind) {
    case 'chooseOption':
      return root.querySelectorAll('[data-promptbox="chooseOption"] [data-choice]:not([disabled])').length
    case 'drawDeck':
      return root.querySelectorAll('[data-promptbox="drawDeck"] [data-choice]:not([disabled])').length
    case 'defend':
      // the candidate toggle buttons (NOT the confirm / skip)
      return root.querySelectorAll('[data-promptbox="defend"] [data-choice]:not([disabled])').length
    case 'intercept':
      return root.querySelectorAll('[data-promptbox="intercept"] [data-choice]:not([disabled])').length
    case 'chooseTargets':
      // the client highlights legal targets on the board with data-target="1"
      return root.querySelectorAll('[data-target="1"]').length
    case 'chooseCards':
      // one data-choice tile per card in the revealed list
      return root.querySelectorAll('[data-promptbox="chooseCards"] [data-choice]').length
    case 'orderCards':
      // one data-choice tile per card in the revealed list
      return root.querySelectorAll('[data-promptbox="orderCards"] [data-choice]').length
    case 'nameCard':
      // restricted-choice grid: one data-choice tile per name
      return root.querySelectorAll('[data-promptbox="nameCard"] [data-choice]').length
    case 'chooseSquare':
      // the engine-narrowed squares are highlighted with data-clickable="1" on board
      return root.querySelectorAll('[data-clickable="1"]').length
    case 'stayInFight':
      return root.querySelectorAll('[data-promptbox="stayInFight"] [data-choice]:not([disabled])').length
    case 'allocateDamage':
      // one alloc row per candidate; each row has a data-alloc-plus button
      return root.querySelectorAll('[data-promptbox="allocateDamage"] [data-alloc-plus]').length
    default:
      return -1
  }
}

/** engine-legal summon regions for a card at any square where >1 region is legal
 *  (the case that opens the summonRegion banner). Returns the regions for the FIRST
 *  such square, matching how a human first clicks that square. */
export function summonRegionsForCard(state: GameState, me: PlayerId, name: string): Region[] {
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 4; y++) {
      const regs = (['surface', 'underground', 'underwater', 'void'] as Region[]).filter(
        (r) => validateSummonAt(state, me, name, { x, y, region: r }) === null,
      )
      if (regs.length > 1) return regs
    }
  return []
}

/** The engine's legal-caster set for a hand card — every controlled unit (avatar
 *  first) for which canCast passes. Mirrors the client's legalCasters() so the DOM
 *  driver can CHOICE_PARITY-check the caster picker against the engine independently. */
export function legalCasterSet(state: GameState, me: PlayerId, cardId: string): string[] {
  const out: string[] = []
  const avatarId = state.players[me].avatarUnitId
  if (canCast(state, me, cardId, avatarId).ok) out.push(avatarId)
  for (const u of Object.values(state.units)) {
    if (u.controller !== me || u.isAvatar) continue
    if (canCast(state, me, cardId, u.id).ok) out.push(u.id)
  }
  return out
}

// ---- findings ----

export type FindingKind = 'OK' | 'NO_AFFORDANCE' | 'ENGINE_REJECT' | 'CHOICE_PARITY' | 'NOT_CLICKABLE' | 'STUCK'
export interface Finding {
  card: string
  kind: FindingKind
  detail: string
  trace: string[]
}

// ---- the driver ----

/**
 * Drive one card entirely through the real DOM. Assumes the harness is mounted on
 * a board where the card sits in player 0's hand. Uses the engine as an ORACLE:
 *   • planCast decides whether the card SHOULD be castable (→ NOT_CLICKABLE check)
 *   • engineChoiceCount/domChoiceCount cross-check CHOICE_PARITY at each surface
 *
 * Retry semantics: when a click produces ENGINE_REJECT (engine rejects the target
 * for constraint reasons — nearby/adjacent/ally/type), the driver retries with the
 * next available affordance of the same kind. Only when ALL candidates are exhausted
 * is it reported as a real ENGINE_REJECT finding.
 *
 * Genesis target proximity: when in genesisTargets mode, unit affordances are
 * sorted by proximity to the last-clicked summon square so that units at (or
 * adjacent/nearby to) the summon square are tried first — satisfying 'here',
 * 'adjacent', and 'nearby' genesis constraints before distant units.
 */
export function castThroughDom(harness: GameHarness, cardName: string, budget = 40): Finding {
  const trace: string[] = []
  const root = harness.container
  const state = harness.state
  const me: PlayerId = 0

  const cardId = handIdOf(state, cardName)
  const handBefore = state.players[0].hand.length

  // ORACLE: what flow should clicking this card begin?
  const plan = cardId ? planCast(state, me, cardId, state.players[me].avatarUnitId) : { kind: 'blocked' as const, reason: 'no card' }

  // 1) click the hand card by name
  harness.rerender()
  const handEl = root.querySelector(`[data-hand][data-card="${cssEscape(cardName)}"]`)
  if (!handEl) {
    return { card: cardName, kind: 'NO_AFFORDANCE', detail: `hand card "${cardName}" not rendered`, trace }
  }
  if (handEl.getAttribute('data-disabled') === '1') {
    return { card: cardName, kind: 'NO_AFFORDANCE', detail: `hand card "${cardName}" rendered but disabled (locked/sealed)`, trace }
  }
  const driftAt0 = harness.drifts.length
  trace.push(`click hand "${cardName}" (plan=${plan.kind})`)
  harness.click(handEl)
  harness.rerender()

  // NOT_CLICKABLE: the engine says it's castable, but nothing happened — still idle,
  // no prompt, no mode banner, no action sent, and the card is still in hand.
  if (plan.kind !== 'blocked') {
    const need0 = needsInput(state, root)
    const noAction = harness.drifts.length === driftAt0 && state.prompts.length === 0
    const stillIdle = !need0.pending
    if (stillIdle && noAction && stillHolding(state, cardName, handBefore)) {
      return { card: cardName, kind: 'NOT_CLICKABLE', detail: `engine says castable (plan=${plan.kind}) but clicking the hand card did nothing`, trace }
    }
  }

  // last-clicked summon square: tracked so genesis affordances are sorted by proximity
  let lastSummonSq: { x: number; y: number } | null = null

  // mutable drift baseline: advanced when we retry after a reject so the next
  // iteration detects the NEW rejection, not the already-handled one.
  let driftBaseline = harness.drifts.length
  // multi-select bookkeeping (chooseCards / orderCards / allocateDamage)
  let lastMultiPrompt = ''
  let multiSelected = 0
  // retry bookkeeping: when a click produces ENGINE_REJECT (the engine rejected a
  // UI-legal click because of target constraints — nearby/adjacent/ally/type), we
  // retry with the NEXT affordance of the same kind rather than failing immediately.
  // This models what a human would do: try the next unit if the first one fails.
  // We only retry within the same "surface" (same prompt or mode); if ALL candidates
  // in that surface produce ENGINE_REJECT, we report it as a real failure.
  let lastRejectSurface = ''
  let skipAffordanceIndex = 0 // how many leading affordances to skip after a reject
  // magic-mode re-entry: Game.tsx pickTarget calls setMode({m:'idle'}) unconditionally
  // after sending castSpell, even on ENGINE_REJECT. When this happens the mode banner
  // disappears and collectAffordances finds no unit targets — the card is still in hand.
  // We re-click the hand card to re-enter magic mode, remembering which unit elements
  // we already tried so we click the next one rather than repeating the rejected one.
  const triedUnitEls = new Set<Element>()
  let reentryCount = 0
  // caster-picker backtracking: when >1 unit can legally cast (the chooseCaster
  // banner), the driver PREFERS the avatar for stable, deterministic drives. But the
  // avatar may be the wrong caster for a range-anchored spell (Kiss of Death's 'here'
  // wants the co-located Undead, not the far avatar). If a caster pick dead-ends the
  // flow, we backtrack — cancel to hand, re-click, and pick the NEXT untried caster.
  const triedCasterIds = new Set<string>()
  let lastCasterPicked: string | null = null
  // loop-break for recurring OPTIONAL yes/no prompts (Chaoswish's copy chain):
  // accept once, then decline, so an always-accept driver can't spin forever.
  const yesNoAnswered = new Map<string, number>()

  // 2) drive the flow to quiescence
  for (let i = 0; i < budget; i++) {
    harness.rerender()

    // Chaos Twister blow chain (planCast='chaosTwister'): the four blow banners carry
    // no data-target/parity markers the generic affordance collector understands, so we
    // drive the blowTarget→blowOrigin→blowDir→blowConfirm sequence explicitly here. This
    // mirrors the dedicated C.3 test's click chain so the sweep completes Chaos Twister
    // like any other card (zero driver-skips).
    {
      const done = driveChaosTwisterStep(harness, root, trace)
      if (done === 'stepped') { driftBaseline = harness.drifts.length; continue }
      // done === 'notblow' → fall through to the generic driver
    }

    // Area-damage confirmation banner (Lava Flow, Cone of Flame, Firebreathing,
    // Flame Wave, Burning Hands, + the target-based Major Explosion / Craterize /
    // Meteor Shower): the direction/target pick is held behind a Cast/Cancel panel.
    // The generic collector sees `data-confirm` but the underlying pick can still be
    // clickable on some surfaces, so drive Cast explicitly here to always commit.
    {
      const areaBanner = root.querySelector('[data-modebanner="areaConfirm"]')
      if (areaBanner) {
        const cast = areaBanner.querySelector('[data-confirm="1"]') as HTMLButtonElement | null
        if (cast && !cast.disabled) {
          trace.push('[areaConfirm] Cast')
          harness.click(cast)
          driftBaseline = harness.drifts.length
          continue
        }
      }
    }

    // engine rejected a click we made
    if (harness.drifts.length > driftBaseline) {
      const d = harness.drifts[harness.drifts.length - 1]
      const need = needsInput(state, root)
      const surface = need.reason

      // Detect magic-mode reset: pickTarget in Game.tsx calls setMode({m:'idle'})
      // unconditionally after ENGINE_REJECT, removing the magic banner. When this
      // happens: no banner, no prompt, card still in hand → re-enter cast flow.
      const modeReset = !need.pending && stillHolding(state, cardName, handBefore)
      if (modeReset && reentryCount < 8) {
        reentryCount++
        driftBaseline = harness.drifts.length
        // re-click the hand card to re-enter magic mode
        const handEl2 = root.querySelector(`[data-hand][data-card="${cssEscape(cardName)}"]`)
        if (handEl2 && handEl2.getAttribute('data-disabled') !== '1') {
          trace.push(`[reentry ${reentryCount}] re-click hand card (prev: ${d.error})`)
          harness.click(handEl2)
          harness.rerender()
          // mark already-tried unit so the main loop skips it
          // (the last clicked unit target in this mode is the rejected one)
          const lastUnitAff = collectAffordances(root, lastSummonSq ?? undefined)
            .find((a) => a.kind === 'unit-target' && !a.skip)
          // We'll skip the rejected element by tracking it in triedUnitEls.
          // The rejected unit's element reference is gone (DOM re-rendered), so
          // track by data-unit attribute of what was rejected.
          const rejectedUnitId = (d.action as any)?.targets?.[0] ?? ''
          if (rejectedUnitId) {
            // mark all unit chips with this id as tried (there's only one per unit)
            for (const el of root.querySelectorAll(`[data-unit="${rejectedUnitId}"]`)) {
              triedUnitEls.add(el)
            }
          } else if (lastUnitAff) {
            triedUnitEls.add(lastUnitAff.el)
          }
          continue
        }
      }

      if (surface !== lastRejectSurface) {
        // new surface → reset retry counter
        lastRejectSurface = surface
        skipAffordanceIndex = 1 // already tried index 0 (which was rejected)
      } else {
        skipAffordanceIndex++
      }

      // collect all real picks for this surface; if there are more to try, retry
      const aff = collectAffordances(root, lastSummonSq ?? undefined)
      const realPicks = aff.filter((a) => !a.skip)
      if (skipAffordanceIndex < realPicks.length) {
        // advance baseline so the next iteration judges only the NEW action
        driftBaseline = harness.drifts.length
        const retryPick = realPicks[skipAffordanceIndex]
        trace.push(`[retry ${skipAffordanceIndex}] ${retryPick.kind}${describe(retryPick.el)} (prev: ${d.error})`)
        harness.click(retryPick.el)
        continue
      }

      // all candidates exhausted → real ENGINE_REJECT failure
      return {
        card: cardName,
        kind: 'ENGINE_REJECT',
        detail: `engine rejected all ${skipAffordanceIndex + 1} UI-offered action(s) at [${surface}]; last: ${JSON.stringify(d.action).slice(0, 80)}: ${d.error}`,
        trace,
      }
    }

    // reset retry state when a click was accepted and the surface advances
    const need = needsInput(state, root)
    const surface = need.reason
    if (surface !== lastRejectSurface) {
      lastRejectSurface = surface
      skipAffordanceIndex = 0
    }

    // success: no pending input, no prompts, and the card left the hand
    if (!need.pending && state.prompts.length === 0) {
      if (!stillHolding(state, cardName, handBefore)) {
        return { card: cardName, kind: 'OK', detail: `resolved through the DOM (${i} steps)`, trace }
      }
      return { card: cardName, kind: 'NO_AFFORDANCE', detail: `flow ended idle but "${cardName}" is still in hand — cast never took`, trace }
    }

    // CHOICE_PARITY: cross-check the enumerable decision surfaces
    const ec = engineChoiceCount(state, me)
    if (ec) {
      const dom = domChoiceCount(ec.kind, root)
      if (dom >= 0 && dom !== ec.engine) {
        return {
          card: cardName,
          kind: 'CHOICE_PARITY',
          detail: `${ec.kind}: engine offers ${ec.engine} choice(s) but the DOM renders ${dom} enabled affordance(s)`,
          trace,
        }
      }
    }
    // CHOICE_PARITY (client mode): a summonRegion banner must render exactly one
    // button per engine-legal region for the square just clicked (Submerge/Burrowing).
    // This is the historical "submerge bug" surface — the client once rendered only
    // regions[0]. We compare against validateSummonAt on the FIRST multi-region square.
    const srBanner = root.querySelector('[data-modebanner="summonRegion"]')
    if (srBanner) {
      const engRegs = summonRegionsForCard(state, me, cardName)
      const domRegs = srBanner.querySelectorAll('[data-choice]:not([disabled])').length
      if (engRegs.length > 0 && domRegs !== engRegs.length) {
        return {
          card: cardName,
          kind: 'CHOICE_PARITY',
          detail: `summonRegion: engine allows ${engRegs.length} region(s) [${engRegs.join(',')}] but the DOM renders ${domRegs} button(s)`,
          trace,
        }
      }
    }

    // CHOICE_PARITY (client mode): a chooseCaster banner must render EXACTLY the
    // engine's legal-caster set. The client computes it via canCast per controlled
    // unit; the driver recomputes the same set independently and compares to the
    // rendered candidate chips (data-target="1" unit chips). This guards the picker
    // against silently auto-picking or under/over-rendering casters.
    const ccBanner = root.querySelector('[data-modebanner="chooseCaster"]')
    if (ccBanner) {
      const cid = cardId ? cardId : handIdOf(state, cardName)
      const engCasters = cid ? legalCasterSet(state, me, cid) : []
      const domCasters = root.querySelectorAll('[data-target="1"][data-unit]').length
      if (engCasters.length !== domCasters) {
        return {
          card: cardName,
          kind: 'CHOICE_PARITY',
          detail: `chooseCaster: engine has ${engCasters.length} legal caster(s) but the DOM renders ${domCasters} candidate chip(s)`,
          trace,
        }
      }
    }

    // pending input: collect affordances (pass summon square hint for genesis sorting)
    const aff = collectAffordances(root, lastSummonSq ?? undefined)
    // Filter out unit-target affordances that were tried and rejected in a prior
    // magic-mode re-entry cycle (triedUnitEls tracks rejected unit elements by
    // data-unit id so the driver picks a fresh target after re-clicking the hand card).
    // We also match by data-unit attribute because DOM elements are recreated on rerender.
    const triedUnitIds = new Set<string>()
    for (const el of triedUnitEls) {
      const uid = el.getAttribute('data-unit')
      if (uid) triedUnitIds.add(uid)
    }
    const filteredAff = (triedUnitIds.size > 0
      ? aff.filter((a) => {
          if (a.kind !== 'unit-target') return true
          const uid = a.el.getAttribute('data-unit')
          return !uid || !triedUnitIds.has(uid)
        })
      : aff
    ).filter((a) => {
      // in the caster picker, skip casters we already tried and backtracked from
      if (a.kind !== 'caster') return true
      const uid = a.el.getAttribute('data-unit')
      return !uid || !triedCasterIds.has(uid)
    })
    const realPicks = filteredAff.filter((a) => !a.skip)
    // A deprioritised avatar target chip (unit-target, skip=true) is still a LEGAL pick —
    // some spells' only in-range target IS an enemy Avatar (Chain Lightning nearby, Kiss
    // of Judas, Archangel Raphael). Use it as a last resort before declaring the surface
    // empty, so avatar deprioritisation only reorders picks, never removes them.
    const avatarPicks = filteredAff.filter((a) => a.skip && a.kind === 'unit-target')
    // caster backtracking: a caster we picked led into a flow with no legal move
    // (e.g. picked the far avatar for a 'here' spell). If the card is still in hand
    // and another legal caster is untried, cancel back and pick the next one. This
    // keeps the avatar-preferred default while still completing range-anchored casts.
    if (realPicks.length === 0 && avatarPicks.length === 0 && lastCasterPicked &&
        stillHolding(state, cardName, handBefore)) {
      const engCasters = cardId ? legalCasterSet(state, me, cardId) : []
      triedCasterIds.add(lastCasterPicked)
      const nextCaster = engCasters.find((c) => !triedCasterIds.has(c))
      const cancelBtn = root.querySelector('[data-cancel="1"]') as HTMLButtonElement | null
      if (nextCaster && cancelBtn) {
        trace.push(`[caster-backtrack] ${lastCasterPicked} dead-ended; try next caster`)
        harness.click(cancelBtn) // back to idle
        harness.rerender()
        const handAgain = root.querySelector(`[data-hand][data-card="${cssEscape(cardName)}"]`)
        if (handAgain && handAgain.getAttribute('data-disabled') !== '1') {
          harness.click(handAgain) // re-open the picker (tried caster now filtered out)
          harness.rerender()
          lastCasterPicked = null
          // targets rejected under the OLD caster may be legal under the new one
          // (Kiss of Death's 'here' Foot Soldier is out of range for the avatar but
          // in range for the co-located Undead) — forget them so they can be retried.
          triedUnitEls.clear()
          reentryCount = 0
          driftBaseline = harness.drifts.length
          continue
        }
      }
    }
    if (filteredAff.length === 0 || (realPicks.length === 0 && avatarPicks.length === 0 && need.pending && state.prompts.length > 0)) {
      // a prompt is pending but only cancel/skip (or nothing) is available — treat a
      // truly empty surface as NO_AFFORDANCE. (A pure mode banner with only a cancel
      // is a client-mode dead-end, also NO_AFFORDANCE.)
      if (realPicks.length === 0 && avatarPicks.length === 0) {
        return { card: cardName, kind: 'NO_AFFORDANCE', detail: `engine/UI waiting (${need.reason}) but NO real affordance in the DOM`, trace }
      }
    }

    // Multi-select prompt boxes (chooseCards / orderCards / allocateDamage) need N
    // toggle clicks THEN a confirm. If an enabled confirm sits inside such a box and
    // we've already toggled the required selection there, click confirm instead of
    // re-toggling the first choice forever. `selCount` tracks toggles on this prompt.
    const multiBox = root.querySelector(
      '[data-promptbox="chooseCards"],[data-promptbox="orderCards"],[data-promptbox="allocateDamage"]',
    )
    if (multiBox && state.prompts[0]) {
      const promptId = state.prompts[0].id
      if (lastMultiPrompt !== promptId) { lastMultiPrompt = promptId; multiSelected = 0 }
      const nSel = multiSelectNeeded(state)
      const confirm = multiBox.querySelector('[data-confirm="1"]') as HTMLButtonElement | null
      if (multiSelected >= nSel && confirm && !confirm.disabled) {
        trace.push(`[multi] confirm (${multiSelected}/${nSel})`)
        harness.click(confirm)
        continue
      }
      // otherwise toggle the next unselected choice
      const choices = [...multiBox.querySelectorAll('[data-choice]:not(.selected)')]
      const c = choices[0] ?? multiBox.querySelector('[data-choice]')
      if (c) {
        trace.push(`[multi] select ${describe(c)} (${multiSelected + 1}/${nSel})`)
        multiSelected++
        harness.click(c)
        continue
      }
    }

    // loop-break: a recurring optional yes/no (Chaoswish's "copy Chaoswish?"
    // chain) would spin forever if we keep accepting. Accept once, then decline.
    const ynBox = root.querySelector('[data-promptbox="yesNo"]') as HTMLElement | null
    if (ynBox) {
      const title = ynBox.querySelector('h3')?.textContent ?? 'yesNo'
      const seen = yesNoAnswered.get(title) ?? 0
      yesNoAnswered.set(title, seen + 1)
      if (seen >= 1) {
        const no = [...ynBox.querySelectorAll('[data-choice]')].find((b) => b.getAttribute('data-choice') === 'false') as HTMLElement | null
        if (no) { trace.push(`[loop-break] decline repeated yesNo "${title}"`); harness.click(no); continue }
      }
    }

    // prefer a real pick; then a deprioritised avatar target (last-resort legal pick);
    // then a skip button. never click cancel.
    const pick = realPicks[0] ?? avatarPicks[0] ?? aff.find((a) => a.kind === 'skip') ?? null
    if (!pick) {
      return { card: cardName, kind: 'NO_AFFORDANCE', detail: `engine/UI waiting (${need.reason}) but only cancel available`, trace }
    }
    trace.push(`[${need.reason}] click ${pick.kind}${describe(pick.el)}`)
    // remember which caster we picked so we can backtrack if the flow dead-ends
    if (pick.kind === 'caster') lastCasterPicked = pick.el.getAttribute('data-unit')
    // track summon square for genesis proximity sorting
    if (pick.kind === 'square') {
      const sq = pick.el.getAttribute('data-sq')
      if (sq) {
        const [sx, sy] = sq.split(',').map(Number)
        if (!isNaN(sx) && !isNaN(sy)) lastSummonSq = { x: sx, y: sy }
      }
    }
    if (pick.kind === 'namecard-input') {
      // Try spell names first for free-text nameCard (Feast for Crows / Hyter Sprites
      // ask for spell names; 'Foot Soldier' is a Minion and would be rejected).
      // Try each candidate name from the datalist until confirm becomes enabled.
      const candidates = ['Zap!', 'Fireball', 'Blizzard', 'Accusation', 'Foot Soldier', 'Amazon Warriors']
      let accepted = false
      for (const name of candidates) {
        harness.type(pick.el as HTMLInputElement, name)
        harness.rerender()
        const confirm = root.querySelector('[data-promptbox="nameCard"] [data-confirm="1"]') as HTMLButtonElement | null
        if (confirm && !confirm.disabled) {
          harness.click(confirm)
          accepted = true
          break
        }
      }
      if (!accepted) {
        return { card: cardName, kind: 'NO_AFFORDANCE', detail: 'nameCard free-text: no name in candidate list was accepted by the engine', trace }
      }
    } else {
      harness.click(pick.el)
    }
  }

  return { card: cardName, kind: 'STUCK', detail: `budget ${budget} exhausted with affordances still cycling`, trace }
}

// ---- Chaos Twister blow-chain driver ----

/** Drive ONE step of the Chaos Twister blow chain if a blow banner is showing.
 *  Returns 'stepped' when it clicked a blow affordance, 'notblow' when no blow banner
 *  is present (the caller falls through to the generic driver). Mirrors the C.3 test's
 *  blowTarget→blowOrigin→blowDir→blowConfirm click chain. */
function driveChaosTwisterStep(harness: GameHarness, root: HTMLElement, trace: string[]): 'stepped' | 'notblow' {
  // blowConfirm first (deepest): click the Blow! confirm button.
  if (root.querySelector('[data-modebanner="blowConfirm"]')) {
    const confirm = root.querySelector('[data-modebanner="blowConfirm"] [data-confirm="1"]') as HTMLElement | null
    if (confirm) { trace.push('[blowConfirm] Blow!'); harness.click(confirm); return 'stepped' }
  }
  // blowDir: pick the first direction button.
  if (root.querySelector('[data-modebanner="blowDir"]')) {
    const dir = root.querySelector('[data-modebanner="blowDir"] [data-choice]') as HTMLElement | null
    if (dir) { trace.push(`[blowDir] ${dir.getAttribute('data-choice')}`); harness.click(dir); return 'stepped' }
  }
  // blowOrigin: every square is clickable in this mode — click the first highlighted one.
  if (root.querySelector('[data-modebanner="blowOrigin"]')) {
    const sq = root.querySelector('[data-clickable="1"][data-sq]') as HTMLElement | null
    if (sq) { trace.push(`[blowOrigin] ${sq.getAttribute('data-sq')}`); harness.click(sq); return 'stepped' }
  }
  // blowTarget: click the first non-avatar minion chip (the banner sets no data-target).
  if (root.querySelector('[data-modebanner="blowTarget"]')) {
    const chip = [...root.querySelectorAll('[data-unit]')]
      .find((el) => el.getAttribute('data-avatar') !== '1') as HTMLElement | undefined
    if (chip) { trace.push(`[blowTarget] ${chip.getAttribute('data-unitname')}`); harness.click(chip); return 'stepped' }
  }
  return 'notblow'
}

// ---- small helpers ----

function stillHolding(state: GameState, name: string, handBefore: number): boolean {
  const count = state.players[0].hand.filter((id) => state.cards[id]?.name === name).length
  return count > 0 && state.players[0].hand.length >= handBefore
}

/** how many toggle-selections the current multi-select prompt requires before its
 *  confirm should be pressed. chooseCards→pick, orderCards→all cards, allocate→0
 *  (allocation uses +/all rows handled elsewhere; confirm needs left===0). */
function multiSelectNeeded(state: GameState): number {
  const p = state.prompts[0]
  if (!p) return 1
  const d: any = p.data ?? {}
  if (p.kind === 'orderCards') return (d.cards ?? []).length
  if (p.kind === 'chooseCards') return d.pick ?? 1
  return 1
}

function handIdOf(state: GameState, name: string): string {
  return state.players[0].hand.find((id) => state.cards[id]?.name === name) ?? ''
}

function describe(el: Element): string {
  const sq = el.getAttribute('data-sq')
  if (sq) return `(sq ${sq})`
  const u = el.getAttribute('data-unitname')
  if (u) return `(unit ${u})`
  const s = el.getAttribute('data-sitename')
  if (s) return `(site ${s})`
  const c = el.getAttribute('data-choice')
  if (c != null) return `(choice ${c})`
  return ''
}

/** minimal CSS attribute-value escape for card names with quotes/specials. */
function cssEscape(v: string): string {
  return v.replace(/["\\]/g, '\\$&')
}

// ---- oracle: can the engine play this card at all on the standard board? ----

/** Brute-force oracle identical to audit_playable's engineCanPlay. Returns true if
 *  ANY action shape lets the engine accept this card on the board() scaffold. This
 *  is used by the sweep to classify cards the engine itself cannot play on the
 *  generic board as 'inconclusive' (board-dependent) rather than failures. */
export function engineCanPlay(name: string, type: string): boolean {
  const g0 = sharedBoard()
  // For engine check we use inject (fzc prefix) — we're probing the engine, not the DOM
  const cardId0 = sharedCinject(g0, 0, name)
  const caster = g0.players[0].avatarUnitId
  const uIds = Object.keys(g0.units)
  const sIds = Object.keys(g0.sites)
  const shapes: any[] = []
  if (type === 'Site') {
    for (const sq of ALL_SQUARES)
      shapes.push({ t: 'avatarSite', mode: 'play', cardId: '', x: sq.x, y: sq.y })
  } else {
    const targetSets: any[] = [undefined, [], [uIds[0]], [uIds[1]], [sIds[0]], [uIds[0], uIds[1]], [uIds[0], sIds[0]], ['sq:2,2,surface']]
    const extras = [undefined, { direction: 'e' }, { giveTo: caster }]
    const ats: any[] = [undefined, ...ALL_SQUARES.map((s) => ({ ...s, region: 'surface' }))]
    for (const at of ats)
      for (const targets of targetSets)
        for (const extra of extras)
          shapes.push({ t: 'castSpell', cardId: '', casterId: caster, at, targets, extra })
  }
  for (const shape of shapes) {
    const g = sharedBoard()
    const cardId = sharedCinject(g, 0, name)
    const a = { ...shape, cardId, casterId: g.players[0].avatarUnitId }
    let res: any
    try { res = applyAction(g, 0, a as any) } catch { continue }
    if (res?.ok) return true
  }
  return false
}

/** The sweep/Phase-G board scaffold: sharedBoard() with fzu units stripped and three
 *  engine-valid u-prefix Foot Soldiers placed (ally at (1,1), enemies at (2,1)/(1,2)).
 *  A single source of truth so both the sweep and the oracle build the identical board. */
export function sweepBoardBase(): GameState {
  const g = sharedBoard()
  for (const id of Object.keys(g.units)) if (id.startsWith('fzu')) delete (g.units as any)[id]
  // Re-mint the scaffold's fzs-prefix sites with ENGINE-VALID s-prefix ids. The fake
  // fzs ids don't parse as site target refs (parseTargetRefs keys off the s/u/a prefix),
  // so a DOM click on such a site chip sends an unparseable target → the engine rejects
  // it as "Missing targets". A real game only ever has s-prefix sites, so this restores
  // the live invariant: every rendered site is a legal target-click.
  for (const [oldId, s] of Object.entries(g.sites)) {
    if (oldId.startsWith('s')) continue
    const nid = `s${g.nextId++}`
    g.sites[nid] = { ...(s as any), id: nid }
    delete (g.sites as any)[oldId]
  }
  sharedUsummon(g, 0, 'Foot Soldier', 1, 1)
  sharedUsummon(g, 1, 'Foot Soldier', 2, 1)
  sharedUsummon(g, 1, 'Foot Soldier', 1, 2)
  return g
}

/** Oracle for a card WITH a Phase-G setup: brute-force whether the engine accepts the
 *  card on sweepBoardBase()+setup. Enumerates caster (avatar + p0 minions), targets
 *  (real u/s/a ids + sq refs, up to triples), region, and direction — the same action
 *  shapes the DOM driver can produce. Returns true if ANY shape is accepted. */
export function engineCanPlayOn(name: string, type: string, setup: (g: GameState) => void): boolean {
  const g0 = sweepBoardBase(); setup(g0)
  const p0Casters = [g0.players[0].avatarUnitId, ...Object.keys(g0.units).filter((id) => id.startsWith('u') && g0.units[id]?.controller === 0)]
  const uIds = Object.keys(g0.units).filter((k) => k.startsWith('u'))
  const sIds = Object.keys(g0.sites).filter((k) => k.startsWith('s'))
  const aIds = Object.keys(g0.artifacts).filter((k) => k.startsWith('a'))
  const shapes: any[] = []
  if (type === 'Site') {
    for (const sq of ALL_SQUARES) shapes.push({ t: 'avatarSite', mode: 'play', x: sq.x, y: sq.y })
  } else if (type === 'Minion') {
    for (const sq of ALL_SQUARES)
      for (const region of ['surface', 'underground', 'underwater', 'void']) {
        shapes.push({ t: 'castSpell', casterId: p0Casters[0], at: { ...sq, region } })
        for (const t of uIds) shapes.push({ t: 'castSpell', casterId: p0Casters[0], at: { ...sq, region }, targets: [t] })
      }
  } else {
    // Magic: enumerate object ids + EVERY square ref (Blink/Flanking target squares) as
    // single/pair/triple target sets, across every p0 caster and cast direction. Prompt-
    // driven spells (targeted:false) are accepted with their full up-front target set, so
    // the oracle proves them exactly as the DOM driver reaches them.
    const sqRefs = ALL_SQUARES.map((s) => `sq:${s.x},${s.y},surface`)
    const single = [...uIds, ...sIds, ...aIds, ...sqRefs]
    const targetSets: any[] = [undefined, []]
    for (const a of single) targetSets.push([a])
    for (const a of single) for (const b of single) if (a !== b) targetSets.push([a, b])
    // triples only over sites (Meteor Shower is the sole 3-target card, all sites)
    for (const a of sIds) for (const b of sIds) for (const c of sIds) if (a !== b && b !== c && a !== c) targetSets.push([a, b, c])
    // Magic casts don't take an `at` square (that's for minions/sites); the direction
    // extra covers projectile/area spells. Cheap shapes (no direction) are enqueued first
    // so the common case returns immediately.
    const extras = [undefined, { direction: 'e' }, { direction: 'n' }, { direction: 's' }, { direction: 'w' }]
    for (const cst of p0Casters)
      for (const extra of extras) for (const targets of targetSets)
        shapes.push({ t: 'castSpell', casterId: cst, targets, extra })
  }
  for (const shape of shapes) {
    const g = sweepBoardBase(); setup(g)
    const cardId = sharedCinject(g, 0, name)
    const a = { ...shape, cardId }
    let res: any
    try { res = applyAction(g, 0, a as any) } catch { continue }
    if (res?.ok) return true
  }
  return false
}

// re-exported for negative-control specs that need the engine helpers
export { planCast, findPath, getScript, ALL_SQUARES }
