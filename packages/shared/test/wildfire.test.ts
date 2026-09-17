import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'
import { siteAt, type GameState } from '../src'

// Wildfire: "At the end of each turn, each unit here takes 3 damage, then move
// Wildfire to an adjacent location it hasn't visited before." It is an AURA, and
// auras were never dispatched their endOfEveryTurn hook — so Wildfire did nothing
// ("completely broken, does not move"). Now auras fire end-of-turn too.

function injectWildfire(g: GameState, x: number, y: number): string {
  const cardId = `wf${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name: 'Wildfire', owner: 0 }
  const id = `wa${g.nextId++}`
  const site = siteAt(g, x, y)
  ;(g.auras as any)[id] = { id, cardId, name: 'Wildfire', controller: 0, squares: [{ x, y }], onSiteId: site?.id, counters: site ? { [`s:${site.id}`]: 1 } : {} }
  return id
}

describe('Wildfire moves and burns at the end of each turn', () => {
  it('deals 3 damage to units here and then spreads to an adjacent unvisited site', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    placeSite(g, 0, 'Active Volcano', 3, 2) // the one unvisited neighbour with a site
    const auraId = injectWildfire(g, 2, 2)
    const victim = summonCard(g, 1, 'Bone Jumble', 2, 2); victim.enteredTurn = 0 // 1/1, dies to 3

    act(g, 0, { t: 'endTurn' })

    expect(g.units[victim.id], 'the unit under the fire is burned to death').toBeUndefined()
    const p = g.prompts[0]
    expect(p?.title, 'Wildfire asks where to spread').toMatch(/Wildfire/)
    answer(g, { x: 3, y: 2 })

    expect(g.auras[auraId].squares[0], 'the fire leapt to the chosen site').toEqual({ x: 3, y: 2 })
    const newSite = siteAt(g, 3, 2)!
    expect(g.auras[auraId].onSiteId, 'the fire is now anchored to the new site').toBe(newSite.id)
    expect(g.auras[auraId].counters?.[`s:${newSite.id}`], 'the new site is marked visited by id').toBe(1)
  })

  it('dispels (to the cemetery) when no unvisited neighbour remains', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2) // isolated: no neighbouring sites to spread to
    const auraId = injectWildfire(g, 2, 2)
    const card = g.auras[auraId].cardId

    act(g, 0, { t: 'endTurn' })

    expect(g.auras[auraId], 'the fire burned out').toBeUndefined()
    expect(g.players[0].cemetery, 'its card went to the cemetery').toContain(card)
  })
})
