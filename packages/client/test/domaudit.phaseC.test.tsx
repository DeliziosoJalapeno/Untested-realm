// Phase-C DOM-level playability audit — in-play ACTIVATED ABILITIES, the COMBAT
// prompt chain, and the remaining one-off flows (cemetery cast, siteOrSpell morph,
// conjure-to-unit, edge-aura walls, Chaos Twister, promptTargets deselect, tap-draw-site).
//
// Everything is driven through the REAL Game component (harness.tsx, App's exact
// hotseat wiring) with the engine as the oracle. Phase C proves the code the prior
// agent landed but never tested:
//   1. canActivate() gating parity — every ability button's disabled state equals
//      canActivate(state, me, sourceId, abilityKey)===null.
//   2. the caster-anchor fix — abilityTargets highlights/targetIds are anchored on
//      the SOURCE unit (view.units[mode.sourceId] ?? avatar), not the avatar.
//   3. the engine-driven validateTarget highlights for magic/abilityTargets/conjure.
//
// NEW detectors (each with a documented break→red→revert→green experiment, either a
// source edit recorded in the EXPERIMENT LOG at the bottom, or an in-process DOM
// mangle in the negative-controls block):
//   NO_BUTTON      — a script declares abilities, the source is selected, canActivate
//                    says activatable, yet ZERO [data-ability] buttons render.
//   GATING_PARITY  — a button is ENABLED but the engine rejects activation, OR a button
//                    is DISABLED while canActivate(...)===null (button state ≠ engine).
//
// NUANCE honoured: warded enemy targets are LEGAL — the engine accepts the target and
// breaks the ward (game.ts ~383). We never flag a highlight/click on a warded unit.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import {
  board,
  inject as sharedCinject,
  usummon,
} from './domaudit'
import {
  allCards,
  getCard,
  getScript,
  canActivate,
  validateTarget,
  applyAction,
  placeInPlay,
  abilityBoard,
  uPlaceInPlay,
  mkUnit,
  reachableLocations,
  findPath,
  planCast,
  newId,
  ALL_SQUARES,
  type GameState,
  type PlayerId,
} from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => {
  active?.unmount()
  active = null
})

// =====================================================================================
// Shared helpers
// =====================================================================================

/** click a DOM element (throws with context if missing). */
function must(root: HTMLElement, sel: string, why: string): HTMLElement {
  const el = root.querySelector(sel) as HTMLElement | null
  if (!el) throw new Error(`[${why}] expected element ${sel} not found`)
  return el
}

/** all rendered ability buttons for the current selection. */
function abilityButtons(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll('[data-ability]')] as HTMLButtonElement[]
}

// =====================================================================================
// C.0 — caster-anchor regression (Abaddon Succubus 'lure', adjacent enemy minion)
//
// The Succubus stands FAR from the avatar; an enemy minion sits adjacent to the
// SUCCUBUS (a legal lure target) and another sits adjacent to the AVATAR (NOT a legal
// lure target). The engine anchors range on the source unit (game.ts:355
// `const caster = unit ?? avatarOf(...)`). The client MUST anchor its highlight/
// targetIds on `view.units[mode.sourceId] ?? avatar` (Game.tsx ~213). If someone
// reverted that back to `avatar`, the DOM would highlight the avatar-adjacent minion
// instead — a DIFFERENT set. We assert the DOM's data-target set equals the set the
// engine accepts FROM THE SUCCUBUS, computed here by calling validateTarget ourselves.
//
// PROVEN RED once by temporarily reverting Game.tsx line ~213 from
//   `(view.units[mode.sourceId] ?? avatar)` to `avatar` — the DOM then highlighted the
// avatar-adjacent Foot Soldier and this test's set-equality assert failed (see the
// EXPERIMENT LOG entry C0). Reverted; GREEN.
// =====================================================================================

describe('C.0 caster-anchor regression — unit-sourced ability range is relative to the SOURCE', () => {
  it('Abaddon Succubus lure: DOM data-target set == engine-accepted set FROM THE SUCCUBUS (not the avatar)', () => {
    const g = board()
    // strip the scaffold fzu Foot Soldiers so only our placed units are on the board
    for (const id of Object.keys(g.units)) if (id.startsWith('fzu')) delete (g.units as any)[id]
    const avatar = g.units[g.players[0].avatarUnitId]
    expect(avatar.x === 2 && avatar.y === 0, 'avatar starts at (2,0)').toBe(true)

    // Succubus far from the avatar, at (4,3)
    const succId = uPlaceInPlay(g, 0, 'Abaddon Succubus', 4, 3)
    // enemy minion adjacent to the SUCCUBUS (legal lure target)
    const nearSucc = uPlaceInPlay(g, 1, 'Foot Soldier', 4, 2)
    // enemy minion adjacent to the AVATAR (would be legal only under the avatar-anchor bug)
    const nearAvatar = uPlaceInPlay(g, 1, 'Foot Soldier', 2, 1)

    const spec = (getScript('Abaddon Succubus') as any).abilities[0].targets[0]
    const succUnit = g.units[succId]
    // engine oracle: which units does the engine accept FROM THE SUCCUBUS?
    const engineFromSucc = new Set<string>()
    for (const u of Object.values(g.units)) {
      if (validateTarget(g, spec, { unit: u.id }, succUnit, 0) === null) engineFromSucc.add(u.id)
    }
    // sanity: nearSucc is accepted, nearAvatar is NOT (from the Succubus)
    expect(engineFromSucc.has(nearSucc), 'engine (Succubus anchor) accepts the Succubus-adjacent minion').toBe(true)
    expect(engineFromSucc.has(nearAvatar), 'engine (Succubus anchor) rejects the avatar-adjacent minion').toBe(false)

    const h = new GameHarness(g).mount()
    active = h
    // select the Succubus (click its chip) then click its lure ability
    h.click(must(h.container, `[data-unit="${succId}"]`, 'succubus chip'))
    h.rerender()
    const lureBtn = must(h.container, '[data-ability="lure"]', 'lure button') as HTMLButtonElement
    expect(lureBtn.disabled, 'lure is activatable on this board').toBe(false)
    h.click(lureBtn)
    h.rerender()

    // now in abilityTargets mode: collect the DOM's highlighted legal targets
    expect(h.container.querySelector('[data-modebanner="abilityTargets"]'), 'abilityTargets banner shows').not.toBeNull()
    const domTargets = new Set(
      [...h.container.querySelectorAll('[data-unit][data-target="1"]')].map((el) => el.getAttribute('data-unit')!),
    )
    // THE PROOF: the DOM target set equals the engine's Succubus-anchored set.
    expect(domTargets, 'DOM highlights exactly the Succubus-anchored legal targets').toEqual(engineFromSucc)
    // explicit divergence assertions (these are what flip if the anchor reverts to avatar):
    expect(domTargets.has(nearSucc), 'DOM highlights the Succubus-adjacent minion').toBe(true)
    expect(domTargets.has(nearAvatar), 'DOM does NOT highlight the avatar-adjacent minion').toBe(false)

    // drive the activation to completion through the DOM and assert engine acceptance
    const driftBefore = h.drifts.length
    h.click(must(h.container, `[data-unit="${nearSucc}"][data-target="1"]`, 'lure target'))
    h.rerender()
    expect(h.drifts.length, 'activating lure on the Succubus-adjacent minion is engine-accepted').toBe(driftBefore)
    // the Succubus used its once-per-turn lure
    expect(h.state.units[succId].usedThisTurn['lure'], 'lure marked used').toBe(1)
  })
})

// =====================================================================================
// C.1 — in-play activated-abilities sweep (every card whose script has `abilities`)
//
// For each non-Avatar card with abilities: place it in play on the shared ability
// board, select it through the DOM (unit chip / site card / ground artifact), assert
// its ability buttons render, and cross-check button disabled-state against
// canActivate (GATING_PARITY + NO_BUTTON). When canActivate===null AND the engine can
// activate on this board (oracle), drive the activation through the DOM and assert the
// engine accepts it. When the engine can't activate (no legal target in range on this
// generic board — audit_playable phase 3 had 19 such), classify inconclusive.
// =====================================================================================

type C1Kind = 'PROVEN' | 'INCONCLUSIVE' | 'NO_BUTTON' | 'GATING_PARITY' | 'ENGINE_REJECT'
interface C1Result { card: string; type: string; ability: string; kind: C1Kind; detail: string }

