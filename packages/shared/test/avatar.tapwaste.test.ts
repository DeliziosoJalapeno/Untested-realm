// A developing avatar's single Tap belongs on site development. A non-site Tap ability (Sorcerer's
// "Draw a spell") is BANNED for the bot below 4 sites, and eval-penalised on a gradient above that.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { expandActions, explainEval, applyJudge, type GameState, type PlayerId } from '../src'

const asSorcerer = (g: GameState, seat: PlayerId) => { g.units[g.players[seat].avatarUnitId]!.name = 'Sorcerer' }
const sites = (g: GameState, seat: PlayerId, n: number) => {
  const cells: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1]]
  for (let i = 0; i < n; i++) applyJudge(g, seat, { k: 'placeSite', name: 'Accursed Tower', player: seat, x: cells[i][0], y: cells[i][1] })
}
const hasDrawSpell = (g: GameState, seat: PlayerId) =>
  expandActions(g as GameState, seat).some((e) => e.action.t === 'activate' && (e.action as any).ability === 'drawSpell')

describe('avatar non-site Tap ability — bot ban under 4 sites', () => {
  it('is NOT offered below 4 sites, but IS at 4+', () => {
    const g = newGame(); keepBoth(g); asSorcerer(g, 0)
    sites(g, 0, 3)
    expect(hasDrawSpell(g, 0)).toBe(false) // 3 sites → banned

    const g2 = newGame(); keepBoth(g2); asSorcerer(g2, 0)
    sites(g2, 0, 4)
    expect(hasDrawSpell(g2, 0)).toBe(true) // 4 sites → allowed (eval takes over)
  })
})

describe('avatar non-site Tap ability — eval avatarTapWaste gradient', () => {
  const term = (n: number) => {
    const g = newGame(); keepBoth(g)
    sites(g, 0, n)
    g.flow = g.flow ?? {}
    g.flow.avatarTapAbility = { 0: g.turn } // the avatar tapped for a non-site ability this turn
    return (explainEval(g as GameState, 0).terms as Record<string, number>).avatarTapWaste ?? 0
  }

  it('heavy under 5 sites, moderate at 5, slight at 6, NOTHING above 6', () => {
    const heavy = term(4)
    const moderate = term(5)
    const slight = term(6)
    expect(heavy).toBeLessThan(0)
    expect(moderate).toBeLessThan(0)
    expect(slight).toBeLessThan(0)
    expect(heavy).toBeLessThan(moderate)   // heavier (more negative) under 5
    expect(moderate).toBeLessThan(slight)  // slighter (less negative) at 6
    expect(term(7)).toBe(0)                // fully developed (> 6 sites) → no penalty
  })

  it('does not fire when the avatar did not tap for an ability this turn', () => {
    const g = newGame(); keepBoth(g)
    sites(g, 0, 4)
    expect((explainEval(g as GameState, 0).terms as Record<string, number>).avatarTapWaste ?? 0).toBe(0)
  })
})
