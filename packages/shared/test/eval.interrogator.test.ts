// The evaluation directives for the Interrogator matchup + the general resource/nonlinear-life model.
// See memory: bot-eval-strategy-directives.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { evaluate, explainEval, avatarOf, DEFAULT_WEIGHTS as W, type GameState, type PlayerId } from '../src'
import { getCard } from '../src/cards/db'

const addFoeCard = (g: GameState) => {
  const c = `h${g.nextId++}`
  ;(g.cards as any)[c] = { id: c, name: 'Bone Jumble', owner: 1 }
  g.players[1].hand.push(c)
}

describe('Interrogator + resource evaluation directives', () => {
  it('an undefended avatar always carries a small penalty', () => {
    const g = newGame(); keepBoth(g)
    expect(explainEval(g, 0).terms.avatarUndefended).toBe(-W.avatarUndefended)
    // put a friendly body on the avatar's square → defended → no penalty
    const av = avatarOf(g, 0)
    summonCard(g, 0, 'Stygian Archers', av.x, av.y).enteredTurn = -1
    expect(explainEval(g, 0).terms.avatarUndefended).toBeUndefined()
  })

  it('the undefended penalty grows against an Interrogator and at death\'s door', () => {
    const g = newGame(); keepBoth(g)
    const base = -W.avatarUndefended
    expect(explainEval(g, 0).terms.avatarUndefended).toBe(base)

    avatarOf(g, 1).name = 'Interrogator' // facing an Interrogator → guard the avatar harder
    expect(explainEval(g, 0).terms.avatarUndefended).toBe(base - W.avatarUndefendedVsInterrogator)

    avatarOf(g, 1).name = 'Sparkmage' // reset foe
    const my = avatarOf(g, 0); my.life = 0; my.deathsDoor = true // one strike ends me
    expect(explainEval(g, 0).terms.avatarUndefended).toBe(base - W.avatarUndefendedDeathsDoor)
  })

  it('as the Interrogator pilot, pressure on the enemy avatar is rewarded (avatar aggression)', () => {
    const g = newGame(); keepBoth(g); g.turn = 3
    const foeAv = avatarOf(g, 1)
    const striker = summonCard(g, 0, 'Stygian Archers', foeAv.x, foeAv.y + 1) // dist 1 → can reach
    striker.enteredTurn = -1
    expect(explainEval(g, 0).terms.interrogatorAggression, 'no bonus for a normal pilot').toBeUndefined()
    avatarOf(g, 0).name = 'Interrogator'
    const t = explainEval(g, 0).terms.interrogatorAggression
    expect(t).toBeGreaterThan(0)
  })

  it('auras in play are valued by mana cost (mine positive, the foe\'s negative)', () => {
    const g = newGame(); keepBoth(g)
    const cost = getCard('Summoning Sphere').cost ?? 0
    ;(g.auras as any)['a1'] = { id: 'a1', cardId: 'x', name: 'Summoning Sphere', controller: 0 as PlayerId, squares: [{ x: 0, y: 0 }] }
    expect(explainEval(g, 0).terms.auraValue).toBe(W.auraCost * cost)
    ;(g.auras as any)['a1'].controller = 1
    expect(explainEval(g, 0).terms.auraValue).toBe(-W.auraCost * cost)
  })

  it('Abundance is valued by whose sites it boosts, not by who cast it', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 1, 1)
    placeSite(g, 0, 'Spire', 2, 1)
    placeSite(g, 1, 'Spire', 1, 2)
    placeSite(g, 1, 'Spire', 2, 2)
    placeSite(g, 1, 'Spire', 2, 3)
    const ab = (squares: { x: number; y: number }[]) => {
      ;(g.auras as any)['a1'] = { id: 'a1', cardId: 'x', name: 'Abundance', controller: 0 as PlayerId, squares }
      return explainEval(g, 0).terms.auraValue
    }
    const overMine = ab([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]) // my 2 sites
    const overFoe = ab([{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 3 }]) // their 3 sites
    expect(overMine, '+1 mana on each of my 2 sites').toBe(2 * W.siteMana)
    expect(overFoe, 'my Abundance over THEIR sites feeds them').toBe(-3 * W.siteMana)
    expect(overMine).toBeGreaterThan(overFoe)
  })

  it('a harmful area aura is good over the FOE\'s site, bad over mine (cast it on their terrain)', () => {
    const g = newGame(); keepBoth(g)
    ;(g.auras as any)['w1'] = { id: 'w1', cardId: 'x', name: 'Wildfire', controller: 0 as PlayerId, squares: [{ x: 3, y: 3 }] }
    placeSite(g, 1, 'Spire', 3, 3) // foe's site under the fire
    const overFoe = explainEval(g, 0).terms.auraValue
    expect(overFoe, 'burning the foe\'s site is good').toBeGreaterThan(0)
    // same fire, now sitting on MY site
    Object.values(g.sites).find((s) => s.x === 3 && s.y === 3)!.controller = 0
    const overMine = explainEval(g, 0).terms.auraValue
    expect(overMine, 'burning my own site is bad').toBeLessThan(0)
  })

  it('life is nonlinear: losing 3 HP near death hurts far more than losing 3 at full life', () => {
    const g = newGame(); keepBoth(g)
    const my = avatarOf(g, 0)
    const lifeDelta = (from: number, to: number) => { my.life = from; const a = evaluate(g, 0); my.life = to; const b = evaluate(g, 0); return b - a }
    const highLoss = lifeDelta(20, 17) // full life
    const lowLoss = lifeDelta(5, 2) // near death
    expect(highLoss).toBeLessThan(0)
    expect(lowLoss).toBeLessThan(highLoss) // losing HP when low is strictly worse
  })

  it('pay 3 life vs let them draw: pay at high life, let them draw when very low', () => {
    const decide = (life: number) => {
      const g = newGame(); keepBoth(g)
      const my = avatarOf(g, 0)
      // option A: I pay 3 life
      my.life = life - 3
      const pay = evaluate(g, 0)
      // option B: I keep my life, the Interrogator draws a card
      my.life = life
      addFoeCard(g)
      const draw = evaluate(g, 0)
      return pay - draw // >0 → paying is better
    }
    expect(decide(20), 'at full life, prefer paying 3').toBeGreaterThan(0)
    expect(decide(5), 'near death, prefer letting them draw').toBeLessThan(0)
  })
})
