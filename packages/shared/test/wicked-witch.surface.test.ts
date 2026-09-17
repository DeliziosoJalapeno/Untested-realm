// Wicked Witch: "Other nearby minions have -2 power." The curse only reaches SURFACE minions —
// a burrowed / submerged one nearby is out of range.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { effAttack } from '../src'

describe('Wicked Witch curses only surface minions', () => {
  it('a surface neighbour is -2, a burrowed neighbour is untouched', () => {
    const g: any = newGame(); keepBoth(g)
    summonCard(g, 0, 'Wicked Witch', 2, 2).enteredTurn = -5
    const surf = summonCard(g, 0, 'Stygian Archers', 2, 3); surf.enteredTurn = -5 // 3 power, surface, adjacent
    const sub = summonCard(g, 0, 'Stygian Archers', 2, 1); sub.enteredTurn = -5; sub.region = 'underground'

    expect(effAttack(g, g.units[surf.id]), 'surface neighbour cursed to 3-2=1').toBe(1)
    expect(effAttack(g, g.units[sub.id]), 'burrowed neighbour is untouched (still 3)').toBe(3)
  })
})
