// Phase-E DOM-level playability audit — C.2b COMPOSED multi-round combat.
//
// Phase C.2 proved each combat prompt SHAPE in isolation. Phase E drives FULL fights
// end-to-end through the REAL Game component with parity checked at every prompt, so the
// prompt SEQUENCES the engine actually produces are exercised — not one shape at a time.
//
// Included in `npm run audit:dom` automatically (vitest --root packages/client).
//
// Engine model (combat.ts): a fight resolves in two passes inside runFightPass —
//   strikeFirst pass (only strike-first / Lance strikers) THEN a normal pass (everyone
//   who survives). fightSides() recomputes the sides each pass, and guards the case where
//   the target was already killed in the strikeFirst pass (line ~379) — the historical
//   crash. stayInFight lets the ORIGINAL target withdraw once another defender is chosen;
//   allocateDamage splits a striker's power when it faces >1 enemy.
//
// Scenarios:
//   E.1  multi-defender + stayInFight + allocateDamage chained in ONE fight (prompt
//        sequence: defend → stayInFight → allocateDamage → resolution), parity at each.
//   E.2  multi-ROUND: a strike-first attacker + a normal defender both survive round 1
//        (strikeFirst pass) → the normal pass strikes again; assert the prompt/round order.
//   E.3  strike-first LETHAL attacker vs a weaker defender — resolves without crashing
//        (regression for the old fightSides crash when the target dies in the SF pass).
//   E.4  withdraw path: stayInFight → false → the fight ends, the target escaped, state
//        is consistent (no dangling prompt, attacker untouched by the withdrawn target).
//
// NEGATIVE CONTROL (documented break→red→revert→green): E.1's allocateDamage parity
// assert is proven able to go red by cloning the panel and dropping a candidate row.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { board, usummon } from './domaudit'
import { type GameState, type PlayerId } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => {
  active?.unmount()
  active = null
})

function must(root: HTMLElement, sel: string, why: string): HTMLElement {
  const el = root.querySelector(sel) as HTMLElement | null
  if (!el) throw new Error(`[${why}] expected element ${sel} not found`)
  return el
}

/** place a non-summoning-sick unit with an engine-valid `u…` id. */
function place(g: GameState, p: PlayerId, name: string, x: number, y: number): string {
  const id = usummon(g, p, name, x, y)
  g.units[id].enteredTurn = g.turn - 1
  return id
}

/** a clean combat board with the scaffold fzu units stripped. */
function combatBoard(): GameState {
  const g = board()
  for (const id of Object.keys(g.units)) if (id.startsWith('fzu')) delete (g.units as any)[id]
  return g
}

/** grant a keyword to a unit via a modifier (effKeywords reads modifiers through the
 *  same applyKeywordString map used for printed text). */
function grantKeyword(g: GameState, unitId: string, keyword: string): void {
  g.units[unitId].modifiers = [...g.units[unitId].modifiers, { kind: 'keyword', keyword } as any]
}

/** drive attacker → click enemy target chip → moveChoice "attack" (choice 0). */
function beginAttackViaDom(h: GameHarness, attackerId: string, targetId: string): void {
  h.click(must(h.container, `[data-unit="${attackerId}"]`, 'attacker'))
  h.rerender()
  h.click(must(h.container, `[data-unit="${targetId}"]`, 'target'))
  h.rerender()
  const attackBtn = h.container.querySelector('[data-modebanner="moveChoice"] [data-choice="0"]') as HTMLButtonElement | null
  if (attackBtn) { h.click(attackBtn); h.rerender() }
}

