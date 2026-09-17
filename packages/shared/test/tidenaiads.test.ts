// Tide Naiads flood the site they occupy and the water ebbs when they LEAVE the realm. The card has NO
// printed deathrite — the old script mis-used the `deathrite` hook to drain the site, which made
// killUnit log a phantom "Tide Naiads' deathrite triggers." The drain now lives in removeUnitFromRealm
// (fires on any exit, silence/disable notwithstanding) and no deathrite is logged.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { effectSummonUnit, killUnit, siteStillFlooded } from '../src'

describe('Tide Naiads', () => {
  it('floods its site, ebbs when it leaves, and logs no phantom deathrite', () => {
    const g: any = newGame(); keepBoth(g)
    // a site with a real "s<number>" id — the Naiads store the numeric part of the id in a counter
    g.cards['sc1'] = { id: 'sc1', name: 'Rustic Village', owner: 0 }
    g.sites['s777'] = { id: 's777', cardId: 'sc1', name: 'Rustic Village', owner: 0, controller: 0, x: 2, y: 2, tapped: false, isRubble: false }
    g.cards['tnc'] = { id: 'tnc', name: 'Tide Naiads', owner: 0 }
    effectSummonUnit(g, {
      id: 'tnu', cardId: 'tnc', name: 'Tide Naiads', owner: 0, controller: 0, isAvatar: false,
      x: 2, y: 2, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {}, counters: {},
    })

    expect(g.sites['s777'].flooded, 'the Naiads flood their site on arrival').toBe(true)

    const logLen = g.log.length
    killUnit(g, 'tnu')

    expect(g.sites['s777'].flooded, 'the flood ebbs when the Naiads leave').toBe(false)
    expect(/deathrite/i.test(JSON.stringify(g.log.slice(logLen))), 'no phantom deathrite in the log').toBe(false)
  })

  it('does not drain a site while ANOTHER source still floods it (overlapping floods)', () => {
    const g: any = newGame(); keepBoth(g)
    g.cards['sc1'] = { id: 'sc1', name: 'Rustic Village', owner: 0 }
    g.sites['s500'] = { id: 's500', cardId: 'sc1', name: 'Rustic Village', owner: 0, controller: 0, x: 2, y: 2, tapped: false, isRubble: false }
    const summonNaiads = (id: string) => {
      g.cards['c' + id] = { id: 'c' + id, name: 'Tide Naiads', owner: 0 }
      effectSummonUnit(g, {
        id, cardId: 'c' + id, name: 'Tide Naiads', owner: 0, controller: 0, isAvatar: false,
        x: 2, y: 2, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
        modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {}, counters: {},
      })
    }
    summonNaiads('n1'); summonNaiads('n2') // TWO Naiads both flooding s500
    expect(g.sites['s500'].flooded).toBe(true)

    killUnit(g, 'n1')
    expect(g.sites['s500'].flooded, 'the second Naiads still floods it — no drain').toBe(true)
    killUnit(g, 'n2')
    expect(g.sites['s500'].flooded, 'now the last source is gone — it drains').toBe(false)
  })

  it('an end-of-turn flood (Floodplain/Wave) does not drain a site a Naiads also floods', () => {
    const g: any = newGame(); keepBoth(g)
    g.cards['sc2'] = { id: 'sc2', name: 'Rustic Village', owner: 0 }
    g.sites['s600'] = { id: 's600', cardId: 'sc2', name: 'Rustic Village', owner: 0, controller: 0, x: 1, y: 1, tapped: false, isRubble: false }
    g.cards['cn'] = { id: 'cn', name: 'Tide Naiads', owner: 0 }
    effectSummonUnit(g, {
      id: 'nn', cardId: 'cn', name: 'Tide Naiads', owner: 0, controller: 0, isAvatar: false,
      x: 1, y: 1, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {}, counters: {},
    })
    g.flow = g.flow ?? {}; g.flow.unfloodAtEnd = ['s600'] // a Floodplain/Wave also flooded it this turn

    // when the end-of-turn floods expire, the Naiads keeps the site wet
    expect(siteStillFlooded(g, 's600', { excludeEndOfTurn: true }), 'the Naiads outlasts the end-of-turn flood').toBe(true)
  })
})
