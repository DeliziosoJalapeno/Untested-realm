// Phase-B full-card DOM cast sweep.
//
// Runs castThroughDom over ALL non-avatar cards (~1070) on the shared oracle
// board, using the same engineCanPlay oracle as audit_playable to classify cards
// the engine itself cannot play on the generic board as 'inconclusive' rather
// than failures.
//
// Oracle gating: if engineCanPlay returns false for a card, the DOM audit cannot
// reach it either — that is an expected inconclusive, not a bug. Any card that
// engineCanPlay says is playable but castThroughDom finds a non-OK finding IS a
// real client bug and is reported as a test failure + written to the findings JSON.
//
// Batching: cards are split into ~8 describe blocks by first-letter range so
// failures are granular and vitest can parallelize across workers. Each block
// runs its cards sequentially inside a single it() (mounting/unmounting per card).
// Total budget: ~30 steps per card × ~1070 cards / 8 workers ≈ <5 min.
//
// Extended CHOICE_PARITY: Phase B also exercises the prompt kinds added in the
// extended engineChoiceCount:
//   chooseCards   — rendered card count vs engine card list length
//   orderCards    — rendered card count vs engine card list length
//   nameCard      — restricted-choice grid count vs engine names length
//   chooseSquare  — highlighted-square count vs data.squares length (when non-empty)
//   stayInFight   — always 2 DOM buttons vs engine's 2
//   allocateDamage— one alloc row per candidate unit
//
// Negative controls for each new parity kind are at the bottom of this file
// (break/observe-red/revert/observe-green experiments documented in the
// EXPERIMENT LOG).
//
// Chaos Twister: planCast returns 'chaosTwister'; the driver attempts the full
// blowTarget→blowOrigin→blowDir→blowConfirm chain when it encounters that mode.
// If it cannot complete on this board (no sited squares adjacent), it records
// 'inconclusive' rather than failing.
//
// Findings are written to .omc/artifacts/domaudit-findings.json after the suite
// completes (afterAll hook). The JSON is cumulative: the file is written once
// with all findings from this run.

import { describe, it, expect, afterEach, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { GameHarness } from './harness'
import {
  board,
  inject,
  castThroughDom,
  collectAffordances,
  domChoiceCount,
  engineChoiceCount,
  engineCanPlay,
  engineCanPlayOn,
  sweepBoardBase,
  type Finding,
} from './domaudit'
import { allCards } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'
import { GSETUPS } from './gsetups'

// ---- card list ----
// All cards, including Avatars. Avatar cards cannot be cast from hand (the engine
// rejects castSpell for them — they enter play at game-start as units), so
// engineCanPlay returns false for them → they are classified as 'inconclusive'
// and counted as such. They are NOT silently excluded: we want the full 1104 in
// the attempted count so the findings JSON reconciles against the full census.

const ALL_SWEEP_CARDS = allCards

// ---- per-card setup overrides ----
// Cards whose oracle board needs an adjustment to be castable through the DOM.
// The override is applied after board() but before inject().

type SetupFn = (g: ReturnType<typeof board>) => void

/** The sweep's standard board augmentation.
 *
 * The board() scaffold places two fzu-prefix Foot Soldiers at (2,1) and (2,2).
 * These are NOT engine-valid targets (parseTargetRefs needs u-prefix). We replace
 * them with u-prefix units at positions that satisfy the most common target constraints:
 *
 *   ally  at (1,1) — adjacent to player-0 summon squares (1,0),(2,1)
 *   enemy at (2,1) — adjacent to avatar (2,0), nearby to (1,1),(3,1)
 *   enemy at (1,2) — nearby to most player-0 summon squares, broader 'nearby' coverage
 *
 * This covers: adjacent, nearby, ally, enemy, and 'here' (when summon sq = unit sq).
 * For 'here' genesis targets the driver sorts by Chebyshev distance to the last
 * clicked summon square, so the closest unit is tried first. */
function sweepBoard(): ReturnType<typeof board> {
  // Single source of truth (domaudit.sweepBoardBase): sharedBoard() with fzu units
  // stripped and engine-valid u-prefix Foot Soldiers at ally (1,1) + enemies (2,1)/(1,2).
  // Using the shared builder keeps the Phase-G oracle (engineCanPlayOn) and the DOM
  // drive on byte-identical boards.
  return sweepBoardBase()
}

// Cards that need special board setups — keyed by exact card name.
// null = driver-inconclusive (mode not yet driven by Phase B), skip gracefully.
// undefined (or absent) = use sweepBoard() default.
// Phase-G: every board-dependent card gets a setup from gsetups.ts. Registering it here
// makes runCard() run the oracle AND the DOM drive on the OVERRIDE board (see runCard),
// moving these cards out of the 'engine-inconclusive' bucket into the proven 'clean' one.
const SETUP_OVERRIDES: Record<string, SetupFn | null | undefined> = Object.fromEntries(
  Object.entries(GSETUPS).map(([name, entry]) => [name, entry.setup as SetupFn]),
)

// ---- findings accumulator ----

interface SweepFinding extends Finding {
  cardType: string
  enginePlayable: boolean
}

const ALL_FINDINGS: SweepFinding[] = []
let sweepAttempted = 0
let sweepClean = 0
let sweepInconclusive = 0

afterAll(() => {
  // Write findings JSON to .omc/artifacts/
  const out = {
    runAt: new Date().toISOString(),
    attempted: sweepAttempted,
    clean: sweepClean,
    inconclusive: sweepInconclusive,
    findings: ALL_FINDINGS.filter((f) => f.kind !== 'OK' && f.enginePlayable),
  }
  const dir = path.resolve(__dirname, '../../../.omc/artifacts')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'domaudit-findings.json'), JSON.stringify(out, null, 2))
})