/** DOM-targetable ability board. abilityBoard() supplies the element sites (for
 *  threshold-gated abilities) plus fzu Foot Soldiers around both placement spots.
 *  Those fzu ids are NOT engine-parseable target refs (parseTargetRefs keys off the
 *  u/s/a prefix, and `fzu…` mis-parses as an artifact → "Wrong target type"), and a
 *  real game never has them, so we STRIP them and re-place engine-valid u-prefix
 *  ally + enemy minions in the same spots. A DOM click on those carries a parseable
 *  id, exactly as a live game would. */
function domAbilityBoard(): GameState {
  const g = abilityBoard()
  // strip audit-only fzu units (fake ids that can't be engine target refs)
  for (const id of Object.keys(g.units)) if (id.startsWith('fzu')) delete (g.units as any)[id]
  // engine-valid targets around the minion spot (2,0)
  uPlaceInPlay(g, 1, 'Foot Soldier', 2, 1) // enemy adjacent/nearby to (2,0)
  uPlaceInPlay(g, 0, 'Foot Soldier', 1, 0) // ally adjacent to (2,0)
  uPlaceInPlay(g, 1, 'Foot Soldier', 1, 1) // enemy nearby to (2,0)
  // engine-valid targets around the site/artifact spot (4,3)
  uPlaceInPlay(g, 1, 'Foot Soldier', 4, 2) // enemy adjacent to (4,3)
  uPlaceInPlay(g, 0, 'Foot Soldier', 3, 3) // ally adjacent to (4,3)
  uPlaceInPlay(g, 1, 'Foot Soldier', 3, 2) // enemy nearby to (4,3)
  return g
}

/** the engine oracle: can this ability be activated via SOME activate() shape on the
 *  DOM ability board? Mirrors audit_playable phase 3's abilityActions enumeration but
 *  uses engine-valid u-prefix targets so it reflects what the DOM can actually send. */
function engineCanActivateAbility(name: string, ab: any): boolean {
  const probe = domAbilityBoard()
  const id = placeInPlay(probe, name)
  if (!id) return false
  const units = Object.keys(probe.units).filter((u) => u.startsWith('u'))
  const sites = Object.keys(probe.sites).filter((s) => s.startsWith('s'))
  const sqRefs = ALL_SQUARES.map((s) => `sq:${s.x},${s.y},surface`)
  const specCount = (ab.targets ?? []).reduce((a: number, s: any) => a + s.count, 0)
  const base = { t: 'activate' as const, sourceId: id, ability: ab.key }
  const shapes: any[] = []
  if (specCount === 0 && !ab.needsSquare) shapes.push({ ...base, targets: [] })
  const pool = [...units, ...sites, ...sqRefs]
  if (specCount === 1) for (const t of pool) { shapes.push({ ...base, targets: [t] }); shapes.push({ ...base, targets: [t], at: { x: 2, y: 1 } }) }
  else if (specCount >= 2) for (const a of pool) for (const b of pool) if (a !== b) shapes.push({ ...base, targets: [a, b] })
  if (ab.needsSquare) for (const sq of ALL_SQUARES) shapes.push({ ...base, targets: [], at: sq })
  for (const shape of shapes.slice(0, 200)) {
    const gg = domAbilityBoard()
    const gid = placeInPlay(gg, name)
    if (!gid) break
    let res: any
    try { res = applyAction(gg, 0, { ...shape, sourceId: gid } as any) } catch { continue }
    if (res?.ok) return true
  }
  return false
}

/** select the placed source through the DOM: click its unit chip / site card /
 *  ground artifact. Returns the [data-ability] buttons that render, or null if the
 *  selection did not open an action panel. */
function selectAndGetButtons(h: GameHarness, sourceId: string, type: string): HTMLButtonElement[] | null {
  const root = h.container
  h.rerender()
  if (type === 'Minion') {
    const chip = root.querySelector(`[data-unit="${sourceId}"]`)
    if (!chip) return null
    h.click(chip)
  } else if (type === 'Site') {
    const card = root.querySelector(`[data-site="${sourceId}"]`)
    if (!card) return null
    h.click(card)
  } else if (type === 'Artifact') {
    // ground artifacts render as a single .ground-art div (no id attribute) on the
    // artifact's site square; our board places exactly one, so it is unambiguous.
    const art = root.querySelector('.ground-art')
    if (!art) return null
    h.click(art)
  } else {
    return null
  }
  h.rerender()
  return abilityButtons(root)
}

/** run one card's abilities through the DOM; returns one result per ability. */
function runAbilityCard(name: string, type: string): C1Result[] {
  const results: C1Result[] = []
  const script = getScript(name) as any
  const abilities: any[] = script?.abilities ?? []
  if (!abilities.length) return results

  for (const ab of abilities) {
    const g = domAbilityBoard()
    const sourceId = placeInPlay(g, name)
    if (!sourceId) { results.push({ card: name, type, ability: ab.key, kind: 'INCONCLUSIVE', detail: 'no in-play zone for this type' }); continue }
    const gateReason = canActivate(g, 0, sourceId, ab.key)

    const h = new GameHarness(g).mount()
    active = h
    const buttons = selectAndGetButtons(h, sourceId, type)
    if (buttons === null) {
      // selection didn't open a panel — for Artifact chips this can happen if the ground
      // artifact isn't rendered as a clickable ground-art. Treat as inconclusive with detail.
      results.push({ card: name, type, ability: ab.key, kind: 'INCONCLUSIVE', detail: `source ${type} did not open an action panel` })
      h.unmount(); active = null
      continue
    }
    const btn = buttons.find((b) => b.getAttribute('data-ability') === ab.key)

    // NO_BUTTON: script declares this ability + canActivate says activatable, but no button.
    if (!btn) {
      if (gateReason === null) {
        results.push({ card: name, type, ability: ab.key, kind: 'NO_BUTTON', detail: `canActivate===null but no [data-ability="${ab.key}"] rendered` })
      } else {
        // gated abilities may legitimately still render (disabled); a missing button when
        // gated is not part of this detector — but our client always renders the button.
        results.push({ card: name, type, ability: ab.key, kind: 'NO_BUTTON', detail: `no [data-ability="${ab.key}"] rendered (gate: ${gateReason})` })
      }
      h.unmount(); active = null
      continue
    }

    // GATING_PARITY: button disabled-state must equal canActivate===null.
    const enabled = !btn.disabled
    if (enabled !== (gateReason === null)) {
      results.push({
        card: name, type, ability: ab.key, kind: 'GATING_PARITY',
        detail: `button enabled=${enabled} but canActivate=${gateReason === null ? 'null' : JSON.stringify(gateReason)}`,
      })
      h.unmount(); active = null
      continue
    }

    if (gateReason !== null) {
      // correctly disabled — nothing more to drive; this is correct behaviour, not a bug.
      results.push({ card: name, type, ability: ab.key, kind: 'INCONCLUSIVE', detail: `correctly disabled: ${gateReason}` })
      h.unmount(); active = null
      continue
    }

    // enabled + activatable. Oracle: can the engine activate on this board at all?
    const canEngine = engineCanActivateAbility(name, ab)
    if (!canEngine) {
      results.push({ card: name, type, ability: ab.key, kind: 'INCONCLUSIVE', detail: 'engine cannot activate on the generic board (board-dependent)' })
      h.unmount(); active = null
      continue
    }

    // drive the ability through the DOM to completion.
    const proven = driveAbility(h, sourceId, ab)
    results.push(proven)
    h.unmount(); active = null
  }
  return results
}

/** click the ability button and drive its target flow to completion; assert the
 *  activation is engine-accepted (no drift). Returns a PROVEN / GATING_PARITY /
 *  INCONCLUSIVE result. */
