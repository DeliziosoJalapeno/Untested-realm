// Thin Ice: 'At the end of your turn, if minions atop this site total 5 or more power, submerge them.'
// A submerged minion isn't ATOP the site — its power doesn't count toward the 5.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, waiveThreshold, act, settlePrompts } from './helpers'
import { type GameState } from '../src'
import '../src/cards/scripts/index'

function game(): GameState {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  for (const s of Object.values(g.sites)) delete g.sites[s.id]
  placeSite(g, 0, 'Thin Ice', 1, 1)
  return g
}

describe('Thin Ice ignores submerged minions', () => {
  it('submerged Coy Nixie (2) + Saracen Raiders (3) atop: only 3 power atop, Raiders stay on the surface', () => {
    const g = game()
    const nixie = summonCard(g, 0, 'Coy Nixie', 1, 1, 'underwater')
    const raiders = summonCard(g, 0, 'Saracen Raiders', 1, 1)
    act(g, 0, { t: 'endTurn' }); settlePrompts(g)
    expect(g.units[raiders.id]?.region).toBe('surface')
    expect(g.units[nixie.id]?.region).toBe('underwater')
  })

  it('same pair with the Nixie on the surface: 5 power atop, the ice breaks', () => {
    const g = game()
    const nixie = summonCard(g, 0, 'Coy Nixie', 1, 1)
    const raiders = summonCard(g, 0, 'Saracen Raiders', 1, 1)
    act(g, 0, { t: 'endTurn' }); settlePrompts(g)
    expect(g.units[nixie.id]?.region, 'Submerge: dives').toBe('underwater')
    expect(g.units[raiders.id], 'no Submerge: drowns').toBeUndefined()
  })
})