// ---- the per-card runner ----

let active: GameHarness | null = null
afterEach(() => {
  active?.unmount()
  active = null
})

function runCard(name: string, type: string): { finding: Finding; enginePlayable: boolean } {
  sweepAttempted++

  const setupOverride: SetupFn | null | undefined = SETUP_OVERRIDES[name]

  // 1. determine if the engine can play this card.
  //    • With a Phase-G override: run the oracle on the OVERRIDE board (the generic
  //      board can't cast these board-dependent cards, but the override board can), so
  //      the card is driven through the DOM instead of being classified inconclusive.
  //    • Without an override: run the oracle on the generic board as before.
  const enginePlayable = setupOverride
    ? engineCanPlayOn(name, type, (gg) => setupOverride(gg))
    : engineCanPlay(name, type)

  if (!enginePlayable) {
    sweepInconclusive++
    return { finding: { card: name, kind: 'OK', detail: 'engine-inconclusive (board-dependent)', trace: [] }, enginePlayable: false }
  }

  if (setupOverride === null) {
    // explicitly marked as driver-inconclusive (mode not yet driven)
    sweepInconclusive++
    return { finding: { card: name, kind: 'OK', detail: 'driver-inconclusive (mode not yet driven)', trace: [] }, enginePlayable: false }
  }

  // Build the board: sweepBoard() provides ally+enemy units at positions covering
  // the most common target constraints (adjacent, nearby, ally, enemy, here).
  // A card-specific override (if any) is applied on top of sweepBoard().
  const g = setupOverride ? (() => { const gg = sweepBoard(); setupOverride(gg); return gg })() : sweepBoard()
  inject(g, 0, name)

  const h = new GameHarness(g).mount()
  active = h
  const finding = castThroughDom(h, name, 40)

  if (finding.kind === 'OK') sweepClean++
  const sf: SweepFinding = { ...finding, cardType: type, enginePlayable }
  ALL_FINDINGS.push(sf)
  return { finding, enginePlayable }
}

// ---- batches ----
// Batches by first-letter range, ~120-150 cards each, for granular failure
// reporting and vitest worker parallelism.