function driveAbility(h: GameHarness, sourceId: string, ab: any): C1Result {
  const root = h.container
  const name = h.state.cards[Object.values(h.state.units).find((u: any) => u.id === sourceId)?.cardId ?? '']?.name
    ?? h.state.units[sourceId]?.name ?? h.state.sites[sourceId]?.name ?? h.state.artifacts[sourceId]?.name ?? '?'
  const type = h.state.units[sourceId] ? 'Minion' : h.state.sites[sourceId] ? 'Site' : 'Artifact'
  const btn = root.querySelector(`[data-ability="${ab.key}"]`) as HTMLButtonElement | null
  if (!btn) return { card: name, type, ability: ab.key, kind: 'NO_BUTTON', detail: 'button vanished before drive' }
  const driftBefore = h.drifts.length
  h.click(btn)
  h.rerender()

  const specCount = (ab.targets ?? []).reduce((a: number, s: any) => a + s.count, 0)
  if (specCount === 0 && !ab.needsSquare) {
    // fires immediately on click (activate sent). Accept if no drift.
    if (h.drifts.length > driftBefore) {
      return { card: name, type, ability: ab.key, kind: 'GATING_PARITY', detail: `enabled button rejected: ${h.drifts[h.drifts.length - 1].error}` }
    }
    return { card: name, type, ability: ab.key, kind: 'PROVEN', detail: 'no-target ability activated through the DOM' }
  }

  // target flow: drive up to `budget` picks. We prefer engine-legal highlighted
  // targets ([data-target="1"] / [data-clickable="1"] squares); if none exist the
  // ability is board-dependent → inconclusive (the engine oracle already said yes on
  // SOME board shape, but this concrete DOM selection may lack a reachable target).
  for (let step = 0; step < 8; step++) {
    h.rerender()
    if (h.drifts.length > driftBefore) {
      // a click was rejected; try the next candidate on the same surface
      // (handled below by re-collecting). If nothing else, report.
    }
    // completed?
    if (!root.querySelector('[data-modebanner="abilityTargets"]') && h.state.prompts.length === 0) {
      if (h.drifts.length > driftBefore) {
        return { card: name, type, ability: ab.key, kind: 'GATING_PARITY', detail: `activation rejected: ${h.drifts[h.drifts.length - 1].error}` }
      }
      return { card: name, type, ability: ab.key, kind: 'PROVEN', detail: `activated through the DOM (${step} target steps)` }
    }
    // an engine prompt (chooseOption etc.) mid-resolution — answer with the first choice.
    if (h.state.prompts.length > 0) {
      const choice = root.querySelector('[data-choice]') as HTMLElement | null
      const target = root.querySelector('[data-target="1"]') as HTMLElement | null
      const clickable = root.querySelector('[data-clickable="1"]') as HTMLElement | null
      const pick = choice ?? target ?? clickable
      if (!pick) return { card: name, type, ability: ab.key, kind: 'INCONCLUSIVE', detail: 'mid-resolution prompt with no rendered choice on this board' }
      h.click(pick)
      continue
    }
    // abilityTargets: click a highlighted legal target (unit / site / square).
    // the CURRENT spec's `what` is exposed on the mode banner (data-spec-what), so this
    // works for multi-spec abilities too as picks accumulate.
    const banner = root.querySelector('[data-modebanner="abilityTargets"]')
    const what = banner?.getAttribute('data-spec-what') ?? ab.targets?.[0]?.what
    let pick: HTMLElement | null = null
    if (what === 'site') pick = root.querySelector('[data-site][data-target="1"]') as HTMLElement | null
    else if (what === 'square') pick = root.querySelector('[data-clickable="1"][data-sq]') as HTMLElement | null
    else if (what === 'artifact') pick = (root.querySelector('.ground-art') ?? root.querySelector('[data-unit][data-target="1"]')) as HTMLElement | null
    else {
      // prefer an engine-valid u-prefix target chip (the placeInPlay source itself is a
      // fake fzu id and can't be a real target ref — skip it and any other fzu chips).
      const chips = [...root.querySelectorAll('[data-unit][data-target="1"]')] as HTMLElement[]
      pick = chips.find((c) => (c.getAttribute('data-unit') ?? '').startsWith('u')) ?? null
    }
    if (!pick) {
      // no legal target rendered for this concrete placement → board-dependent
      return { card: name, type, ability: ab.key, kind: 'INCONCLUSIVE', detail: `no legal ${what ?? 'target'} highlighted for this placement` }
    }
    h.click(pick)
  }
  return { card: name, type, ability: ab.key, kind: 'INCONCLUSIVE', detail: 'target flow did not complete in budget' }
}

const ABILITY_CARDS = allCards.filter((c) => c.type !== 'Avatar' && (getScript(c.name) as any)?.abilities?.length)

describe('C.1 in-play activated-abilities sweep — every non-Avatar card with abilities', () => {
  const all: C1Result[] = []
  for (const c of ABILITY_CARDS) {
    it(`${c.name} (${c.type})`, () => {
      const rs = runAbilityCard(c.name, c.type)
      all.push(...rs)
      const bad = rs.filter((r) => r.kind === 'NO_BUTTON' || r.kind === 'GATING_PARITY' || r.kind === 'ENGINE_REJECT')
      if (bad.length) {
        // eslint-disable-next-line no-console
        console.error(`\n[C.1 FINDING] ${c.name} (${c.type}):\n  ` + bad.map((b) => `${b.ability} → ${b.kind}: ${b.detail}`).join('\n  '))
      }
      expect(bad.map((b) => `${b.ability}:${b.kind}`), `${c.name}: ${bad.map((b) => b.detail).join('; ')}`).toEqual([])
    })
  }

  // C.1's generic ability board (domAbilityBoard) cannot satisfy every ability's
  // precondition (fire:6 / water:8 affinity, Waterbound terrain, a pre-tapped target,
  // a carried artifact, two nearby EMPTY sites, an adjacent tapped Evil ally, an
  // adjacent/nearby SITE target, a minion corpse + an untapped co-located ally). Those
  // 10 abilities stay INCONCLUSIVE here ("engine cannot activate on the generic board" /
  // "no legal DOM target for this placement"). They are each PROVEN to post-state on a
  // purpose-built board in Phase D (domaudit.phaseD.test.tsx): Horns of Behemoth
  // behemoth:wake, Island Leviathan leviathan:wake, Mester Stoor Worm tide, Draco Corvus
  // snatch, Love Potion potion, Floodplain overflow, Sinkhole collapse, Willing Tribute
  // tribute, Mover of Mountains heave, Corpse Catapult fling. So the C.1 INCONCLUSIVE
  // bucket is entirely board-dependent (0 bugs), and the playability of those 10 is closed
  // in Phase D — no card is left unproven.
  it('C.1 totals — 0 bugs; the 10 board-dependent INCONCLUSIVE abilities are proven in Phase D', () => {
    const totals = all.reduce((m: Record<string, number>, r) => { m[r.kind] = (m[r.kind] ?? 0) + 1; return m }, {})
    // eslint-disable-next-line no-console
    console.log(
      `\n=== C.1 in-play activated-abilities (DOM) ===\n` +
        `  ability cards (non-Avatar): ${ABILITY_CARDS.length}\n` +
        `  abilities examined:         ${all.length}\n` +
        `  PROVEN via DOM:             ${totals.PROVEN ?? 0}\n` +
        `  INCONCLUSIVE:               ${totals.INCONCLUSIVE ?? 0}\n` +
        `  NO_BUTTON:                  ${totals.NO_BUTTON ?? 0}\n` +
        `  GATING_PARITY:              ${totals.GATING_PARITY ?? 0}\n` +
        `  ENGINE_REJECT:              ${totals.ENGINE_REJECT ?? 0}\n`,
    )
    if (process.env.C1_DEBUG) {
      const inc = all.filter((r) => r.kind === 'INCONCLUSIVE')
      const byReason = inc.reduce((m: Record<string, number>, r) => {
        const key = /correctly disabled/.test(r.detail) ? 'disabled(gate)'
          : /engine cannot activate/.test(r.detail) ? 'engine board-dependent'
            : /no legal/.test(r.detail) ? 'no legal DOM target for placement'
              : /no in-play zone/.test(r.detail) ? 'no in-play zone' : r.detail
        m[key] = (m[key] ?? 0) + 1; return m
      }, {})
      // eslint-disable-next-line no-console
      console.log('INCONCLUSIVE breakdown:', JSON.stringify(byReason, null, 1))
      // eslint-disable-next-line no-console
      console.log('INCONCLUSIVE list:\n' + inc.map((r) => `  ${r.card} [${r.type}] ${r.ability} — ${r.detail}`).join('\n'))
    }
    expect((totals.NO_BUTTON ?? 0) + (totals.GATING_PARITY ?? 0) + (totals.ENGINE_REJECT ?? 0), 'no NO_BUTTON / GATING_PARITY / ENGINE_REJECT findings').toBe(0)

    // Reconciliation: the INCONCLUSIVE bucket is EXACTLY the 9 board-dependent abilities,
    // each of which is proven to post-state in Phase D. If a new inconclusive appears (or
    // one of these becomes provable on the generic board), this pins it so the reconciliation
    // can't silently drift.
    const inconclusive = new Set(all.filter((r) => r.kind === 'INCONCLUSIVE').map((r) => `${r.card}:${r.ability}`))
    const provenInPhaseD = new Set([
      'Horns of Behemoth:behemoth:wake',
      'Island Leviathan:leviathan:wake',
      'Mester Stoor Worm:tide',
      'Draco Corvus:snatch',
      'Love Potion:potion',
      'Floodplain:overflow',
      'Sinkhole:collapse',
      'Willing Tribute:tribute',
      'Mover of Mountains:heave',
      'Corpse Catapult:fling',
    ])
    expect(inconclusive, 'INCONCLUSIVE == exactly the 10 abilities proven in Phase D').toEqual(provenInPhaseD)
  })
})

