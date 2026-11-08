// "Caster" Avatars (Frost Mage, Lavamancer): power 1, their strength a non-Tap ability behind an elemental
// threshold. The bot's eval wants their Tap on sites: moving/attacking while developing is wandering
// (weak Avatar, ×2), and ANY non-site Tap before the ability's threshold is met costs casterEarlyTap.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act } from './helpers'
import { explainEval, applyJudge, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

const terms = (g: GameState, me: PlayerId = 0) => explainEval(g, me).terms as Record<string, number>

function setup(avatar: string, siteNames: string[]): GameState {
  const g = newGame(); keepBoth(g)
  const av = g.units[g.players[0].avatarUnitId]
  av.name = avatar; g.cards[av.cardId].name = avatar
  const cells: [number, number][] = [[1, 0], [2, 0], [3, 0], [1, 1], [2, 1], [3, 1]]
  siteNames.forEach((name, i) => applyJudge(g, 0, { k: 'placeSite', name, player: 0, x: cells[i][0], y: cells[i][1] }))
  return g
}
/** the Avatar (at c1) steps to c2 — a real Move & Attack */
function walk(g: GameState) {
  const av = g.units[g.players[0].avatarUnitId]
  act(g, 0, { t: 'moveAttack', unitId: av.id, path: [{ x: av.x, y: av.y + 1, region: 'surface' }] })
}

describe('caster Avatars and their Tap', () => {
  for (const [avatar, short, met] of [
    ['Frost Mage', ['Spire', 'Stream'], ['Spire', 'Spire', 'Stream', 'Stream']],
    ['Lavamancer', ['Valley', 'Arid Desert'], ['Valley', 'Valley', 'Arid Desert', 'Arid Desert']],
  ] as const) {
    it(`${avatar}: walking while developing, threshold unmet → wander and early-tap penalties`, () => {
      const g = setup(avatar, [...short])
      expect(terms(g).casterEarlyTap ?? 0).toBe(0)
      walk(g)
      expect(g.flow.avatarRoamed?.[0]).toBe(g.turn)
      expect(terms(g).avatarWander).toBeLessThan(0)
      expect(terms(g).casterEarlyTap).toBeLessThan(0)
    })

    it(`${avatar}: with the threshold met, walking is only wandering`, () => {
      const g = setup(avatar, [...met])
      walk(g)
      expect(terms(g).avatarWander).toBeLessThan(0)
      expect(terms(g).casterEarlyTap ?? 0).toBe(0)
    })
  }

  it('a site play is not a non-site Tap', () => {
    const g = setup('Frost Mage', ['Spire'])
    g.units[g.players[0].avatarUnitId].tapped = true // as if it had just played a site
    expect(terms(g).casterEarlyTap ?? 0).toBe(0)
    expect(terms(g).avatarWander ?? 0).toBe(0)
  })

  it('other Avatars are untouched', () => {
    const g = setup('Sorcerer', ['Spire'])
    walk(g)
    expect(terms(g).casterEarlyTap ?? 0).toBe(0)
  })
})
