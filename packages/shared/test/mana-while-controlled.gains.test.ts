// Oct 2026 "mana follows control": a mana source GAINED mid-turn provides its mana immediately (FAQ).
// Gains are credited at their ENTRY POINT (not via the loss-only reconcile, which would double-pay
// effects that already self-credit on entry). Two gaps are now covered: a site placed from the EDITOR,
// and an Abundance aura entering over sites you already control. Plus a guard that the loss direction and
// the no-double-credit invariant still hold.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, castMagic, waiveThreshold } from './helpers'
import { reconcileControlledMana, sourceMana } from '../src/engine/turn'
import { applyJudge } from '../src/engine/judge'
import type { GameState, PlayerId } from '../src'

function readyTurn(): GameState {
  const g: any = newGame(); keepBoth(g)
  g.phase = 'main'; g.activePlayer = 0
  g.flow = g.flow ?? {}
  g.flow.manaBase = { 0: sourceMana(g, 0), 1: sourceMana(g, 1) }
  return g
}
function rawSite(g: GameState, p: PlayerId, name: string, x: number, y: number): void {
  const cid = `cS${g.nextId++}`; (g as any).cards[cid] = { id: cid, name, owner: p }
  const sid = `sS${g.nextId++}`
  ;(g as any).sites[sid] = { id: sid, cardId: cid, name, owner: p, controller: p, x, y, tapped: false, isRubble: false }
}

describe('mid-turn mana gains credited at entry (mana follows control)', () => {
  it('an editor-placed site (Sinkhole) provides its mana right away', () => {
    const g = readyTurn()
    const before = g.players[0].mana
    applyJudge(g, 0, { k: 'placeSite', name: 'Sinkhole', player: 0, x: 1, y: 1 } as any)
    expect(g.players[0].mana - before, 'Sinkhole provides 1 mana now').toBe(1)
  })

  it('casting Abundance credits its boost immediately for the sites it covers', () => {
    // covered-site run
    const g = readyTurn()
    rawSite(g, 0, 'Rustic Village', 1, 1)
    waiveThreshold(g, 0)
    const before = g.players[0].mana
    castMagic(g, 0, 'Abundance', { at: { x: 1, y: 1 } })
    const aura = Object.values(g.auras).find((a: any) => a.name === 'Abundance') as any
    const covered = aura.squares.filter((sq: any) => Object.values(g.sites).some((s: any) => s.controller === 0 && s.x === sq.x && s.y === sq.y && !s.isRubble)).length
    const delta = g.players[0].mana - before

    // baseline run: identical cast with NO site under the aura → isolates the +credit from the spell's cost
    const g2 = readyTurn(); waiveThreshold(g2, 0)
    const b2 = g2.players[0].mana
    castMagic(g2, 0, 'Abundance', { at: { x: 1, y: 1 } })
    const baseline = g2.players[0].mana - b2

    expect(covered, 'Abundance actually covers the controlled site').toBeGreaterThan(0)
    expect(delta - baseline, 'each covered controlled site added 1 mana immediately').toBe(covered)
  })

  it('a normally-played / self-crediting source is NOT double-paid by reconcile', () => {
    const g = readyTurn()
    const before = g.players[0].mana
    rawSite(g, 0, 'Rustic Village', 1, 1) // raw insert (no entry credit) — reconcile must NOT pay a gain
    reconcileControlledMana(g)
    expect(g.players[0].mana - before, 'reconcile is loss-only: a raw gain is not credited here').toBe(0)
  })

  it('still reclaims a LOST source mid-turn', () => {
    const g = readyTurn()
    g.players[0].mana = 10 // a pool to reclaim from (reclaim floors at 0 / at what's been spent)
    rawSite(g, 0, 'Rustic Village', 1, 1)
    reconcileControlledMana(g) // re-syncs the baseline to include it
    const before = g.players[0].mana
    for (const s of Object.values(g.sites)) if ((s as any).x === 1 && (s as any).y === 1) delete g.sites[(s as any).id]
    reconcileControlledMana(g)
    expect(g.players[0].mana - before, 'losing the site reclaims its mana').toBe(-1)
  })
})
