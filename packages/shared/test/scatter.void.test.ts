// A push can't shove a unit into the void: its forced "one step" must reach a real adjacent LOCATION
// (a sited square), and a siteless square is the void, not a location (Windblast/Scatter FAQ). So
// Scatter never offers a void square, and can't banish a minion by pushing it off the map.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold, answer } from './helpers'
import { siteAt } from '../src'

describe('Scatter can not push into the void', () => {
  it('offers only sited squares, and the minion survives the push', () => {
    const g: any = newGame(); keepBoth(g); waiveThreshold(g, 0)
    const av = g.units[g.players[0].avatarUnitId]; av.x = 0; av.y = 3 // out of the way
    placeSite(g, 0, 'Active Volcano', 2, 1) // the minion's site
    placeSite(g, 0, 'Active Volcano', 2, 0) // the ONE legal push destination
    // (2,2), (1,1), (3,1) are left siteless → the void, and must NOT be offered
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); foe.enteredTurn = 0
    expect(siteAt(g, 2, 2), 'a neighbour that is the void').toBeNull()

    castMagic(g, 0, 'Scatter', { targets: ['sq:2,1,surface'] })

    const offered = (g.prompts[0]?.data?.squares ?? []) as { x: number; y: number }[]
    expect(offered.some((s) => s.x === 2 && s.y === 2), 'the void square is NOT an option').toBe(false)
    expect(offered.some((s) => s.x === 2 && s.y === 0), 'the sited square IS an option').toBe(true)

    answer(g, { x: 2, y: 0 }) // push onto the real location
    expect(g.units[foe.id], 'the minion is pushed, not banished into the void').toBeTruthy()
    expect([g.units[foe.id]?.x, g.units[foe.id]?.y]).toEqual([2, 0])
  })
})
