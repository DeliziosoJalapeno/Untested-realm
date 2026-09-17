// Saracen Raiders / Scout: "May be cast to any site without enemies." This is an ADDITIVE permission —
// it never removes the normal ability to summon onto your OWN sites; it only grants the extra option of
// casting to any OTHER (enemy/neutral) site that holds no enemy of yours.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { validateSummonAt, type GameState } from '../src'

describe('Saracen "cast to any site without enemies" only ADDS locations', () => {
  it('still casts onto YOUR own site — even one an enemy is standing on (like any minion)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)  // your site
    summonCard(g, 1, 'Foot Soldier', 2, 2)   // an enemy standing on it
    // Saracen is legal here — and so is a normal minion (parity: your site, enemy present)
    expect(validateSummonAt(g, 0, 'Saracen Raiders', { x: 2, y: 2, region: 'surface' })).toBeNull()
    expect(validateSummonAt(g, 0, 'Foot Soldier', { x: 2, y: 2, region: 'surface' })).toBeNull()
  })

  it('ADDS enemy-free foreign sites, where a normal minion could NOT be cast', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 1, 'Rustic Village', 3, 3)  // the opponent's site, empty
    expect(validateSummonAt(g, 0, 'Saracen Scout', { x: 3, y: 3, region: 'surface' })).toBeNull()
    // the extra reach is the whole point — a normal minion can't be summoned onto an enemy site
    expect(validateSummonAt(g, 0, 'Foot Soldier', { x: 3, y: 3, region: 'surface' })).not.toBeNull()
  })

  it('a foreign site WITH an enemy is not a legal added location', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 1, 'Rustic Village', 3, 3)
    summonCard(g, 1, 'Foot Soldier', 3, 3)   // enemy on the opponent's site
    expect(validateSummonAt(g, 0, 'Saracen Raiders', { x: 3, y: 3, region: 'surface' })).not.toBeNull()
  })
})