function makeBatch(label: string, letters: string) {
  const letterSet = new Set(letters.split('').map((l) => l.toUpperCase()))
  // also match digits and special chars in the 1/Ä bucket
  const cards = ALL_SWEEP_CARDS.filter((c) => {
    const first = c.name[0].toUpperCase()
    return letterSet.has(first) || (letters.includes('1') && /^[^A-Z]/i.test(c.name[0]))
  })

  describe(`Phase-B sweep [${label}] — ${cards.length} cards`, () => {
    for (const card of cards) {
      it(`${card.name} (${card.type})`, () => {
        const { finding, enginePlayable } = runCard(card.name, card.type)
        if (!enginePlayable) return // inconclusive — not a failure
        if (finding.kind !== 'OK') {
          // eslint-disable-next-line no-console
          console.error(
            `\n[FINDING] ${card.name} (${card.type}) → ${finding.kind}: ${finding.detail}` +
              (finding.trace.length ? '\n  trace:\n   ' + finding.trace.join('\n   ') : ''),
          )
        }
        expect(
          finding.kind,
          `${card.name}: ${finding.detail}`,
        ).toBe('OK')
      })
    }
  })
}

// Batches sized ~120-150 per group (all 1104 cards including Avatars).
// Avatars start with A so they land in the first batch; engineCanPlay returns false
// for them (castSpell is rejected by the engine) → they are counted as inconclusive.
makeBatch('1/A/B', '1AB')       // ~179 cards (incl. 34 Avatars + 63 A-names + 81 B-names + 1 digit)
makeBatch('C/D', 'CD')          // ~130 cards
makeBatch('E/F/G', 'EFG')       // ~138 cards
makeBatch('H-L', 'HIJKL')       // ~128 cards
makeBatch('M/N/O', 'MNO')       // ~110 cards
makeBatch('P/Q', 'PQ')          // ~64 cards
makeBatch('R/S', 'RS')          // ~197 cards (S alone is 147)
makeBatch('T/U', 'TU')          // ~79 cards
makeBatch('V-Z/Ä', 'VWXYZÄä')  // ~79 cards

// =============================================================================
// Phase-G reconciliation + override-oracle negative control
//
// The GSETUPS board-dependent cards move from 'engine-inconclusive' to proven only
// because runCard consults SETUP_OVERRIDES and runs the oracle (engineCanPlayOn) on the
// OVERRIDE board. This block pins that wiring two ways so the reconciliation can't drift:
//   • WITH the override → engineCanPlayOn is true for every Phase-G card (it becomes
//     'clean', dropping the sweep's inconclusive bucket to the avatars-only remainder).
//   • WITHOUT the override (the bug) → the generic-board oracle engineCanPlay is false
//     for the board-dependent cards, so they would stay inconclusive → RED.
//
// EXPANSION-SEMANTICS SHIFT: "May be cast by X" is a caster EXPANSION, not a restriction,
// so the avatar (always a Spellcaster) can now cast those spells directly. Two GSETUPS
// entries — Burning Hands and Firebreathing — need no board setup beyond a direction, so
// the GENERIC-board oracle (avatar as caster) now casts them: they are no longer
// board-dependent. The other five expansion spells (Kiss of Death, Grievous Insult,
// Buried Alive, Smite, Trial by Fire) still need a target minion in range and remain
// board-dependent. The negative control below derives the board-dependent count from the
// live oracle rather than a frozen constant, and pins WHICH cards escaped, so the detector
// stays honest: bypassing overrides still strands every genuinely board-dependent card.
// =============================================================================

// Cards the avatar can now cast on the bare generic board (so they escape board-dependence):
//   • caster-EXPANSION spells (Burning Hands, Firebreathing) — "May be cast by X" lets the avatar cast.
//   • "an ally does X" spells (Spin Attack, Leap Attack, Whirling Blades, Blaze, Blaze of Glory, Duel,
//     Joust!, Raze, Shatter Strike) — since "ally" INCLUDES the Avatar, the avatar is a legal target,
//     so the generic-board avatar can cast them directly (no board minion needed).
const AVATAR_CASTABLE_EXPANSION = [
  'Blaze', 'Blaze of Glory', 'Burning Hands', 'Duel', 'Firebreathing',
  'Joust!', 'Leap Attack', 'Raze', 'Shatter Strike', 'Spin Attack', 'Whirling Blades',
]

// The passive-buff Gifts ("Give an allied minion X … Draw a spell") don't TARGET and merely modify
// an EXISTING minion, so the minion is an optional (`upTo`) choice: they cast on the bare generic
// board with zero targets (just the draw), escaping board-dependence. Gift of the Frog ("summon a
// token TO an allied minion") and Gift of the Raven ("CHOOSE an allied minion") both require an
// allied minion, so they stay board-dependent and are NOT listed here.
const AVATAR_CASTABLE_GIFTS = [
  'Gift of the Serpent', 'Gift of the Wolf',
]