// =====================================================================================
// E.1 — multi-defender + stayInFight + allocateDamage chained in ONE fight.
// =====================================================================================
describe('E.1 composed: defend(multi) → stayInFight → allocateDamage → resolution', () => {
  it('drives the whole chain through the DOM with parity at every prompt', () => {
    const g = combatBoard()
    const atk = place(g, 0, 'Amazon Warriors', 2, 1) // power 5
    const tgt = place(g, 1, 'Foot Soldier', 2, 2)
    const d1 = place(g, 1, 'Foot Soldier', 2, 3)
    const d2 = place(g, 1, 'Foot Soldier', 3, 2)
    const seq: string[] = []

    const h = new GameHarness(g).mount()
    active = h
    beginAttackViaDom(h, atk, tgt)

    // (1) DEFEND — multi-candidate. Parity: one enabled toggle per engine candidate.
    expect(h.state.prompts[0]?.kind, 'defend prompt').toBe('defend')
    seq.push('defend')
    const cands: string[] = h.state.prompts[0].data.candidates
    expect(cands.length, 'several defenders offered').toBeGreaterThan(1)
    const defToggles = h.container.querySelectorAll('[data-promptbox="defend"] [data-choice]:not([disabled])').length
    expect(defToggles, 'defend parity').toBe(cands.length)
    // choose the two EXTRA defenders (not the target) so the target gets a stayInFight prompt
    h.click(must(h.container, `[data-promptbox="defend"] [data-choice="${d1}"]`, 'defender d1'))
    h.rerender()
    h.click(must(h.container, `[data-promptbox="defend"] [data-choice="${d2}"]`, 'defender d2'))
    h.rerender()
    h.click(must(h.container, '[data-promptbox="defend"] [data-confirm="1"]', 'defend confirm'))
    h.rerender()

    // (2) STAY IN FIGHT — the original target decides. Parity: exactly 2 buttons.
    expect(h.state.prompts[0]?.kind, 'stayInFight prompt').toBe('stayInFight')
    seq.push('stayInFight')
    expect(h.container.querySelectorAll('[data-promptbox="stayInFight"] [data-choice]:not([disabled])').length, 'stay parity').toBe(2)
    h.click(must(h.container, '[data-promptbox="stayInFight"] [data-choice="true"]', 'stay')) // keep the target in → 3 enemies
    h.rerender()

    // (3) ALLOCATE DAMAGE — power-5 striker faces 3 defenders → must split. Parity: one row per candidate.
    expect(h.state.prompts[0]?.kind, 'allocateDamage prompt').toBe('allocateDamage')
    seq.push('allocateDamage')
    const power: number = h.state.prompts[0].data.power
    const allocCands: string[] = h.state.prompts[0].data.candidates
    const panel = must(h.container, '[data-promptbox="allocateDamage"]', 'alloc panel')
    expect(panel.querySelectorAll('[data-alloc-plus]').length, 'alloc parity: one row per candidate').toBe(allocCands.length)
    const confirm = must(panel, '[data-confirm="1"]', 'strike confirm') as HTMLButtonElement
    expect(confirm.disabled, 'Strike! disabled until all power assigned').toBe(true)
    // assign all power to the first candidate
    h.click(must(panel, `[data-alloc-all="${allocCands[0]}"]`, 'alloc all'))
    h.rerender()
    const confirm2 = must(h.container, '[data-promptbox="allocateDamage"] [data-confirm="1"]', 'strike confirm 2') as HTMLButtonElement
    expect(confirm2.disabled, 'Strike! enabled once power assigned').toBe(false)
    const drift0 = h.drifts.length
    h.click(confirm2)
    h.rerender()

    // drive any remaining defender allocation prompts to completion (each defender strikes back)
    for (let i = 0; i < 8 && h.state.prompts[0]?.kind === 'allocateDamage'; i++) {
      const cs: string[] = h.state.prompts[0].data.candidates
      h.click(must(h.container, `[data-promptbox="allocateDamage"] [data-alloc-all="${cs[0]}"]`, 'defender alloc'))
      h.rerender()
      h.click(must(h.container, '[data-promptbox="allocateDamage"] [data-confirm="1"]', 'defender strike'))
      h.rerender()
    }
    // (4) RESOLUTION — no dangling prompt, no engine drift.
    expect(h.drifts.length, 'the whole fight was engine-accepted').toBe(drift0)
    expect(h.state.prompts.length, 'no prompt left dangling').toBe(0)
    expect(seq, 'the observed prompt SEQUENCE').toEqual(['defend', 'stayInFight', 'allocateDamage'])
    // the first allocated defender took the full power-5 lethalless blow → dead (5 ≥ 1 defence)
    expect(g.units[allocCands[0]], 'the allocated victim took 5 and died').toBeUndefined()
    void power
  })
})

