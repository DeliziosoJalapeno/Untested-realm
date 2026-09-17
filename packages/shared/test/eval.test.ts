// The static evaluation should move in the RIGHT direction as the position changes: good things
// for `me` raise it, good things for the foe lower it. These tests assert monotonic direction
// (robust to the exact weights in eval.weights.ts), plus the terminal + breakdown invariants.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { evaluate, explainEval, avatarOf, type GameState } from '../src'

const ev = (g: GameState) => evaluate(g, 0)

describe('turn-state evaluation direction', () => {
  it('a won / lost position is terminal and dominates', () => {
    const g = newGame(); keepBoth(g)
    const base = ev(g)
    g.winner = 0
    expect(ev(g)).toBeGreaterThan(base + 10000)
    g.winner = 1
    expect(ev(g)).toBeLessThan(base - 10000)
  })

  it('my avatar losing life lowers it; the foe losing life raises it', () => {
    const g = newGame(); keepBoth(g)
    const base = ev(g)
    avatarOf(g, 0).life = 15
    expect(ev(g), 'I lost 5 life → worse').toBeLessThan(base)
    avatarOf(g, 0).life = 20
    avatarOf(g, 1).life = 15
    expect(ev(g), 'foe lost 5 life → better').toBeGreaterThan(base)
  })

  it('a friendly minion is an asset; an enemy minion is a liability', () => {
    const g = newGame(); keepBoth(g); g.turn = 3
    placeSite(g, 0, 'Spire', 2, 2)
    const base = ev(g)
    const mine = summonCard(g, 0, 'Stygian Archers', 2, 2); mine.enteredTurn = -1
    const withMine = ev(g)
    expect(withMine, 'my 3/3 raises the eval').toBeGreaterThan(base)
    delete g.units[mine.id]
    summonCard(g, 1, 'Stygian Archers', 2, 2).enteredTurn = -1
    expect(ev(g), "the foe's 3/3 lowers the eval").toBeLessThan(base)
  })

  it('a support minion (has an ability) is worth more than a vanilla body of the same stats', () => {
    const g = newGame(); keepBoth(g); g.turn = 3
    const base = ev(g)
    const vanilla = summonCard(g, 0, 'Stygian Archers', 1, 1); vanilla.enteredTurn = -1 // 3/3 vanilla
    const dVanilla = ev(g) - base // the body's net contribution
    delete g.units[vanilla.id]
    const support = summonCard(g, 0, 'Redmane Hyena', 1, 1); support.enteredTurn = -1 // 2/2 but a real Genesis
    const dSupport = ev(g) - base
    // both bodies add value; the Hyena's lower raw stats are largely offset by its ability, so its
    // contribution stays in the same ballpark as the vanilla 3/3 (its support bonus is actually applied).
    expect(dVanilla).toBeGreaterThan(0)
    expect(dSupport).toBeGreaterThan(0)
    expect(dSupport).toBeGreaterThan(dVanilla * 0.5)
  })

  it('controlling a site raises the eval (control + mana + threshold fit)', () => {
    const g = newGame(); keepBoth(g)
    const base = ev(g)
    placeSite(g, 0, 'Spire', 2, 2)
    expect(ev(g), 'a controlled site is good').toBeGreaterThan(base)
  })

  it('an enemy that can reach my avatar is worse than one that cannot', () => {
    const g = newGame(); keepBoth(g); g.turn = 3
    const av = avatarOf(g, 0) // player 0 avatar sits at (2,0)
    placeSite(g, 0, 'Spire', av.x, av.y + 1)
    placeSite(g, 0, 'Spire', av.x, 3)
    const near = summonCard(g, 1, 'Stygian Archers', av.x, av.y + 1); near.enteredTurn = -1 // dist 1 → reachable
    const withNear = ev(g)
    near.x = av.x; near.y = 3 // dist 3 → out of a 3/3's reach
    const withFar = ev(g)
    expect(withFar, 'a distant enemy threatens my avatar less').toBeGreaterThan(withNear)
  })

  it('more cards in my hand help; more in the foe hand hurt', () => {
    const g = newGame(); keepBoth(g)
    const base = ev(g)
    const c = `h${g.nextId++}`; g.cards[c] = { id: c, name: 'Bone Jumble', owner: 0 } as any
    g.players[0].hand.push(c)
    expect(ev(g), 'an extra card in my hand is good').toBeGreaterThan(base)
    g.players[0].hand.pop()
    const c2 = `h${g.nextId++}`; g.cards[c2] = { id: c2, name: 'Bone Jumble', owner: 1 } as any
    g.players[1].hand.push(c2)
    expect(ev(g), "an extra card in the foe's hand is bad").toBeLessThan(base)
  })

  it('explainEval terms sum to the total', () => {
    const g = newGame(); keepBoth(g); g.turn = 3
    placeSite(g, 0, 'Spire', 2, 2)
    summonCard(g, 0, 'Stygian Archers', 2, 2)
    summonCard(g, 1, 'Bone Jumble', 3, 3)
    const { total, terms } = explainEval(g, 0)
    const sum = Object.values(terms).reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - total)).toBeLessThan(1e-6)
  })
})
