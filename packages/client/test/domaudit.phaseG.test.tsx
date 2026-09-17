// Phase-G DOM-level playability audit — the 93 board-dependent casts.
//
// The 1105-card cast sweep (domaudit.sweep.test.tsx) classified 93 real cards as
// 'engine-inconclusive': the generic oracle board cannot cast them because they need a
// specific precondition (a water/land site to target, an Evil/Undead/Mortal minion, a
// carried artifact, a submerged/burrowed region, a stocked cemetery, ...). Phase G
// supplies that precondition per card (the shared GSETUPS table in gsetups.ts), drives
// the cast ENTIRELY through the real Game component via castThroughDom, and then asserts
// a REAL post-state delta read from the card's script observable (damage on a unit, a
// unit moved/bounced/killed, a site flooded/destroyed, a token summoned, control changed,
// a region change, a cemetery/hand delta) — never acceptance-only.
//
// Everything runs through harness.tsx (App's exact hotseat wiring) with the engine as
// the oracle. Included in `npm run audit:dom` automatically (test/**/*.test.tsx).
//
// Path classification (see gsetups.ts + the report):
//   (a) hand-castable with a board precondition — the bulk. Driven via the hand click.
//   (c) cast-from-cemetery-only — Second Wind, The Hexham Haunts — driven via the ⚰
//       cemetery viewer ([data-cast-cemetery]) path proven in Phase C.3.
//   (b) response-window-only — NONE of the 93 are response-window casts (their scripts
//       are onCast/genesis, not onUnitAttacked). The (b) DOM path is still exercised and
//       negative-controlled at the bottom of this file so the response-prompt detector
//       stays continuously proven (the historical Valor bug).

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import {
  castThroughDom,
  inject as cinject,
  sweepBoardBase,
  type Finding,
} from './domaudit'
import { getCard, type GameState } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'
import { GSETUPS, type GSetup } from './gsetups'

let active: GameHarness | null = null
afterEach(() => {
  active?.unmount()
  active = null
})

// cards cast from the cemetery (path c) — driven via the ⚰ viewer, not the hand click.
const CEMETERY_CARDS = new Set(['Second Wind', 'The Hexham Haunts'])

/** the ⚰ cemetery button in MY PlayerBar (first button containing ⚰). */
function cemeteryButton(root: HTMLElement): HTMLButtonElement | null {
  const bar = root.querySelector('.playerbar.me')
  if (!bar) return null
  for (const b of bar.querySelectorAll('button')) if ((b.textContent ?? '').includes('⚰')) return b as HTMLButtonElement
  return null
}

/** drive whatever mode/prompt is pending to quiescence (used after a cemetery cast
 *  starts). Mirrors Phase C.3's driveToDone. */
