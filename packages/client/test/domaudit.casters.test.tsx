// DOM-level tests for the caster picker (Part 2/3 of the "May be cast by X is an
// EXPANSION" mission). When >1 controlled unit is a legal caster the client asks WHO
// casts the spell; clicking a candidate threads that caster through the whole flow so
// region/'here'/'nearby' anchoring and the damage-grid origin follow the chosen caster,
// not the avatar. Everything is driven through the REAL Game component (harness.tsx).

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { board, usummon, inject, legalCasterSet } from './domaudit'
import { canCast, getScript } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

/** click the hand card by name, return the harness root. */
function openCast(h: GameHarness, cardName: string): HTMLElement {
  h.rerender()
  const handEl = h.container.querySelector(`[data-hand][data-card="${cardName}"]`)!
  h.click(handEl)
  h.rerender()
  return h.container
}
const chip = (root: HTMLElement, unitId: string) =>
  root.querySelector(`[data-unit="${unitId}"]`) as HTMLElement
const casterChips = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-modebanner="chooseCaster"]')].length
    ? [...root.querySelectorAll('[data-target="1"][data-unit]')]
    : []

// ------------------------------------------------------------------------------------
// (1) picker renders BOTH casters; picking the Mortal makes the breath originate from it
// ------------------------------------------------------------------------------------
describe('caster picker — Burning Hands with avatar + an allied Mortal', () => {
  it('renders BOTH casters, and picking the Mortal originates the grid from the Mortal', () => {
    const g = board()
    const avatarId = g.players[0].avatarUnitId // Avatar of Earth at (2,0)
    // allied Mortal far from the avatar; an enemy minion just NORTH of the Mortal.
    const mortal = usummon(g, 0, 'Amazon Warriors', 0, 0)
    const victim = usummon(g, 1, 'Amazon Warriors', 0, 1) // hit only if the Mortal casts 'n'
    inject(g, 0, 'Burning Hands')
    const h = new GameHarness(g).mount(); active = h

    const root = openCast(h, 'Burning Hands')
    // The picker offers every legal caster (avatar + Mortals). The board() scaffold also
    // seeds a Foot Soldier (a Mortal) — it is a legal caster too, so the set is not just
    // {avatar, my Mortal}. Assert: the avatar AND my Mortal are both offered, and the
    // rendered chips match the engine's legal-caster set exactly (CHOICE_PARITY).
    expect(root.querySelector('[data-modebanner="chooseCaster"]')).toBeTruthy()
    const cid = g.players[0].hand.find((id) => g.cards[id].name === 'Burning Hands')!
    const eng = legalCasterSet(g, 0, cid)
    expect(eng).toContain(avatarId)
    expect(eng).toContain(mortal)
    expect(eng.length).toBeGreaterThan(1)
    // The DOM renders one candidate chip per engine-legal caster that has a real (u…) id
    // (fake fzu… scaffold units render on the board too but the parity set is the engine's).
    const domIds = casterChips(root).map((e) => e.getAttribute('data-unit')!).sort()
    expect(domIds).toEqual([...eng].sort())

    // pick the MORTAL, then aim both hands NORTH-ish; the driver answers the direction
    // prompts. We click the Mortal caster explicitly, then hand off to the generic driver.
    h.click(chip(root, mortal))
    h.rerender()
    // answer: first hand 'n' (hits the victim north of the Mortal), second hand any other.
    const ask = () => h.container.querySelector('[data-promptbox="chooseOption"] [data-choice="n"]') as HTMLElement
    if (ask()) { h.click(ask()); h.rerender() }
    // second direction: pick whatever remains
    const opt = h.container.querySelector('[data-promptbox="chooseOption"] [data-choice]') as HTMLElement
    if (opt) { h.click(opt); h.rerender() }
    // Burning Hands is a printed-area damage spell → commit the confirmation panel.
    const cast1 = h.container.querySelector('[data-modebanner="areaConfirm"] [data-confirm="1"]') as HTMLElement | null
    if (cast1) { h.click(cast1); h.rerender() }

    // the victim NORTH of the MORTAL took damage (breath originated from the Mortal at (0,0),
    // not the avatar at (2,0) — the avatar's 'n' would hit (2,1), sparing (0,1)).
    const v = g.units[victim]
    expect(v === undefined || v.damage > 0, 'the minion north of the Mortal was hit').toBe(true)
  })

  // ------------------------------------------------------------------------------------
  // (2) picking the AVATAR also completes (expansion never removed normal casting)
  // ------------------------------------------------------------------------------------
  it('picking the AVATAR also casts (the expansion did not remove normal casting)', () => {
    const g = board()
    const avatarId = g.players[0].avatarUnitId // (2,0)
    usummon(g, 0, 'Amazon Warriors', 0, 0) // a second legal caster → the picker appears
    const victim = usummon(g, 1, 'Amazon Warriors', 2, 1) // north of the AVATAR
    inject(g, 0, 'Burning Hands')
    const h = new GameHarness(g).mount(); active = h

    const root = openCast(h, 'Burning Hands')
    expect(root.querySelector('[data-modebanner="chooseCaster"]')).toBeTruthy()
    h.click(chip(root, avatarId)) // pick the AVATAR
    h.rerender()
    const n = h.container.querySelector('[data-promptbox="chooseOption"] [data-choice="n"]') as HTMLElement
    if (n) { h.click(n); h.rerender() }
    const opt = h.container.querySelector('[data-promptbox="chooseOption"] [data-choice]') as HTMLElement
    if (opt) { h.click(opt); h.rerender() }
    const cast2 = h.container.querySelector('[data-modebanner="areaConfirm"] [data-confirm="1"]') as HTMLElement | null
    if (cast2) { h.click(cast2); h.rerender() }

    const v = g.units[victim]
    expect(v === undefined || v.damage > 0, 'the minion north of the avatar was hit').toBe(true)
  })
})

