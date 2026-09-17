// Two hidden-info / keyword rulings:
//  1. Against a Magician (sites live in the spellbook and share the spell back), the opponent may
//     only learn the TOTAL number of cards in hand — never the site/spell split.
//  2. A disabled minion loses Airborne (it falls to the ground), though it keeps region-movement
//     keywords like Burrowing/Submerge so a subsurface unit isn't stranded.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { viewFor, avatarOf, effKeywords, canExistIn, type PlayerId } from '../src'

function mkUnit(g: any, id: string, name: string, owner: PlayerId, x: number, y: number, mods: any[] = []): void {
  g.cards[id] = { id, name, owner }
  g.units[id] = { id, cardId: id, name, owner, controller: owner, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: -5, modifiers: mods, carrying: [], carryingUnits: [], usedThisTurn: {} }
}

describe('Magician hand reveal', () => {
  it('an opponent sees only the TOTAL hand count vs a Magician, not the site/spell split', () => {
    const g: any = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.name = 'Magician'
    g.cards['h1'] = { id: 'h1', name: 'Rustic Village', owner: 0 } // a site
    g.cards['h2'] = { id: 'h2', name: 'Lightning Bolt', owner: 0 } // a spell
    g.players[0].hand = ['h1', 'h2']
    const hc = viewFor(g, 1).players[0].handCounts as any
    expect(hc.mixed, 'flagged as a mixed (Magician) hand').toBe(true)
    expect(hc.spells, 'the total is reported (2)').toBe(2)
    expect(hc.sites, 'the site count is NOT revealed').toBe(0)
  })

  it('a normal avatar still reveals the site/spell split (card backs differ)', () => {
    const g: any = newGame(); keepBoth(g)
    g.cards['h1'] = { id: 'h1', name: 'Rustic Village', owner: 0 }
    g.cards['h2'] = { id: 'h2', name: 'Lightning Bolt', owner: 0 }
    g.players[0].hand = ['h1', 'h2']
    const hc = viewFor(g, 1).players[0].handCounts as any
    expect(hc.mixed).toBeFalsy()
    expect(hc.sites).toBe(1)
    expect(hc.spells).toBe(1)
  })
})

describe('disabled minions lose ALL keyword abilities', () => {
  it('a disabled minion loses every keyword (Airborne, Burrowing, Submerge, Ranged…)', () => {
    const g: any = newGame()
    mkUnit(g, 'a', 'Foot Soldier', 0, 1, 1, [
      { kind: 'keyword', keyword: 'airborne' },
      { kind: 'keyword', keyword: 'burrowing' },
      { kind: 'keyword', keyword: 'ranged' },
    ])
    const kw0 = effKeywords(g, g.units['a'])
    expect(kw0.airborne && kw0.burrowing && kw0.ranged, 'has its keywords while active').toBeTruthy()
    g.units['a'].disabled = true
    expect(effKeywords(g, g.units['a']), 'disabled → no abilities at all').toEqual({})
  })

  it('a disabled Submerge minion can no longer exist underwater (it drowns)', () => {
    const g: any = newGame()
    const site = placeSite(g, 0, 'Rustic Village', 1, 1); (site as any).flooded = true // water terrain
    mkUnit(g, 'b', 'Foot Soldier', 0, 1, 1, [{ kind: 'keyword', keyword: 'submerge' }])
    g.units['b'].region = 'underwater'
    expect(canExistIn(g, g.units['b'], 'underwater', 1, 1), 'exists underwater while active').toBe(true)
    g.units['b'].disabled = true
    expect(canExistIn(g, g.units['b'], 'underwater', 1, 1), 'disabled → cannot stay submerged').toBe(false)
  })
})