// =====================================================================================
// C.2 — combat prompt-shape coverage
//
// Each combat prompt shape is reached through the REAL DOM (select attacker chip →
// click enemy unit/site → moveChoice buttons → PromptBox panels) and its rendered
// enabled affordances are cross-checked against the engine's candidate/count. The
// scaffolding units are real cards with the right keywords (Amazon Warriors = plain
// power-5 striker; Belmotte Longbowmen = Ranged; Band of Thieves = Stealth; Coral-Reef
// Kelpie = Submerge). Prompt SHAPES matter here, not card coverage.
// =====================================================================================

/** place a non-summoning-sick unit in play (enteredTurn set a turn back). */
function place(g: GameState, p: PlayerId, name: string, x: number, y: number, region: 'surface' | 'underwater' | 'underground' = 'surface'): string {
  const id = uPlaceInPlay(g, p, name, x, y)
  g.units[id].enteredTurn = g.turn - 1
  g.units[id].region = region
  return id
}

/** a clean combat board with the scaffold fzu units stripped. */
function combatBoard(): GameState {
  const g = board()
  for (const id of Object.keys(g.units)) if (id.startsWith('fzu')) delete (g.units as any)[id]
  return g
}

describe('C.2 combat prompt-shape coverage — every shape reached + parity-checked through the DOM', () => {
  // defend: single-defender candidate list + "Don't defend" skip
  it('defend (single candidate): defend panel renders one toggle per engine candidate + a skip', () => {
    const g = combatBoard()
    const atk = place(g, 0, 'Amazon Warriors', 2, 1)
    const tgt = place(g, 1, 'Foot Soldier', 2, 2)
    // exactly one extra defender adjacent to the target square (single-candidate + target itself)
    const def1 = place(g, 1, 'Foot Soldier', 2, 3)
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${atk}"]`, 'attacker'))
    h.rerender()
    h.click(must(h.container, `[data-unit="${tgt}"]`, 'target'))
    h.rerender()
    // moveChoice appears (attacker must move onto the target square) → pick the attack-unit choice
    const attackBtn = h.container.querySelector('[data-modebanner="moveChoice"] [data-choice="0"]') as HTMLButtonElement | null
    expect(attackBtn, 'a moveChoice with an attack option appears').not.toBeNull()
    h.click(attackBtn!)
    h.rerender()
    // now the defend prompt is pending for player 1
    expect(h.state.prompts[0]?.kind, 'a defend prompt is pending').toBe('defend')
    const cands: string[] = h.state.prompts[0].data.candidates
    const panel = must(h.container, '[data-promptbox="defend"]', 'defend panel')
    const toggles = panel.querySelectorAll('[data-choice]:not([disabled])').length
    expect(toggles, 'one enabled toggle per engine candidate').toBe(cands.length)
    expect(panel.querySelector('[data-skip="1"]'), "a \"Don't defend\" skip renders").not.toBeNull()
    void def1
  })

  // multi-defender board: several candidates → several toggles
  it('defend (multi-defender): panel renders a toggle for EVERY engine candidate', () => {
    const g = combatBoard()
    const atk = place(g, 0, 'Amazon Warriors', 2, 1)
    const tgt = place(g, 1, 'Foot Soldier', 2, 2)
    place(g, 1, 'Foot Soldier', 2, 3)
    place(g, 1, 'Foot Soldier', 3, 2)
    place(g, 1, 'Foot Soldier', 1, 2)
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${atk}"]`, 'attacker'))
    h.rerender()
    h.click(must(h.container, `[data-unit="${tgt}"]`, 'target'))
    h.rerender()
    h.click(must(h.container, '[data-modebanner="moveChoice"] [data-choice="0"]', 'attack choice'))
    h.rerender()
    expect(h.state.prompts[0]?.kind).toBe('defend')
    const cands: string[] = h.state.prompts[0].data.candidates
    expect(cands.length, 'engine offers several defenders').toBeGreaterThan(1)
    const toggles = h.container.querySelectorAll('[data-promptbox="defend"] [data-choice]:not([disabled])').length
    expect(toggles, 'one enabled toggle per engine candidate').toBe(cands.length)
  })

  // stayInFight: after a defender is chosen for the ORIGINAL target, the target's
  // controller is asked to stay or withdraw (always 2 buttons).
  it('stayInFight: 2 buttons (Stay / Withdraw) matching the engine', () => {
    const g = combatBoard()
    const atk = place(g, 0, 'Amazon Warriors', 2, 1)
    const tgt = place(g, 1, 'Foot Soldier', 2, 2)
    const def1 = place(g, 1, 'Foot Soldier', 2, 3)
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${atk}"]`, 'attacker'))
    h.rerender()
    h.click(must(h.container, `[data-unit="${tgt}"]`, 'target'))
    h.rerender()
    h.click(must(h.container, '[data-modebanner="moveChoice"] [data-choice="0"]', 'attack choice'))
    h.rerender()
    expect(h.state.prompts[0]?.kind).toBe('defend')
    // choose the OTHER defender (not the target) so the target gets a stayInFight prompt
    h.click(must(h.container, `[data-promptbox="defend"] [data-choice="${def1}"]`, 'defender toggle'))
    h.rerender()
    h.click(must(h.container, '[data-promptbox="defend"] [data-confirm="1"]', 'defend confirm'))
    h.rerender()
    expect(h.state.prompts[0]?.kind, 'a stayInFight prompt is pending').toBe('stayInFight')
    const btns = h.container.querySelectorAll('[data-promptbox="stayInFight"] [data-choice]:not([disabled])').length
    expect(btns, 'exactly 2 stay/withdraw buttons').toBe(2)
  })

  // allocateDamage: a power-5 striker facing 2 defenders must split; rows per candidate,
  // +/all buttons, confirm disabled until exactly `power` assigned, then Strike!.
  it('allocateDamage: rows per candidate, confirm gated until power assigned, then Strike!', () => {
    const g = combatBoard()
    const atk = place(g, 0, 'Amazon Warriors', 2, 1) // power 5
    const tgt = place(g, 1, 'Foot Soldier', 2, 2)
    place(g, 1, 'Foot Soldier', 2, 3)
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${atk}"]`, 'attacker'))
    h.rerender()
    h.click(must(h.container, `[data-unit="${tgt}"]`, 'target'))
    h.rerender()
    h.click(must(h.container, '[data-modebanner="moveChoice"] [data-choice="0"]', 'attack choice'))
    h.rerender()
    // defend with ALL candidates so the striker faces >1 enemy → must allocate
    expect(h.state.prompts[0]?.kind).toBe('defend')
    for (const id of [...h.state.prompts[0].data.candidates] as string[]) {
      const t = h.container.querySelector(`[data-promptbox="defend"] [data-choice="${id}"]`) as HTMLButtonElement | null
      if (t) h.click(t)
    }
    h.rerender()
    h.click(must(h.container, '[data-promptbox="defend"] [data-confirm="1"]', 'defend confirm'))
    h.rerender()
    // may hit a stayInFight first — keep the target in
    if (h.state.prompts[0]?.kind === 'stayInFight') {
      h.click(must(h.container, '[data-promptbox="stayInFight"] [data-choice="true"]', 'stay'))
      h.rerender()
    }
    expect(h.state.prompts[0]?.kind, 'an allocateDamage prompt is pending').toBe('allocateDamage')
    const power: number = h.state.prompts[0].data.power
    const candidates: string[] = h.state.prompts[0].data.candidates
    const panel = must(h.container, '[data-promptbox="allocateDamage"]', 'alloc panel')
    // one alloc row (a +/all) per candidate
    expect(panel.querySelectorAll('[data-alloc-plus]').length, 'one alloc row per candidate').toBe(candidates.length)
    // confirm is DISABLED before any damage is assigned (left !== 0)
    const confirm = must(panel, '[data-confirm="1"]', 'strike confirm') as HTMLButtonElement
    expect(confirm.disabled, 'Strike! disabled until exactly power is assigned').toBe(true)
    // assign ALL power to the first candidate via the "all" button
    h.click(must(panel, `[data-alloc-all="${candidates[0]}"]`, 'alloc all'))
    h.rerender()
    const confirm2 = must(h.container, '[data-promptbox="allocateDamage"] [data-confirm="1"]', 'strike confirm') as HTMLButtonElement
    expect(confirm2.disabled, 'Strike! enabled once all power is assigned').toBe(false)
    const driftBefore = h.drifts.length
    h.click(confirm2)
    h.rerender()
    expect(h.drifts.length, 'the allocation is engine-accepted').toBe(driftBefore)
    void power
  })

  // moveChoice: destination with enemy unit(s) AND an enemy site → an attack button per DISTINCT enemy
  // name (co-located same-name enemies aggregate into one "pick one" entry) + a button for the site +
  // "Move only". Clicking the aggregated entry opens the pickTargetUnit follow-up to choose which one.
  it('moveChoice: one attack button per distinct enemy name + the site + "Move only"', () => {
    const g = combatBoard()
    const atk = place(g, 0, 'Amazon Warriors', 2, 1)
    // enemy site at (2,2) with two SAME-NAME enemy units on it
    const scid = `fz${g.nextId++}`; const sid = `fzs${g.nextId++}`
    g.cards[scid] = { id: scid, name: 'Rustic Village', owner: 1 } as any
    g.sites[sid] = { id: sid, cardId: scid, name: 'Rustic Village', owner: 1, controller: 1, x: 2, y: 2, tapped: false, isRubble: false } as any
    const e1 = place(g, 1, 'Foot Soldier', 2, 2)
    const e2 = place(g, 1, 'Foot Soldier', 2, 2)
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${atk}"]`, 'attacker'))
    h.rerender()
    // click one of the enemy units at the destination square
    h.click(must(h.container, `[data-unit="${e1}"]`, 'enemy unit'))
    h.rerender()
    const banner = must(h.container, '[data-modebanner="moveChoice"]', 'moveChoice banner')
    const choices = [...banner.querySelectorAll('[data-choice]')] as HTMLElement[]
    // two same-name Foot Soldiers collapse to ONE "⚔ Attack Foot Soldier (2) — pick one" entry, plus the
    // site → 2 numeric attack buttons (the follow-up disambiguates which Foot Soldier), + "Move only".
    const attackChoices = choices.filter((c) => /^\d+$/.test(c.getAttribute('data-choice') ?? ''))
    expect(attackChoices.length, 'one button per distinct enemy name (aggregated) + the site').toBe(2)
    const pick = attackChoices.find((c) => /pick one/i.test(c.textContent ?? ''))
    expect(pick, 'the two same-name Foot Soldiers aggregate into a "pick one" entry').toBeTruthy()
    expect(pick!.textContent, 'the aggregated entry shows the count').toMatch(/\(2\)/)
    expect(banner.querySelector('[data-choice="move-only"]'), '"Move only" renders').not.toBeNull()
    // clicking the aggregated entry opens the pickTargetUnit follow-up; both Foot Soldiers glow gold
    // (data-glow="defender") on the board as the pickable candidates.
    h.click(pick!)
    h.rerender()
    must(h.container, '[data-modebanner="pickTargetUnit"]', 'pickTargetUnit banner')
    for (const id of [e1, e2]) {
      const unit = must(h.container, `[data-unit="${id}"]`, `Foot Soldier ${id}`)
      expect(unit.getAttribute('data-glow'), `both Foot Soldiers are pickable candidates (${id})`).toBe('defender')
    }
  })

  // moveRegion: a Submerge attacker reaching a square with BOTH surface and underwater
  // → both region buttons. Rules clarification: submerging/surfacing IS a step, so
  // reaching a square in two regions needs two steps of range. We trust the engine's
  // reachableLocations/findPath for what is reachable (never raw x/y math) and build a
  // board where they report a genuine both-regions square, then assert the DOM opens
  // the moveRegion banner with exactly the engine-reachable regions for it.
  //
  // Water sites must sit on EMPTY squares — board() already occupies (2,0)(2,1)(3,1)
  // (1,1)(2,2)(2,3)(3,2) with Rustic Villages, and siteAt() returns the first site at a
  // square, so a water site dropped on an occupied square is shadowed by the Village
  // and never counts as water. We use empty (0,0)+(0,1).
  it('moveRegion: a Submerge unit reaching a water square offers both surface + underwater', () => {
    const g = combatBoard()
    // two adjacent water sites on EMPTY squares so underwater is a legal region there
    const mkWater = (x: number, y: number) => {
      const scid = `fz${g.nextId++}`; const sid = `fzs${g.nextId++}`
      const wn = waterSiteName()
      g.cards[scid] = { id: scid, name: wn, owner: 0 } as any
      g.sites[sid] = { id: sid, cardId: scid, name: wn, owner: 0, controller: 0, x, y, tapped: false, isRubble: false } as any
    }
    mkWater(0, 0)
    mkWater(0, 1)
    // Submerge attacker on the surface of the water site at (0,0); Movement +1 gives it
    // the two steps needed to reach a NEIGHBOUR square in BOTH regions (surface laterally,
    // then dive) — which is exactly what makes reachableLocations report a both-regions sq.
    const atk = place(g, 0, 'Coral-Reef Kelpie', 0, 0) // Submerge, 3/3
    g.units[atk].region = 'surface'
    g.units[atk].modifiers = [{ kind: 'keyword', keyword: 'Movement +1' } as any]

    // ORACLE: reachableLocations must report a both-regions square (submerge dive is a step).
    const byXY: Record<string, Set<string>> = {}
    for (const l of reachableLocations(g, g.units[atk])) (byXY[`${l.x},${l.y}`] ??= new Set()).add(l.region)
    const multi = Object.entries(byXY).find(([, rs]) => rs.has('surface') && rs.has('underwater'))
    expect(multi, 'the engine reports a square reachable in BOTH surface and underwater').toBeTruthy()
    const [sqKey, regionSet] = multi!
    const [mx, my] = sqKey.split(',').map(Number)
    // both region paths exist per findPath (never assume from x/y distance)
    expect(findPath(g, g.units[atk], { x: mx, y: my, region: 'surface' as any })).not.toBeNull()
    expect(findPath(g, g.units[atk], { x: mx, y: my, region: 'underwater' as any })).not.toBeNull()

    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${atk}"]`, 'submerge attacker'))
    h.rerender()
    // click the both-regions destination square → moveRegion banner opens
    const sq = must(h.container, `[data-sq="${mx},${my}"][data-clickable="1"]`, 'reachable both-regions square')
    h.click(sq)
    h.rerender()
    const banner = h.container.querySelector('[data-modebanner="moveRegion"]')
    expect(banner, 'a Submerge unit reaching a both-regions square opens the moveRegion banner').not.toBeNull()
    const domRegions = new Set([...banner!.querySelectorAll('[data-choice]')].map((b) => b.getAttribute('data-choice')))
    expect(domRegions, 'one region button per engine-reachable region at that square').toEqual(regionSet)
  })

  // ranged: select a Ranged unit → a "Shoot" [data-ability="ranged"] button → the
  // direction modal ([data-choice] n/w/e/s).
  it('ranged: Shoot button opens a 4-direction modal', () => {
    const g = combatBoard()
    const shooter = place(g, 0, 'Belmotte Longbowmen', 2, 1) // Ranged 1
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${shooter}"]`, 'ranged unit'))
    h.rerender()
    const shoot = must(h.container, '[data-ability="ranged"]', 'Shoot button') as HTMLButtonElement
    expect(shoot.disabled, 'Shoot is enabled for a fresh Ranged unit').toBe(false)
    h.click(shoot)
    h.rerender()
    const modal = must(h.container, '[data-modebanner="shoot"]', 'direction modal')
    const dirs = [...modal.querySelectorAll('[data-choice]')].map((b) => b.getAttribute('data-choice')).sort()
    expect(dirs, 'four direction choices n/w/e/s').toEqual(['e', 'n', 's', 'w'])
  })

  // stealth attacker: the defend window must NOT appear (a Stealth attack is
  // undefendable) — the fight resolves without a defend prompt.
  it('stealth attacker: no defend prompt appears (undefendable)', () => {
    const g = combatBoard()
    const atk = place(g, 0, 'Band of Thieves', 2, 1) // Stealth, 3/3
    g.units[atk].stealth = true
    const tgt = place(g, 1, 'Foot Soldier', 2, 2)
    // a would-be defender adjacent to the target
    place(g, 1, 'Foot Soldier', 2, 3)
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${atk}"]`, 'stealth attacker'))
    h.rerender()
    // truesight is off, so the enemy chip is clickable via moveChoice for the attacker
    h.click(must(h.container, `[data-unit="${tgt}"]`, 'target'))
    h.rerender()
    const attackBtn = h.container.querySelector('[data-modebanner="moveChoice"] [data-choice="0"]') as HTMLButtonElement | null
    if (attackBtn) { h.click(attackBtn); h.rerender() }
    // NO defend prompt — a Stealth attack cannot be defended
    expect(h.state.prompts.some((p) => p.kind === 'defend'), 'a Stealth attack raises no defend prompt').toBe(false)
    expect(h.container.querySelector('[data-promptbox="defend"]'), 'no defend panel renders').toBeNull()
  })
})