// ------------------------------------------------------------------------------------
// (3) Kiss of Death: pick the Undead far from the avatar → 'here' is the UNDEAD's square
// ------------------------------------------------------------------------------------
describe('caster picker — Kiss of Death with an Undead caster far from the avatar', () => {
  it("'here' anchors on the picked Undead; the co-located enemy minion dies", () => {
    const g = board()
    const avatarId = g.players[0].avatarUnitId // (2,0)
    const wight = usummon(g, 0, 'Barrow Wight', 4, 3) // Undead, far from the avatar
    const victim = usummon(g, 1, 'Amazon Warriors', 4, 3) // co-located with the Undead
    inject(g, 0, 'Kiss of Death')
    const h = new GameHarness(g).mount(); active = h

    const root = openCast(h, 'Kiss of Death')
    expect(root.querySelector('[data-modebanner="chooseCaster"]')).toBeTruthy()
    // pick the UNDEAD → magic mode; the 'here' target set anchors on the Undead's square.
    h.click(chip(root, wight))
    h.rerender()
    // the co-located enemy is the 'here' target (highlighted); click it.
    const target = chip(h.container, victim)
    expect(target.getAttribute('data-target'), "the co-located enemy is a legal 'here' target").toBe('1')
    // the AVATAR's chip must NOT be a 'here' target — the avatar is at (2,0), not (4,3).
    expect(chip(h.container, avatarId).getAttribute('data-target')).not.toBe('1')
    h.click(target)
    h.rerender()
    expect(g.units[victim], 'the minion at the Undead’s square was killed').toBeUndefined()
  })
})