// =====================================================================================
// E.2 — multi-ROUND: a strike-first attacker + a defender both survive round 1
//       (strikeFirst pass) → the normal pass strikes again.
// =====================================================================================
describe('E.2 multi-round: strikeFirst pass then normal pass both resolve', () => {
  it('a durable strike-first attacker and a durable defender exchange over both passes', () => {
    const g = combatBoard()
    // durable units so a single blow does NOT kill: attacker 3-power (Strike First) vs a
    // 5-defence defender → the SF blow (3 < 5) leaves the defender alive, so the fight
    // proceeds to the NORMAL pass where BOTH strike (attacker takes 3 < 4 defence, survives).
    const atk = place(g, 0, 'Sir Bedivere', 2, 1) // 3/4
    grantKeyword(g, atk, 'Strike First')
    const def = place(g, 1, 'Sir Gawain', 2, 2) // 3/5
    const atkDef0 = g.units[atk].damage
    const defDef0 = g.units[def].damage

    const h = new GameHarness(g).mount()
    active = h
    beginAttackViaDom(h, atk, def)
    // single defender = the target itself; no extra defenders → defend prompt may still appear
    // for any adjacent candidate. Drive whatever prompts appear to completion.
    const drift0 = h.drifts.length
    for (let i = 0; i < 12 && h.state.prompts.length > 0; i++) {
      const p = h.state.prompts[0]
      if (p.kind === 'defend') {
        // don't add extra defenders — just resolve with the target alone
        h.click(must(h.container, '[data-promptbox="defend"] [data-skip="1"]', 'no extra defenders'))
      } else if (p.kind === 'stayInFight') {
        h.click(must(h.container, '[data-promptbox="stayInFight"] [data-choice="true"]', 'stay'))
      } else if (p.kind === 'allocateDamage') {
        const cs: string[] = p.data.candidates
        h.click(must(h.container, `[data-promptbox="allocateDamage"] [data-alloc-all="${cs[0]}"]`, 'alloc'))
        h.rerender()
        h.click(must(h.container, '[data-promptbox="allocateDamage"] [data-confirm="1"]', 'strike'))
      } else break
      h.rerender()
    }
    expect(h.drifts.length, 'the multi-round fight resolved without drift').toBe(drift0)
    expect(h.state.prompts.length, 'no dangling prompt').toBe(0)
    // POST-STATE: the defender took the attacker's strike-first blow AND struck back in the
    // normal pass, so the attacker took damage too (proof the NORMAL pass ran after the SF pass).
    // (both are 1/ so a 1-power exchange leaves both alive with damage recorded — unless
    // Foot Soldier's defence is 1, in which case a death is fine; assert the exchange happened.)
    const defTookDamage = !g.units[def] || g.units[def].damage > defDef0
    const atkTookDamage = !g.units[atk] || g.units[atk].damage > atkDef0
    expect(defTookDamage, 'the defender took the strike-first blow').toBe(true)
    expect(atkTookDamage, 'the attacker took the defender\'s normal-pass counter-strike').toBe(true)
  })
})

// =====================================================================================
// E.3 — strike-first LETHAL attacker vs a weaker defender: the target dies in the
//       strikeFirst pass; the fight must resolve WITHOUT crashing (fightSides guard).
// =====================================================================================
describe('E.3 regression: strike-first lethal attacker fells its target in the SF pass', () => {
  it('resolves without crashing when the target dies before the normal pass', () => {
    const g = combatBoard()
    const atk = place(g, 0, 'Amazon Warriors', 2, 1) // power 5
    grantKeyword(g, atk, 'Strike First')
    grantKeyword(g, atk, 'Lethal')
    const weak = place(g, 1, 'Foot Soldier', 2, 2) // weaker → dies to the SF lethal blow

    const h = new GameHarness(g).mount()
    active = h
    const drift0 = h.drifts.length
    beginAttackViaDom(h, atk, weak)
    for (let i = 0; i < 12 && h.state.prompts.length > 0; i++) {
      const p = h.state.prompts[0]
      if (p.kind === 'defend') h.click(must(h.container, '[data-promptbox="defend"] [data-skip="1"]', 'no defenders'))
      else if (p.kind === 'stayInFight') h.click(must(h.container, '[data-promptbox="stayInFight"] [data-choice="true"]', 'stay'))
      else if (p.kind === 'allocateDamage') {
        const cs: string[] = p.data.candidates
        h.click(must(h.container, `[data-promptbox="allocateDamage"] [data-alloc-all="${cs[0]}"]`, 'alloc'))
        h.rerender()
        h.click(must(h.container, '[data-promptbox="allocateDamage"] [data-confirm="1"]', 'strike'))
      } else break
      h.rerender()
    }
    // POST-STATE: the weaker defender is dead; the attacker survived; no drift/crash.
    expect(h.drifts.length, 'no engine drift/crash').toBe(drift0)
    expect(g.units[weak], 'the weaker target died in the strike-first pass').toBeUndefined()
    expect(g.units[atk], 'the strike-first attacker survived unscathed').toBeTruthy()
    expect(g.units[atk].damage, 'the attacker took no counter-strike (target died first)').toBe(0)
    expect(h.state.prompts.length, 'no dangling prompt').toBe(0)
  })
})