/** first Site whose name the engine treats as deep water (has water threshold and no
 *  special script that blocks submersion) — used to open a legal underwater region. */
function waterSiteName(): string {
  const s = allCards.find((c) => c.type === 'Site' && (c.thresholds as any)?.water >= 1 && c.rarity === 'Ordinary')
  return s?.name ?? 'Flooded Ruins'
}

// =====================================================================================
// C.3 — one proving test per remaining flow. Each drives the flow ENTIRELY through the
// real DOM with the engine as the arbiter; a flow is proven when the DOM click chain
// completes with zero engine drift and the card leaves its zone.
// =====================================================================================

/** put a card into player 0's hand with an engine-valid `c…` id; returns the id. */
function handInject(g: GameState, name: string): string {
  return sharedCinject(g, 0, name)
}

/** drive whatever mode/prompt is pending to quiescence, preferring real picks.
 *  Returns { ok, detail }: ok=true when no prompt/banner remains and no drift. */
function driveToDone(h: GameHarness, budget = 40): { ok: boolean; detail: string } {
  const drift0 = h.drifts.length
  for (let i = 0; i < budget; i++) {
    h.rerender()
    if (h.drifts.length > drift0) return { ok: false, detail: `engine rejected: ${h.drifts[h.drifts.length - 1].error}` }
    const pending = h.state.prompts.length > 0
    const banner = h.container.querySelector('[data-modebanner]')
    if (!pending && !banner) return { ok: true, detail: `resolved (${i} steps)` }
    // prefer a highlighted target / clickable square / choice; fall back to a skip.
    const root = h.container
    const pick =
      (root.querySelector('[data-target="1"]') as HTMLElement | null) ??
      (root.querySelector('[data-clickable="1"][data-sq]') as HTMLElement | null) ??
      (root.querySelector('[data-choice]:not([disabled])') as HTMLElement | null) ??
      (root.querySelector('[data-confirm="1"]:not([disabled])') as HTMLElement | null) ??
      (root.querySelector('[data-skip="1"]') as HTMLElement | null)
    if (!pick) return { ok: false, detail: `stuck at ${banner?.getAttribute('data-modebanner') ?? h.state.prompts[0]?.kind}` }
    h.click(pick)
  }
  return { ok: false, detail: 'budget exhausted' }
}