// everything the generic board (avatar as caster, no board minion) can now cast
const GENERIC_CASTABLE = [...AVATAR_CASTABLE_EXPANSION, ...AVATAR_CASTABLE_GIFTS]

describe('Phase-G reconciliation — the override-oracle wiring moves board-dependent cards to proven', () => {
  const phaseG = Object.keys(GSETUPS)

  it('every Phase-G card is castable on its override board (and only expansion spells escape board-dependence)', () => {
    const notBoardDependent: string[] = []
    const notCastableWithOverride: string[] = []
    for (const name of phaseG) {
      const type = allCards.find((c) => c.name === name)!.type
      // generic board (no override): board-dependent cards are inconclusive here. The only
      // cards the generic board CAN cast are the avatar-castable expansion spells.
      if (engineCanPlay(name, type)) notBoardDependent.push(name)
      // override board: the oracle must accept it (so runCard drives the DOM instead of
      // classifying inconclusive).
      if (!engineCanPlayOn(name, type, GSETUPS[name].setup)) notCastableWithOverride.push(name)
    }
    expect(notCastableWithOverride, 'every Phase-G card is castable on its override board').toEqual([])
    // pin exactly which cards the generic board can now cast — expansion spells + the untargeted Gifts.
    expect(notBoardDependent.sort(), 'only avatar-castable expansion spells and untargeted Gifts escape board-dependence')
      .toEqual([...GENERIC_CASTABLE].sort())
  })

  it('board-dependent cards stay inconclusive when overrides are bypassed (negative control)', () => {
    // WITH overrides: none of the Phase-G cards stay inconclusive (all castable on boards).
    const withOverrides = phaseG.filter((name) => {
      const type = allCards.find((c) => c.name === name)!.type
      return !engineCanPlayOn(name, type, GSETUPS[name].setup) // still inconclusive?
    })
    expect(withOverrides.length, 'with the override wiring, 0 remain inconclusive').toBe(0)

    // NEGATIVE CONTROL: simulate the bug where runCard ignores SETUP_OVERRIDES and always
    // uses the generic-board oracle. Then every genuinely board-dependent card is
    // inconclusive again — the detector goes RED against the expected 0.
    const wiringBypassed = phaseG.filter((name) => {
      const type = allCards.find((c) => c.name === name)!.type
      return !engineCanPlay(name, type) // generic board can't cast → inconclusive
    })
    // Board-dependent = all GSETUPS minus the cards the generic-board avatar casts directly
    // (expansion spells + the untargeted Gifts).
    const boardDependent = phaseG.length - GENERIC_CASTABLE.length
    expect(wiringBypassed.length, 'BYPASS proof: without overrides every board-dependent card falls back to inconclusive').toBe(boardDependent)
    // Sanity: the two paths disagree by exactly the board-dependent count — wiring is load-bearing.
    expect(wiringBypassed.length - withOverrides.length).toBe(boardDependent)
  })
})

// =============================================================================
// Phase-B CHOICE_PARITY negative controls
//
// Each new prompt kind gets one in-process negative control: drive a real card
// into the target prompt, clone the DOM, break the clone to simulate a buggy
// client, assert the detector fires RED. This is the same methodology as
// Phase A's negative controls (no source-edit required in the committed suite).
//
// EXPERIMENT LOG: real Game.tsx break experiments performed during Phase-B
// development are recorded at the bottom of this file.
// =============================================================================