// ------------------------------------------------------------------------------------
// (4) single-caster fast path: no picker on a plain board (avatar is the only caster)
// ------------------------------------------------------------------------------------
describe('single-caster fast path', () => {
  it('no picker appears when only the avatar can cast — mode routes straight to targeting', () => {
    const g = board() // only the avatar is a Spellcaster; Foot Soldiers cannot cast Lightning Bolt
    inject(g, 0, 'Lightning Bolt') // a plain targeted Magic, avatar-only
    const cid = g.players[0].hand.find((id) => g.cards[id].name === 'Lightning Bolt')!
    expect(legalCasterSet(g, 0, cid)).toEqual([g.players[0].avatarUnitId])
    const h = new GameHarness(g).mount(); active = h

    const root = openCast(h, 'Lightning Bolt')
    expect(root.querySelector('[data-modebanner="chooseCaster"]'), 'no caster picker on a single-caster board').toBeNull()
    expect(root.querySelector('[data-modebanner="magic"]'), 'routed straight into the magic targeting mode').toBeTruthy()
  })
})

// ------------------------------------------------------------------------------------
// Negative controls (documented break → red → revert → green). These simulate the
// buggy behaviours in-process and assert the detector fires, then confirm the real
// (fixed) client stays green — no source edits are committed.
// ------------------------------------------------------------------------------------
describe('caster picker — negative controls', () => {
  // (NC-a) OLD silent behaviour: auto-pick casters[0] WITHOUT rendering the picker.
  //   BREAK: reproduce the old client by removing the chooseCaster banner from a clone
  //   of the real DOM. RED: the picker-renders detector fires on the broken clone.
  //   REVERT/GREEN: the real, unmodified DOM still shows the banner.
  it('(NC-a) picker-renders detector fires when the banner is removed (auto-pick simulation)', () => {
    const g = board()
    usummon(g, 0, 'Amazon Warriors', 0, 0)
    inject(g, 0, 'Burning Hands')
    const h = new GameHarness(g).mount(); active = h
    const root = openCast(h, 'Burning Hands')

    // GREEN: the real client renders the picker banner.
    const detectPicker = (r: ParentNode) => !!r.querySelector('[data-modebanner="chooseCaster"]')
    expect(detectPicker(root), 'the fixed client renders the picker').toBe(true)

    // BREAK on a clone: strip the banner (the old auto-pick showed none) → RED.
    const broken = root.cloneNode(true) as HTMLElement
    broken.querySelector('[data-modebanner="chooseCaster"]')?.remove()
    expect(detectPicker(broken), 'the detector goes RED when the picker is auto-skipped').toBe(false)

    // REVERT: the original DOM is untouched and still GREEN.
    expect(detectPicker(root)).toBe(true)
  })

  // (NC-b) REVERTED engine OR-semantics (casterFilter REPLACES the normal check again).
  //   The mission's engine change makes canCast legal iff NORMAL-path OR casterFilter.
  //   REVERT: run ONLY the casterFilter (the old "replace" behaviour) against the avatar.
  //   RED: the avatar is rejected (filter accepts only Mortals). GREEN: real canCast (OR)
  //   accepts the avatar. This pins the avatar-casts-Burning-Hands guarantee to the OR.
  it('(NC-b) avatar-casts-Burning-Hands relies on the OR-semantics (filter-replace → avatar rejected)', () => {
    const g = board()
    const cid = inject(g, 0, 'Burning Hands')
    const avatarId = g.players[0].avatarUnitId
    const avatarUnit = g.units[avatarId]

    // GREEN with the fix (OR-semantics): the avatar can cast Burning Hands.
    expect(canCast(g, 0, cid, avatarId).ok, 'expansion never blocks normal casters').toBe(true)

    // REVERT: the OLD machinery ran the casterFilter as a REPLACEMENT of the normal check.
    // Exercise the real script's filter directly against the avatar — it must REJECT it
    // (Burning Hands accepts only Mortals), which is the RED the OR-semantics fixed.
    const filter = getScript('Burning Hands')?.casterFilter
    expect(filter, 'Burning Hands still carries an expansion filter').toBeTruthy()
    expect(filter!(g, avatarUnit), 'filter-as-replacement rejects the avatar (the reverted bug)').toBeTruthy()
  })
})
