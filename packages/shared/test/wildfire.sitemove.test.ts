// Wildfire is conjured ATOP A SITE and tracks its position + visited set by SITE ID, not by
// coordinate. So when a site is moved/relocated between turns, the fire follows it (burns the unit
// that travelled with the site) and does not treat a fresh site sliding into an old coordinate as
// already-visited.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx, siteAt, type GameState } from '../src'
import '../src/cards/scripts/index'

function injectWildfire(g: GameState, x: number, y: number): string {
  const cardId = `wf${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name: 'Wildfire', owner: 0 }
  const id = `wa${g.nextId++}`
  const site = siteAt(g, x, y)!
  ;(g.auras as any)[id] = { id, cardId, name: 'Wildfire', controller: 0, squares: [{ x, y }], onSiteId: site.id, counters: { [`s:${site.id}`]: 1 }, enteredTurn: 0 }
  return id
}

describe('Wildfire follows the site it sits on', () => {
  it('re-derives its position from the site — if the site moved, the fire burns at the new location', () => {
    const g = newGame(1, 0) as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 4, 3) // an unvisited neighbour of (4,4) so the fire spreads (stays alive) instead of burning out
    const wid = injectWildfire(g, 2, 2)
    const site = siteAt(g, 2, 2)!

    // The site (and a co-located unit) relocate to (4,4) — as a site-moving effect would do.
    const rider = summonCard(g, 1, 'Escyllion Cyclops', 4, 4); rider.enteredTurn = -1 // 6/6 survives 3
    site.x = 4; site.y = 4
    const strayNothing = summonCard(g, 1, 'Bone Jumble', 2, 2); strayNothing.enteredTurn = -1 // left behind at old coord

    getScript('Wildfire')!.endOfEveryTurn!(makeCtx(g, wid, 0, []))

    expect(g.auras[wid].squares[0], 'the fire moved with its site').toEqual({ x: 4, y: 4 })
    expect(g.units[rider.id]?.damage, 'the unit that travelled with the site is burned').toBe(3)
    expect(g.units[strayNothing.id]?.damage ?? 0, 'a unit left at the old coordinate is untouched').toBe(0)
  })
})