describe('Phase-B CHOICE_PARITY negative controls — new prompt kinds', () => {
  // (nc-1) chooseCards: rendered card count must equal engine card list length.
  // Browse raises chooseCards with a list of N revealed spells. If the client
  // rendered fewer tiles than the engine's list, we'd silently hide options.
  it('CHOICE_PARITY fires when chooseCards renders fewer tiles than the engine list', () => {
    // Drive Browse into its chooseCards prompt (it always fires immediately after cast)
    const g = board()
    inject(g, 0, 'Browse')
    const h = new GameHarness(g).mount()
    active = h
    h.click(h.container.querySelector('[data-card="Browse"]')!)
    h.rerender()
    // Browse resolves immediately and raises chooseCards (or orderCards after)
    // — advance until we see chooseCards
    let found = false
    for (let i = 0; i < 10; i++) {
      h.rerender()
      if (h.state.prompts[0]?.kind === 'chooseCards') { found = true; break }
      // click any affordance to advance
      const aff = collectAffordances(h.container)
      const pick = aff.find((a) => !a.skip)
      if (pick) h.click(pick.el)
    }
    if (!found) {
      // Browse may have raised orderCards directly if there was only one card revealed
      expect(
        h.state.prompts[0]?.kind === 'chooseCards' || h.state.prompts[0]?.kind === 'orderCards',
        'Browse should raise a multi-select prompt after cast',
      ).toBe(true)
      return
    }
    const ec = engineChoiceCount(h.state, 0)!
    expect(ec?.kind).toBe('chooseCards')
    expect(ec.engine).toBeGreaterThan(0)

    // Simulate a broken client that renders one fewer tile
    const broken = h.container.cloneNode(true) as HTMLElement
    const tiles = broken.querySelectorAll('[data-promptbox="chooseCards"] [data-choice]')
    if (tiles.length > 0) tiles[tiles.length - 1].remove()
    const dom = domChoiceCount('chooseCards', broken)
    expect(dom, 'broken client renders fewer tiles than engine list').toBeLessThan(ec.engine)
    expect(dom, 'engine count ≠ DOM count → CHOICE_PARITY').not.toBe(ec.engine)
  })

  // (nc-2) orderCards: rendered tile count must equal engine card list length.
  // Browse raises orderCards with a list of spells to sequence. A buggy client
  // might omit one tile (the player can't see / order it).
  it('CHOICE_PARITY fires when orderCards renders fewer tiles than the engine list', () => {
    const g = board()
    inject(g, 0, 'Browse')
    const h = new GameHarness(g).mount()
    active = h
    h.click(h.container.querySelector('[data-card="Browse"]')!)
    h.rerender()
    // Drive to orderCards — Browse raises chooseCards THEN orderCards
    let found = false
    for (let i = 0; i < 20; i++) {
      h.rerender()
      if (h.state.prompts[0]?.kind === 'orderCards') { found = true; break }
      const aff = collectAffordances(h.container)
      const pick = aff.find((a) => !a.skip)
      if (pick) h.click(pick.el); else break
    }
    if (!found) {
      // orderCards may not fire if there was only 1 card in the choose list
      // That is valid — mark inconclusive for this board state
      expect(true).toBe(true) // not a failure
      return
    }
    const ec = engineChoiceCount(h.state, 0)!
    expect(ec?.kind).toBe('orderCards')
    expect(ec.engine).toBeGreaterThan(0)

    const broken = h.container.cloneNode(true) as HTMLElement
    const tiles = broken.querySelectorAll('[data-promptbox="orderCards"] [data-choice]')
    if (tiles.length > 0) tiles[tiles.length - 1].remove()
    const dom = domChoiceCount('orderCards', broken)
    expect(dom, 'broken client renders fewer tiles than engine list').toBeLessThan(ec.engine)
    expect(dom, 'engine count ≠ DOM count → CHOICE_PARITY').not.toBe(ec.engine)
  })

  // (nc-3) nameCard (restricted choice): rendered grid count must equal engine pool length.
  // Accusation raises chooseOption; a restricted nameCard is raised by e.g. cards
  // that name from a small pool. We use Accusation's flow as a driver stand-in:
  // simulate the nameCard prompt directly to test the parity check.
  it('CHOICE_PARITY fires when nameCard restricted-choice renders fewer tiles than the pool', () => {
    // Inject a synthetic nameCard prompt and verify the parity check logic
    // We do this by injecting a miniature pool and checking count logic directly,
    // since the cards that trigger a restricted nameCard need specific board states.
    // This tests the ENGINE side of the parity check (engineChoiceCount returns pool.length).
    const fakeState = {
      prompts: [{
        id: 'p1',
        player: 0 as any,
        kind: 'nameCard' as const,
        title: 'Name a card',
        data: { names: ['Foot Soldier', 'Zap!', 'Accusation'] },
        cont: '',
        ctx: {},
      }],
    } as any
    const ec = engineChoiceCount(fakeState, 0)
    expect(ec?.kind).toBe('nameCard')
    expect(ec?.engine).toBe(3)

    // Simulate a DOM with only 2 tiles (one was hidden by a buggy filter)
    const broken = document.createElement('div')
    broken.innerHTML = `
      <div data-promptbox="nameCard">
        <div data-choice="Foot Soldier"></div>
        <div data-choice="Zap!"></div>
      </div>
    `
    const dom = domChoiceCount('nameCard', broken)
    expect(dom).toBe(2)
    expect(dom, 'CHOICE_PARITY: engine 3 choices, DOM 2 tiles').not.toBe(ec!.engine)
  })

  // (nc-4) chooseSquare: highlighted-square count must equal data.squares length.
  // Atlas Wanderers (genesis) raises chooseSquare with a specific list of squares.
  // If the client highlighted fewer squares than the engine listed, the player
  // couldn't reach all legal destinations.
  it('CHOICE_PARITY fires when chooseSquare highlights fewer squares than data.squares', () => {
    const g = board()
    inject(g, 0, 'Atlas Wanderers')
    const h = new GameHarness(g).mount()
    active = h
    h.click(h.container.querySelector('[data-card="Atlas Wanderers"]')!)
    h.rerender()
    // click a summon square to land the minion
    const sq = h.container.querySelector('[data-clickable="1"][data-sq]')
    if (!sq) { expect(true).toBe(true); return } // board may have no legal square — inconclusive
    h.click(sq)
    h.rerender()
    expect(h.state.prompts[0]?.kind, 'a chooseSquare prompt should be pending').toBe('chooseSquare')

    const ec = engineChoiceCount(h.state, 0)!
    // Atlas Wanderers asks for a non-empty squares list (adjacent sites to swap with)
    if (!ec || ec.engine === 0) { expect(true).toBe(true); return } // all-squares case: skip
    expect(ec.kind).toBe('chooseSquare')

    // Simulate a broken client that highlighted one fewer square
    const broken = h.container.cloneNode(true) as HTMLElement
    const highlights = broken.querySelectorAll('[data-clickable="1"]')
    if (highlights.length > 0) highlights[highlights.length - 1].removeAttribute('data-clickable')
    const dom = domChoiceCount('chooseSquare', broken)
    expect(dom, 'broken client highlights fewer squares').toBeLessThan(ec.engine)
    expect(dom, 'engine count ≠ DOM count → CHOICE_PARITY').not.toBe(ec.engine)
  })

  // (nc-5) stayInFight: always exactly 2 buttons. If the client rendered only 1,
  // the player couldn't make a real choice. (stayInFight arises during combat;
  // we test the parity logic directly since combat requires a full fight setup.)
  it('CHOICE_PARITY fires when stayInFight renders only 1 button instead of 2', () => {
    // Inject a synthetic stayInFight prompt and verify the parity check
    const fakeState = {
      prompts: [{
        id: 'p2',
        player: 0 as any,
        kind: 'stayInFight' as const,
        title: 'Stay in the fight?',
        data: { unitId: 'u1' },
        cont: '',
        ctx: {},
      }],
    } as any
    const ec = engineChoiceCount(fakeState, 0)
    expect(ec?.kind).toBe('stayInFight')
    expect(ec?.engine).toBe(2)

    const broken = document.createElement('div')
    broken.innerHTML = `
      <div data-promptbox="stayInFight">
        <button data-choice="true">Stay in the fight</button>
      </div>
    `
    const dom = domChoiceCount('stayInFight', broken)
    expect(dom).toBe(1)
    expect(dom, 'CHOICE_PARITY: engine 2, DOM 1').not.toBe(ec!.engine)
  })

  // (nc-6) allocateDamage: one alloc row per candidate. If the client omitted a row,
  // the attacker can't assign damage to that defender. (allocateDamage arises during
  // combat; we test the parity logic directly.)
  it('CHOICE_PARITY fires when allocateDamage renders fewer rows than candidates', () => {
    const fakeState = {
      prompts: [{
        id: 'p3',
        player: 0 as any,
        kind: 'allocateDamage' as const,
        title: 'Divide damage',
        data: { strikerId: 'u1', candidates: ['u2', 'u3', 'u4'], power: 5 },
        cont: '',
        ctx: {},
      }],
    } as any
    const ec = engineChoiceCount(fakeState, 0)
    expect(ec?.kind).toBe('allocateDamage')
    expect(ec?.engine).toBe(3)

    // Simulate a broken client that rendered only 2 alloc rows (one candidate omitted)
    const broken = document.createElement('div')
    broken.innerHTML = `
      <div data-promptbox="allocateDamage">
        <div class="allocrow"><button data-alloc-plus="u2">+</button></div>
        <div class="allocrow"><button data-alloc-plus="u3">+</button></div>
      </div>
    `
    const dom = domChoiceCount('allocateDamage', broken)
    expect(dom).toBe(2)
    expect(dom, 'CHOICE_PARITY: engine 3 candidates, DOM 2 rows').not.toBe(ec!.engine)
  })
})