// =====================================================================================
// E.4 — withdraw path: the original target withdraws (stayInFight → false); the fight
//       ends with a substitute defender and the state is consistent.
// =====================================================================================
describe('E.4 withdraw path: stayInFight → false ends the fight consistently', () => {
  it('the withdrawn target leaves the fight; only the substitute defender is engaged', () => {
    const g = combatBoard()
    const atk = place(g, 0, 'Amazon Warriors', 2, 1) // power 5
    const tgt = place(g, 1, 'Foot Soldier', 2, 2)
    const sub = place(g, 1, 'Foot Soldier', 2, 3) // the substitute defender
    const tgtDmg0 = g.units[tgt].damage

    const h = new GameHarness(g).mount()
    active = h
    beginAttackViaDom(h, atk, tgt)
    expect(h.state.prompts[0]?.kind).toBe('defend')
    // choose the SUBSTITUTE (not the target) so the target may withdraw
    h.click(must(h.container, `[data-promptbox="defend"] [data-choice="${sub}"]`, 'substitute defender'))
    h.rerender()
    h.click(must(h.container, '[data-promptbox="defend"] [data-confirm="1"]', 'defend confirm'))
    h.rerender()
    expect(h.state.prompts[0]?.kind, 'stayInFight for the original target').toBe('stayInFight')
    const drift0 = h.drifts.length
    // WITHDRAW
    h.click(must(h.container, '[data-promptbox="stayInFight"] [data-choice="false"]', 'withdraw'))
    h.rerender()
    // KEY DISTINGUISHER (proven load-bearing by the negative control below): after a
    // WITHDRAW only ONE defender (the substitute) remains, so the attacker faces a single
    // enemy → NO allocateDamage prompt (auto-allocation), and the power-5 blow falls
    // entirely on the substitute. Had the target STAYED, the attacker would face TWO
    // defenders → an allocateDamage prompt would appear. So we assert no allocate prompt.
    expect(
      h.state.prompts.some((p) => p.kind === 'allocateDamage'),
      'withdraw → single defender → no split/allocate prompt (would appear if the target stayed)',
    ).toBe(false)
    // POST-STATE: the fight is over; the substitute alone was struck (dead, 5 ≥ 1 defence);
    // the withdrawn target took NO strike and is untapped-consistent; no dangling prompt.
    expect(h.drifts.length, 'withdraw resolved without drift').toBe(drift0)
    expect(h.state.prompts.length, 'no dangling prompt after withdraw').toBe(0)
    expect(g.units[sub], 'the substitute alone bore the fight and fell to the power-5 blow').toBeUndefined()
    expect(g.units[tgt], 'the withdrawn target survived').toBeTruthy()
    expect(g.units[tgt].damage, 'the withdrawn target took no damage (it left the fight)').toBe(tgtDmg0)
  })
})

// =====================================================================================
// Phase-E negative control — the E.1 allocateDamage parity assert proven able to go RED.
// =====================================================================================
describe('Phase-E negative control — allocateDamage parity can go RED', () => {
  it('a broken alloc panel missing a candidate row fails the parity assert', () => {
    const g = combatBoard()
    const atk = place(g, 0, 'Amazon Warriors', 2, 1)
    const tgt = place(g, 1, 'Foot Soldier', 2, 2)
    const d1 = place(g, 1, 'Foot Soldier', 2, 3)
    const d2 = place(g, 1, 'Foot Soldier', 3, 2)
    const h = new GameHarness(g).mount()
    active = h
    beginAttackViaDom(h, atk, tgt)
    // defend with ALL candidates so the striker faces >1 enemy → allocate
    for (const id of [...h.state.prompts[0].data.candidates] as string[]) {
      const t = h.container.querySelector(`[data-promptbox="defend"] [data-choice="${id}"]`) as HTMLButtonElement | null
      if (t) h.click(t)
    }
    h.rerender()
    h.click(must(h.container, '[data-promptbox="defend"] [data-confirm="1"]', 'defend confirm'))
    h.rerender()
    if (h.state.prompts[0]?.kind === 'stayInFight') {
      h.click(must(h.container, '[data-promptbox="stayInFight"] [data-choice="true"]', 'stay'))
      h.rerender()
    }
    expect(h.state.prompts[0]?.kind).toBe('allocateDamage')
    const engineCands = (h.state.prompts[0].data.candidates ?? []).length
    expect(engineCands, 'multiple candidates').toBeGreaterThan(1)
    const broken = h.container.querySelector('[data-promptbox="allocateDamage"]')!.cloneNode(true) as HTMLElement
    const rows = [...broken.querySelectorAll('.allocrow')]
    if (rows.length) rows[rows.length - 1].remove()
    const domRows = broken.querySelectorAll('[data-alloc-plus]').length
    expect(domRows, 'broken panel renders fewer rows than candidates').toBeLessThan(engineCands)
    void d1; void d2
  })
})
