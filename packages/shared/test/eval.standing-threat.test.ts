// Bot eval: an enemy minion that can strike my avatar turn after turn is a standing threat whether it is
// tapped or not, and a worse one when nothing of mine can strike it back. Off (weight 0) by default.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { explainEval } from '../src/bot/eval'
import { DEFAULT_WEIGHTS } from '../src/bot/eval.weights'

const W = { ...DEFAULT_WEIGHTS, standingThreat: 10, standingThreatUnanswered: 15 }

describe('standing-threat eval', () => {
  it('is off by default', () => {
    const g: any = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    summonCard(g, 1, 'Escyllion Cyclops', av.x, av.y + 1)
    expect(explainEval(g, 0).terms.standingThreat).toBeUndefined()
  })

  it('counts a TAPPED enemy minion next to my avatar; my avatar striking back makes it "answered"', () => {
    const g: any = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    const foe = summonCard(g, 1, 'Escyllion Cyclops', av.x, av.y + 1); foe.tapped = true
    const t = explainEval(g, 0, W).terms.standingThreat ?? 0
    expect(t).toBeLessThan(0)
    // far away it threatens nothing
    foe.y = av.y + 4 > 3 ? av.y - 4 : av.y + 4
    if (Math.abs(foe.y - av.y) >= 3) expect(explainEval(g, 0, W).terms.standingThreat).toBeUndefined()
  })

  it('weighs a ranged minion I cannot strike back more than one I can', () => {
    const g: any = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    const dir = av.y >= 2 ? -1 : 1
    const archers = summonCard(g, 1, 'Stygian Archers', av.x, av.y + 2 * dir) // shoots from two squares away
    const unanswered = explainEval(g, 0, W).terms.standingThreat ?? 0
    archers.y = av.y + dir // adjacent: my avatar can strike it
    const answered = explainEval(g, 0, W).terms.standingThreat ?? 0
    expect(answered).toBeLessThan(0)
    expect(unanswered).toBeLessThan(answered)
  })
})