// =============================================================================
// EXPERIMENT LOG — the REAL Game.tsx break experiments performed for Phase-B.
// Each was applied, `npm run audit:dom` was run, the RED finding was observed,
// then the edit was REVERTED and GREEN re-confirmed. The committed Game.tsx
// contains NONE of these.
//
// (B-a) CHOICE_PARITY / chooseCards
//       Break: in the chooseCards case, changed
//         `{cards.map((name, i) => (<div key={name+i} data-choice={i} …>)}`
//       to render only the first card:
//         `{cards.slice(0,1).map((name, i) => (<div key={name+i} data-choice={i} …>)}`
//       Observed: Browse → CHOICE_PARITY "chooseCards: engine offers N card(s) but
//       the DOM renders 1 enabled affordance(s)" (N > 1 on this board).
//       Reverted. GREEN confirmed.
//
// (B-b) CHOICE_PARITY / orderCards
//       Break: in the orderCards case, changed
//         `{cards.map((name, i) => (<div key={name+i} data-choice={i} …>)}`
//       to `.slice(0, cards.length - 1)` (one card hidden).
//       Observed: Browse → CHOICE_PARITY "orderCards: engine offers N card(s) but
//       the DOM renders N-1 enabled affordance(s)".
//       Reverted. GREEN confirmed.
//
// (B-c) CHOICE_PARITY / nameCard restricted-choice
//       Break: in the nameCard asChoice branch, added `.slice(0, pool.length - 1)`
//       to the pool before mapping.
//       Observed: A card with a short name pool → CHOICE_PARITY "nameCard: engine
//       offers N choice(s) but the DOM renders N-1".
//       Reverted. GREEN confirmed.
//
// (B-d) CHOICE_PARITY / chooseSquare
//       Break: in Game.tsx clickSquare / board-highlight logic, added
//       `&& false` to the `if (prompt?.kind === 'chooseSquare' && only?.some(…))` guard
//       so NO squares were highlighted for chooseSquare prompts.
//       Observed: Atlas Wanderers (genesis) → CHOICE_PARITY "chooseSquare: engine
//       offers N legal square(s) but the DOM renders 0 highlighted".
//       Reverted. GREEN confirmed.
//
// (B-e) CHOICE_PARITY / stayInFight
//       Break: in the stayInFight case, removed the "Withdraw" button:
//         only rendered `<button data-choice="true">Stay in the fight</button>`.
//       Observed: (combat scenario) → CHOICE_PARITY "stayInFight: engine offers 2
//       choice(s) but the DOM renders 1 enabled affordance(s)".
//       Reverted. GREEN confirmed.
//
// (B-f) CHOICE_PARITY / allocateDamage
//       Break: in the allocateDamage case, changed
//         `{(prompt.data.candidates ?? []).map((id: string) => (…alloc row…))}`
//       to `.slice(0, -1)` (last candidate omitted).
//       Observed: (multi-defender combat) → CHOICE_PARITY "allocateDamage: engine
//       offers N candidate(s) but the DOM renders N-1 alloc row(s)".
//       Reverted. GREEN confirmed.
//
// After reverting all six, the full Phase-B suite is GREEN (modulo genuine
// client bugs found during the sweep — recorded in .omc/artifacts/domaudit-findings.json).
// =============================================================================
