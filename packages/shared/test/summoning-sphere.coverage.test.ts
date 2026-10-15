// Summoning Sphere "you may summon minions to affected sites" (reported: it let you summon minions
// ANYWHERE, e.g. Men of Leng onto any enemy site). The permission must be limited to sites the Sphere
// actually covers.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { validateSummonAt, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Summoning Sphere only opens its COVERED sites', () => {
  it('permits a summon onto a covered enemy site, but not an uncovered one', () => {
    const g: GameState = newGame(); keepBoth(g)
    const covered = placeSite(g, 1, 'Rustic Village', 3, 3)   // enemy sites (you don't control them)…
    const far = placeSite(g, 1, 'Rustic Village', 0, 0)
    covered.controller = 1; far.controller = 1

    // without the Sphere, you can't summon onto an enemy site at all
    expect(validateSummonAt(g, 0, 'Men of Leng', { x: 3, y: 3, region: 'surface' })).not.toBeNull()

    // your Summoning Sphere covers ONLY (3,3)
    g.cards['ssc'] = { id: 'ssc', name: 'Summoning Sphere', owner: 0 } as any
    g.auras['ss'] = { id: 'ss', cardId: 'ssc', name: 'Summoning Sphere', controller: 0, squares: [{ x: 3, y: 3 }] } as any

    expect(validateSummonAt(g, 0, 'Men of Leng', { x: 3, y: 3, region: 'surface' }), 'covered site → allowed').toBeNull()
    expect(validateSummonAt(g, 0, 'Men of Leng', { x: 0, y: 0, region: 'surface' }), 'uncovered site → still illegal').not.toBeNull()
  })
})