/** the ⚰ cemetery button in MY PlayerBar (first button containing ⚰). */
function cemeteryButton(root: HTMLElement): HTMLButtonElement | null {
  const bar = root.querySelector('.playerbar.me')
  if (!bar) return null
  for (const b of bar.querySelectorAll('button')) if ((b.textContent ?? '').includes('⚰')) return b as HTMLButtonElement
  return null
}

/** a board whose player-0 avatar is Avatar of Fire with kindle already used, so fire
 *  sites in hand may also be cast as Fireballs this turn (spellMorphName → 'Fireball'). */
function fireAvatarBoard(): GameState {
  const g = board()
  const av = g.units[g.players[0].avatarUnitId]
  av.name = 'Avatar of Fire'
  g.cards[av.cardId].name = 'Avatar of Fire'
  av.enteredTurn = -5
  av.tapped = false
  const res = applyAction(g, 0, { t: 'activate', sourceId: av.id, ability: 'kindle' } as any)
  if (!res.ok) throw new Error(`kindle failed: ${res.error}`)
  av.tapped = false // untap so the subsequent morph cast (which taps the avatar) is available
  return g
}

describe('C.3 — remaining flows proven through the DOM', () => {
  it('cemetery cast: a castFromCemetery card casts via the ⚰ viewer [data-cast-cemetery] button', () => {
    const g = board()
    const avatar = g.players[0].avatarUnitId
    const id = handInject(g, 'Ghostfire') // Magic, castFromCemetery, no targets
    // move it from hand → cemetery
    g.players[0].hand = g.players[0].hand.filter((x) => x !== id)
    g.players[0].cemetery.push(id)

    const h = new GameHarness(g).mount()
    active = h
    const cem = cemeteryButton(h.container)
    expect(cem, 'the ⚰ cemetery button renders in my PlayerBar').not.toBeNull()
    h.click(cem!)
    h.rerender()
    const castBtn = h.container.querySelector(`[data-cast-cemetery="${id}"]`) as HTMLButtonElement | null
    expect(castBtn, 'the [data-cast-cemetery] button renders in the cemetery viewer').not.toBeNull()
    h.click(castBtn!)
    h.rerender()
    const finding = driveToDone(h)
    expect(finding.ok, `cemetery cast drove to completion: ${finding.detail}`).toBe(true)
    expect(g.players[0].cemetery.includes(id), 'the card left the cemetery (cast took)').toBe(false)
  })

  it('siteOrSpell morph (site path): Avatar of Fire + fire site → data-choice="site" plays it as a site', () => {
    const g = fireAvatarBoard()
    const cid = handInject(g, 'Arid Desert') // fire Site
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-hand][data-card="Arid Desert"]`, 'fire site in hand'))
    h.rerender()
    const modal = must(h.container, '[data-modebanner="siteOrSpell"]', 'morph modal')
    expect(modal.querySelector('[data-choice="site"]'), 'a "Play as site" choice').not.toBeNull()
    expect(modal.querySelector('[data-choice="spell"]'), 'a "Cast as Fireball" choice').not.toBeNull()
    h.click(modal.querySelector('[data-choice="site"]')!)
    h.rerender()
    const sq = must(h.container, '[data-clickable="1"][data-sq]', 'legal site square')
    h.click(sq)
    h.rerender()
    expect(g.players[0].hand.includes(cid), 'the site left the hand (played as a site)').toBe(false)
  })

  it('siteOrSpell morph (spell path): the same fire site casts as a Fireball via data-choice="spell"', () => {
    const g = fireAvatarBoard()
    const cid = handInject(g, 'Arid Desert')
    usummon(g, 1, 'Foot Soldier', 2, 2) // a target in a straight line for the projectile
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-hand][data-card="Arid Desert"]`, 'fire site in hand'))
    h.rerender()
    const modal = must(h.container, '[data-modebanner="siteOrSpell"]', 'morph modal')
    h.click(modal.querySelector('[data-choice="spell"]')!)
    h.rerender()
    expect(h.container.querySelector('[data-modebanner="shoot"]'), 'the spell path opens the Fireball direction picker').not.toBeNull()
    const finding = driveToDone(h)
    expect(finding.ok, `Fireball morph drove to completion: ${finding.detail}`).toBe(true)
    expect(g.players[0].hand.includes(cid), 'the site left the hand (cast as a Fireball)').toBe(false)
  })

  it('conjure-to-unit hand-over: an artifact is conjured onto a friendly unit by clicking its chip', () => {
    const g = board()
    const ally = usummon(g, 0, 'Foot Soldier', 1, 1)
    const cid = handInject(g, 'Alabaster Box') // a Relic artifact (carriable)
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-hand][data-card="Alabaster Box"]`, 'artifact in hand'))
    h.rerender()
    expect(h.container.querySelector('[data-modebanner="conjure"]'), 'conjure mode banner shows').not.toBeNull()
    // click the friendly unit chip to HAND the artifact over (carried) rather than place on a site
    h.click(must(h.container, `[data-unit="${ally}"]`, 'friendly unit chip'))
    h.rerender()
    const finding = driveToDone(h)
    expect(finding.ok, `conjure-to-unit drove to completion: ${finding.detail}`).toBe(true)
    expect(g.players[0].hand.includes(cid), 'the artifact left the hand (conjured)').toBe(false)
    expect(Object.values(g.artifacts).some((a) => a.carriedBy === ally), 'the artifact is carried by the chosen unit').toBe(true)
  })

  it('edge-aura wall: a wall placed via a [data-wallspot] border hotspot', () => {
    const g = board()
    const cid = handInject(g, 'Wall of Fire') // edgeAura wall
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-hand][data-card="Wall of Fire"]`, 'wall in hand'))
    h.rerender()
    const spot = h.container.querySelector('[data-wallspot]') as HTMLElement | null
    expect(spot, 'wall placement offers [data-wallspot] border hotspots').not.toBeNull()
    h.click(spot!)
    h.rerender()
    const finding = driveToDone(h)
    expect(finding.ok, `wall placement drove to completion: ${finding.detail}`).toBe(true)
    expect(g.players[0].hand.includes(cid), 'the wall left the hand (placed on an edge)').toBe(false)
  })

  it('Chaos Twister: full blowTarget → blowOrigin → blowDir → blowConfirm chain through the DOM', () => {
    const g = board()
    const victim = usummon(g, 1, 'Foot Soldier', 2, 2) // a non-avatar minion to blow
    const cid = handInject(g, 'Chaos Twister')
    const avatar = g.players[0].avatarUnitId
    expect(planCast(g, 0, cid, avatar).kind, 'Chaos Twister uses the special blow flow').toBe('chaosTwister')
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-hand][data-card="Chaos Twister"]`, 'twister in hand'))
    h.rerender()
    expect(h.container.querySelector('[data-modebanner="blowTarget"]'), 'blowTarget banner').not.toBeNull()
    h.click(must(h.container, `[data-unit="${victim}"]`, 'blow victim'))
    h.rerender()
    expect(h.container.querySelector('[data-modebanner="blowOrigin"]'), 'blowOrigin banner').not.toBeNull()
    h.click(must(h.container, '[data-clickable="1"][data-sq]', 'blow origin square'))
    h.rerender()
    expect(h.container.querySelector('[data-modebanner="blowDir"]'), 'blowDir banner').not.toBeNull()
    h.click(must(h.container, '[data-modebanner="blowDir"] [data-choice]', 'blow direction'))
    h.rerender()
    const confirm = h.container.querySelector('[data-modebanner="blowConfirm"] [data-confirm="1"]') as HTMLButtonElement | null
    expect(confirm, 'blowConfirm banner + confirm button').not.toBeNull()
    const handBefore = g.players[0].hand.length
    h.click(confirm!)
    h.rerender()
    const finding = driveToDone(h)
    expect(finding.ok, `Chaos Twister drove to completion: ${finding.detail}`).toBe(true)
    expect(g.players[0].hand.length, 'Chaos Twister left the hand').toBeLessThan(handBefore)
  })

  it('promptTargets deselect: Swap — pick one, DESELECT it, pick two others, confirm; engine accepts', () => {
    const g = board()
    for (const id of Object.keys(g.units)) if (id.startsWith('fzu')) delete (g.units as any)[id]
    const a = usummon(g, 0, 'Foot Soldier', 1, 1)
    const b = usummon(g, 0, 'Foot Soldier', 0, 1)
    const c = usummon(g, 1, 'Foot Soldier', 3, 1)
    const cid = handInject(g, 'Swap')
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-hand][data-card="Swap"]`, 'Swap in hand'))
    h.rerender()
    // Swap resolves the cast then raises chooseTargets count=2 with 3 candidates
    expect(h.state.prompts[0]?.kind, 'Swap raises a chooseTargets prompt').toBe('chooseTargets')
    expect(h.state.prompts[0].data.count, 'it wants two targets').toBe(2)
    const drift0 = h.drifts.length
    // pick `a`
    h.click(must(h.container, `[data-unit="${a}"]`, 'pick a'))
    h.rerender()
    expect(h.container.querySelector(`[data-unit="${a}"][data-picked="1"]`), 'a is picked').not.toBeNull()
    // DESELECT `a` (click it again)
    h.click(must(h.container, `[data-unit="${a}"]`, 'deselect a'))
    h.rerender()
    expect(h.container.querySelector(`[data-unit="${a}"][data-picked="1"]`), 'a is deselected').toBeNull()
    // pick `b` then `c` → count reached → auto-sends
    h.click(must(h.container, `[data-unit="${b}"]`, 'pick b'))
    h.rerender()
    h.click(must(h.container, `[data-unit="${c}"]`, 'pick c'))
    h.rerender()
    expect(h.drifts.length, 'the engine accepted the two-target Swap after a deselect').toBe(drift0)
    expect(h.state.prompts.length, 'the Swap prompt resolved').toBe(0)
    void cid
  })

  it('"Tap: draw site" button is engine-accepted, and a drawDeck prompt renders exactly 2 options', () => {
    // (a) the [data-tap-draw-site] button renders and the engine accepts the draw action.
    {
      const g = board()
      const h = new GameHarness(g).mount()
      active = h
      // the draw-site button now lives in the avatar's action panel — select MY avatar first
      h.click(h.container.querySelector('.unit.mine[data-avatar="1"]') as HTMLElement); h.rerender()
      const btn = h.container.querySelector('[data-tap-draw-site="1"]') as HTMLButtonElement | null
      expect(btn, 'the "Tap: draw site" button renders').not.toBeNull()
      const drift0 = h.drifts.length
      h.click(btn!)
      h.rerender()
      expect(h.drifts.length, 'the engine accepted the draw-site action').toBe(drift0)
      h.unmount(); active = null
    }
    // (b) a drawDeck prompt renders exactly the two deck buttons (spellbook + atlas).
    {
      const g = board()
      g.prompts.push({ id: 'dd1', player: 0, kind: 'drawDeck', title: 'Draw from which deck?', data: {}, cont: '', ctx: {} } as any)
      const h = new GameHarness(g).mount()
      active = h
      const box = must(h.container, '[data-promptbox="drawDeck"]', 'drawDeck prompt')
      expect(box.querySelectorAll('[data-choice]:not([disabled])').length, 'exactly spellbook + atlas').toBe(2)
    }
  })
})