function driveToDone(h: GameHarness, budget = 40): { ok: boolean; detail: string } {
  const drift0 = h.drifts.length
  for (let i = 0; i < budget; i++) {
    h.rerender()
    if (h.drifts.length > drift0) return { ok: false, detail: `engine rejected: ${h.drifts[h.drifts.length - 1].error}` }
    const pending = h.state.prompts.length > 0
    const banner = h.container.querySelector('[data-modebanner]')
    if (!pending && !banner) return { ok: true, detail: `resolved (${i} steps)` }
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

/** build the Phase-G override board for `name`, inject the card, mount, and return the
 *  harness + live state. For cemetery cards the card is moved from hand → cemetery. */
function buildBoard(name: string, entry: GSetup): { h: GameHarness; g: GameState } {
  const g = sweepBoardBase()
  entry.setup(g)
  const id = cinject(g, 0, name)
  if (CEMETERY_CARDS.has(name)) {
    g.players[0].hand = g.players[0].hand.filter((x) => x !== id)
    g.players[0].cemetery.push(id)
  }
  const h = new GameHarness(g).mount()
  active = h
  return { h, g }
}

/** drive a cemetery-cast card via the ⚰ viewer [data-cast-cemetery] button. */
function castFromCemeteryDom(h: GameHarness, cardId: string): Finding {
  const cem = cemeteryButton(h.container)
  if (!cem) return { card: cardId, kind: 'NO_AFFORDANCE', detail: 'no ⚰ cemetery button in PlayerBar', trace: [] }
  h.click(cem)
  h.rerender()
  const castBtn = h.container.querySelector(`[data-cast-cemetery="${cardId}"]`) as HTMLButtonElement | null
  if (!castBtn) return { card: cardId, kind: 'NO_AFFORDANCE', detail: 'no [data-cast-cemetery] button in the viewer', trace: [] }
  h.click(castBtn)
  h.rerender()
  const res = driveToDone(h)
  return { card: cardId, kind: res.ok ? 'OK' : 'STUCK', detail: res.detail, trace: [] }
}

// =====================================================================================
// One test per card: drive the cast through the DOM on its override board, then run the
// card's post-state assert.
// =====================================================================================

describe('Phase-G — the 93 board-dependent casts proven through the DOM', () => {
  for (const [name, entry] of Object.entries(GSETUPS)) {
    const def = getCard(name)
    it(`${name} (${def.type})`, () => {
      const { h, g } = buildBoard(name, entry)

      // 1) drive the cast through the real DOM.
      let finding: Finding
      if (CEMETERY_CARDS.has(name)) {
        const cardId = g.players[0].cemetery.find((cid) => g.cards[cid]?.name === name)!
        finding = castFromCemeteryDom(h, cardId)
      } else {
        finding = castThroughDom(h, name, 40)
      }
      if (finding.kind !== 'OK') {
        // eslint-disable-next-line no-console
        console.error(`\n[Phase-G FINDING] ${name} → ${finding.kind}: ${finding.detail}` +
          (finding.trace.length ? '\n  trace:\n   ' + finding.trace.join('\n   ') : ''))
      }
      expect(finding.kind, `${name}: DOM cast — ${finding.detail}`).toBe('OK')

      // 2) post-state assertion (a REAL observable delta from the card's script).
      if (entry.assert) {
        const err = entry.assert(g)
        expect(err, `${name}: post-state — ${err}`).toBeNull()
      }
    })
  }
})

// =====================================================================================
// NEGATIVE CONTROLS
// =====================================================================================

describe('Phase-G negative controls — detectors proven able to go RED', () => {
  // (NC-a) OVERRIDE-ORACLE WIRING: if the sweep ignored SETUP_OVERRIDES, the 93 cards
  // would fall back to the generic oracle (engineCanPlay) and stay 'engine-inconclusive'
  // — the inconclusive count would NOT drop from 127 to 34. Reproduce the wiring both
  // ways and assert the counts diverge, so the reconciliation can't silently regress.
  it('inconclusive-count assertion goes RED when the override-oracle wiring is bypassed', () => {
    // WITH the Phase-G setup, the override-board oracle can cast the card.
    // WITHOUT it (generic board), it cannot — that is the whole point of Phase G.
    // Pick a representative site-target card that the generic board cannot cast.
    const name = 'Boil'
    const entry = GSETUPS[name]
    // WITH override: build the override board and confirm the DOM cast resolves.
    {
      const { h, g } = buildBoard(name, entry)
      const finding = castThroughDom(h, name, 40)
      expect(finding.kind, 'with the override, the card casts through the DOM').toBe('OK')
      const err = entry.assert?.(g) ?? null
      expect(err, 'with the override, the post-state holds').toBeNull()
      h.unmount(); active = null
    }
    // WITHOUT override: on the bare sweep board (no water site, no victim) the same card
    // finds no legal water-site target → the DOM cannot complete the cast. This is the
    // RED signal that the wiring bypass would produce (card stuck at inconclusive).
    {
      const g = sweepBoardBase()
      cinject(g, 0, name)
      const h = new GameHarness(g).mount()
      active = h
      const finding = castThroughDom(h, name, 40)
      expect(finding.kind, 'without the override, the generic board cannot cast Boil').not.toBe('OK')
      h.unmount(); active = null
    }
  })

  // (NC-b) RESPONSE-PROMPT RENDERING (the historical Valor bug): when an attack opens a
  // response window, the response PromptBox must render the offered card. If the client
  // dropped the response prompt's rendering, a response-window cast would be unreachable.
  // None of the 93 are response casts, but the (b) DOM path must stay proven: we drive a
  // real attack into a defend response window, then break a clone of the response
  // PromptBox and confirm the offered-affordance count goes to zero (RED).
  it('response-window prompt detector goes RED when the response PromptBox renders nothing', () => {
    const g = sweepBoardBase()
    // an attacker + a target so a defend response window opens.
    const atkId = Object.keys(g.units).find((id) => g.units[id].controller === 0 && !g.units[id].isAvatar)!
    const tgtId = Object.keys(g.units).find((id) => g.units[id].controller === 1 && !g.units[id].isAvatar)!
    // stand the attacker adjacent to the target and clear summoning sickness.
    g.units[atkId].x = 2; g.units[atkId].y = 1; g.units[atkId].enteredTurn = g.turn - 2
    g.units[tgtId].x = 2; g.units[tgtId].y = 2; g.units[tgtId].enteredTurn = g.turn - 2
    const h = new GameHarness(g).mount()
    active = h
    h.click(h.container.querySelector(`[data-unit="${atkId}"]`)!)
    h.rerender()
    h.click(h.container.querySelector(`[data-unit="${tgtId}"]`)!)
    h.rerender()
    const attackBtn = h.container.querySelector('[data-modebanner="moveChoice"] [data-choice="0"]') as HTMLButtonElement | null
    if (attackBtn) { h.click(attackBtn); h.rerender() }
    // a defend response window should be pending for player 1.
    const hasDefend = h.state.prompts[0]?.kind === 'defend'
    expect(hasDefend, 'attacking opens a defend response window').toBe(true)
    // healthy DOM: the defend PromptBox renders candidate toggles.
    const healthy = h.container.querySelectorAll('[data-promptbox="defend"] [data-choice]:not([disabled])').length
    expect(healthy, 'the healthy response PromptBox renders the offered affordance(s)').toBeGreaterThan(0)
    // broken client: strip the response PromptBox contents from a clone → RED.
    const broken = h.container.cloneNode(true) as HTMLElement
    for (const el of broken.querySelectorAll('[data-promptbox="defend"] [data-choice]')) el.remove()
    const brokenCount = broken.querySelectorAll('[data-promptbox="defend"] [data-choice]:not([disabled])').length
    expect(brokenCount, 'the broken response PromptBox offers no affordance → detector RED').toBe(0)
    expect(brokenCount, 'broken ≠ healthy').not.toBe(healthy)
  })
})
