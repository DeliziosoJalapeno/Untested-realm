// Home-territory eval: home = columns b–d (x 1–3), your two back rows (seat 0 → y 0/1). Keep the enemy
// out of it, fill it before expanding, and respect Harbinger portent slots.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { explainEval, applyJudge, type GameState, type PlayerId } from '../src'

const terms = (g: GameState, me: PlayerId = 0) => explainEval(g, me).terms as Record<string, number>

describe('home-territory eval (seat 0)', () => {
  it('SEVERELY penalizes an enemy site inside my home, but not outside it', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 1, { k: 'placeSite', name: 'Accursed Tower', player: 1, x: 1, y: 0 }) // b1 — inside my home
    expect(terms(g).homeIntruded).toBeLessThan(0)

    const g2 = newGame(); keepBoth(g2)
    applyJudge(g2, 1, { k: 'placeSite', name: 'Accursed Tower', player: 1, x: 0, y: 3 }) // a4 — not my home
    expect(terms(g2).homeIntruded).not.toBeLessThan(0)
  })

  it('penalizes expanding outside home while home still has fillable voids', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: 0, y: 0 }) // a1 — outside home
    expect(terms(g).homePremature).toBeLessThan(0)
  })

  it('prizes planting on my Harbinger slot, penalizes planting on the enemy\'s', () => {
    const g = newGame(); keepBoth(g)
    g.flow = g.flow ?? {}
    g.flow.harbinger = { 0: [{ x: 2, y: 2 }], 1: [{ x: 3, y: 2 }] }
    applyJudge(g, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: 2, y: 2 }) // my portent
    applyJudge(g, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: 3, y: 2 }) // enemy portent
    expect(terms(g).harbingerOwnSlot).toBeGreaterThan(0)
    expect(terms(g).harbingerEnemySlot).toBeLessThan(0)
  })

  it('a home void that is an ENEMY Harbinger slot does not count as "home not full"', () => {
    const g = newGame(); keepBoth(g)
    // fill 5 of the 6 home squares; the 6th (b1) stays void but is an ENEMY portent slot
    for (const [x, y] of [[2, 0], [3, 0], [1, 1], [2, 1], [3, 1]] as const)
      applyJudge(g, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x, y })
    g.flow = g.flow ?? {}
    g.flow.harbinger = { 1: [{ x: 1, y: 0 }] } // b1 is the enemy's slot → not a "fillable" home void
    applyJudge(g, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: 0, y: 0 }) // a site outside home

    expect(terms(g).homePremature ?? 0).not.toBeLessThan(0) // no penalty — home is effectively full
  })
})