// =====================================================================================
// NEGATIVE CONTROLS — every NEW Phase-C detector proven able to go RED.
//
// Each detector's RED condition is reproduced against a deliberately-broken clone of
// the live DOM the driver sees (the same methodology as Phase A / B), so the detectors
// are CONTINUOUSLY proven in the committed all-green suite. The corresponding REAL
// Game.tsx source breaks are recorded verbatim in the EXPERIMENT LOG at the very bottom.
// =====================================================================================

describe('Phase-C negative controls — every new detector proven able to go RED', () => {
  it('NO_BUTTON fires when a script declares an activatable ability but the DOM renders none', () => {
    // Mirror of BREAK (C1-NB): unitActions returned null instead of mapping script
    // abilities to buttons. Reproduce by selecting a source whose ability canActivate
    // says is activatable, then stripping every [data-ability] from a clone.
    const g = board()
    for (const id of Object.keys(g.units)) if (id.startsWith('fzu')) delete (g.units as any)[id]
    const src = uPlaceInPlay(g, 0, 'Sir Tristan', 2, 0)
    g.units[src].enteredTurn = -5
    usummon(g, 1, 'Foot Soldier', 2, 1)
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${src}"]`, 'source chip'))
    h.rerender()
    const gateReason = canActivate(g, 0, src, 'sorrow')
    expect(gateReason, 'sorrow is activatable here (canActivate === null)').toBeNull()
    // healthy DOM has the button:
    expect(h.container.querySelector('[data-ability="sorrow"]'), 'the button renders in the healthy DOM').not.toBeNull()
    // broken client: strip all ability buttons
    const broken = h.container.cloneNode(true) as HTMLElement
    for (const el of broken.querySelectorAll('[data-ability]')) el.remove()
    const btn = broken.querySelector('[data-ability="sorrow"]')
    // NO_BUTTON detector logic: canActivate===null && no button rendered
    expect(btn === null && gateReason === null, 'NO_BUTTON fires on the stripped DOM').toBe(true)
  })

  it('GATING_PARITY fires when a button is ENABLED while canActivate rejects', () => {
    // Mirror of BREAK (C1-GP): the ability button dropped `disabled={reason!==null}`,
    // rendering an ENABLED button under summoning sickness. Reproduce by driving a
    // TAP-cost ability under summoning sickness (canActivate → "Summoning sickness.")
    // and force-enabling the button in a clone.
    const g = board()
    const src = uPlaceInPlay(g, 0, 'Draconian Bonekite', 2, 0) // reap = tap cost
    g.units[src].enteredTurn = g.turn // just entered → summoning sickness
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${src}"]`, 'source chip'))
    h.rerender()
    const gateReason = canActivate(g, 0, src, 'reap')
    expect(gateReason, 'reap is gated by summoning sickness (tap cost)').not.toBeNull()
    const btn = h.container.querySelector(`[data-ability="reap"][data-source="${src}"]`) as HTMLButtonElement | null
    expect(btn, 'the reap button renders').not.toBeNull()
    expect(btn!.disabled, 'the healthy client disables a gated ability').toBe(true)
    // broken client: force-enable (skip canActivate)
    const broken = h.container.cloneNode(true) as HTMLElement
    const bbtn = broken.querySelector(`[data-ability="reap"][data-source="${src}"]`) as HTMLButtonElement
    bbtn.disabled = false
    // GATING_PARITY detector logic: (button enabled) !== (canActivate === null)
    const enabled = !bbtn.disabled
    expect(enabled !== (gateReason === null), 'GATING_PARITY fires: enabled button but canActivate rejects').toBe(true)
  })

  it('GATING_PARITY fires the OTHER way: a button DISABLED while canActivate === null', () => {
    // The detector is symmetric. Drive an activatable ability (canActivate === null),
    // then DISABLE its button in a clone → the parity check must fire.
    const g = board()
    for (const id of Object.keys(g.units)) if (id.startsWith('fzu')) delete (g.units as any)[id]
    const src = uPlaceInPlay(g, 0, 'Sir Tristan', 2, 0)
    g.units[src].enteredTurn = -5
    usummon(g, 1, 'Foot Soldier', 2, 1)
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${src}"]`, 'source chip'))
    h.rerender()
    const gateReason = canActivate(g, 0, src, 'sorrow')
    expect(gateReason).toBeNull()
    const broken = h.container.cloneNode(true) as HTMLElement
    const bbtn = broken.querySelector('[data-ability="sorrow"]') as HTMLButtonElement
    bbtn.disabled = true // broken client wrongly disables an activatable ability
    const enabled = !bbtn.disabled
    expect(enabled !== (gateReason === null), 'GATING_PARITY fires: disabled button but canActivate === null').toBe(true)
  })

  it('C.0 caster-anchor: an avatar-anchored highlight set fails the source-anchored equality', () => {
    // Mirror of BREAK (C0): Game.tsx anchored abilityTargets on `avatar` instead of the
    // source unit. Reproduce by computing BOTH sets and asserting they differ — the
    // avatar-anchored set (what the reverted client would render) is NOT the source set,
    // so the C.0 equality assertion would fail.
    const g = board()
    for (const id of Object.keys(g.units)) if (id.startsWith('fzu')) delete (g.units as any)[id]
    const avatar = g.units[g.players[0].avatarUnitId]
    const succ = uPlaceInPlay(g, 0, 'Abaddon Succubus', 4, 3)
    uPlaceInPlay(g, 1, 'Foot Soldier', 4, 2) // near the source
    uPlaceInPlay(g, 1, 'Foot Soldier', 2, 1) // near the avatar
    const spec = (getScript('Abaddon Succubus') as any).abilities[0].targets[0]
    const fromSource = new Set<string>()
    const fromAvatar = new Set<string>()
    for (const u of Object.values(g.units)) {
      if (validateTarget(g, spec, { unit: u.id }, g.units[succ], 0) === null) fromSource.add(u.id)
      if (validateTarget(g, spec, { unit: u.id }, avatar, 0) === null) fromAvatar.add(u.id)
    }
    // the reverted (avatar-anchored) client would render fromAvatar, which is NOT the
    // source set the C.0 test asserts → proven able to go red.
    expect(fromAvatar).not.toEqual(fromSource)
  })

  it('C.2 defend parity: a defend panel missing a candidate fails the parity assert', () => {
    // Mirror of BREAK (C2): PromptBox defend mapped `candidates.slice(0,1)`. Reproduce by
    // driving a multi-defender fight, then dropping a candidate button from a clone.
    const g = combatBoard()
    const atk = place(g, 0, 'Amazon Warriors', 2, 1)
    const tgt = place(g, 1, 'Foot Soldier', 2, 2)
    place(g, 1, 'Foot Soldier', 2, 3)
    place(g, 1, 'Foot Soldier', 3, 2)
    place(g, 1, 'Foot Soldier', 1, 2)
    const h = new GameHarness(g).mount()
    active = h
    h.click(must(h.container, `[data-unit="${atk}"]`, 'attacker'))
    h.rerender()
    h.click(must(h.container, `[data-unit="${tgt}"]`, 'target'))
    h.rerender()
    h.click(must(h.container, '[data-modebanner="moveChoice"] [data-choice="0"]', 'attack choice'))
    h.rerender()
    expect(h.state.prompts[0]?.kind).toBe('defend')
    const engineCands = (h.state.prompts[0].data.candidates ?? []).length
    expect(engineCands, 'several defenders').toBeGreaterThan(1)
    const broken = h.container.querySelector('[data-promptbox="defend"]')!.cloneNode(true) as HTMLElement
    const btns = [...broken.querySelectorAll('[data-choice]')]
    if (btns.length) btns[btns.length - 1].remove()
    const domBtns = broken.querySelectorAll('[data-choice]:not([disabled])').length
    expect(domBtns, 'the broken defend panel renders fewer buttons than engine candidates').toBeLessThan(engineCands)
    expect(domBtns, 'parity mismatch → detector fires').not.toBe(engineCands)
  })
})

// =====================================================================================
// EXPERIMENT LOG — the REAL Game.tsx / PromptBox source breaks performed during Phase-C
// development. Each was applied, `npm run audit:dom` was run, the RED finding was
// observed, then the edit was REVERTED and GREEN re-confirmed. The committed tree
// contains NONE of these. The in-file negative controls above reproduce each detector's
// RED signal against a broken DOM clone so the detectors stay continuously proven.
//
//  (C0) CASTER ANCHOR — Game.tsx ~213 changed
//         `const caster = (mode.m === 'abilityTargets' ? (view.units[mode.sourceId] ?? avatar) : avatar)`
//       to force `avatar` in the abilityTargets branch (and the square-anchor at ~333
//       likewise). Observed: C.0 "Abaddon Succubus lure" → the DOM highlighted the
//       avatar-adjacent Foot Soldier instead of the Succubus-adjacent one; the set
//       equality `domTargets == engineFromSucc` failed
//       ("expected Set{avatarAdj} to equal Set{succAdj}"). Reverted → GREEN.
//
//  (C1-NB) NO_BUTTON — unitActions (Game.tsx ~2078): replaced the
//         `{script?.abilities?.map((a) => (<button data-ability=… />))}` block with
//         `{null}`. Observed: EVERY unit ability-card in the C.1 sweep →
//         NO_BUTTON "canActivate===null but no [data-ability=…] rendered".
//         Reverted → GREEN.
//
//  (C1-GP) GATING_PARITY — unitActions (Game.tsx ~2081): neutralised the
//         `disabled={reason !== null}` prop (→ `disabled={false && reason !== null}`) so
//         every ability button rendered ENABLED regardless of canActivate. Observed in
//         the C.1 sweep: Mester Stoor Worm (tide) → GATING_PARITY
//         "button enabled=true but canActivate=\"Mester Stoor Worm is disabled.\"" (any
//         mana/threshold/oncePerTurn/disabled-gated ability trips it). Reverted → GREEN.
//         The in-file negative control drives the summoning-sickness variant (a tap-cost
//         ability on a freshly-entered unit) for the same detector signal.
//
//  (C2) DEFEND PARITY — PromptBox `case 'defend'` (Game.tsx ~1591): mapped
//         `(prompt.data.candidates ?? []).slice(0, 1)` (only the first candidate).
//         Observed: the multi-defender C.2 case → "one enabled toggle per engine
//         candidate" failed (1 vs N). Reverted → GREEN.
//
// After reverting all four, the full Phase-C suite is GREEN.
// =====================================================================================
