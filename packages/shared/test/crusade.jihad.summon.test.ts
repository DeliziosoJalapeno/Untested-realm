// Crusade / Jihad: "You may summon earth/fire minions to AFFECTED sites." The permission is
// bound to the aura's own squares — you can summon the element minion onto an enemy site that
// lies UNDER the aura, but NOT onto sites elsewhere. The bug let you summon to any site.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, getCard, effAttack } from '../src'

const AURA = (controller: 0 | 1) => ({
  id: 'r1', controller,
  squares: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
})

describe('Crusade / Jihad only permit summoning onto their own affected squares', () => {
  it('Crusade: an Earth minion may enter a covered square, not one outside the aura', () => {
    const g: any = newGame(); keepBoth(g)
    const allows = getScript('Crusade')!.auraAllowsSummon!
    const aura = AURA(0)
    expect(allows(g, aura, 0, 'Cave Trolls', { x: 0, y: 0 }), 'Earth minion, inside the aura').toBe(true)
    expect(allows(g, aura, 0, 'Cave Trolls', { x: 4, y: 3 }), 'Earth minion, OUTSIDE the aura').toBe(false)
    expect(allows(g, aura, 0, 'Common Cottagers', { x: 0, y: 0 }), 'a non-Earth minion is never permitted').toBe(false)
    expect(allows(g, AURA(1), 0, 'Cave Trolls', { x: 0, y: 0 }), 'only the aura\'s controller gets the permission').toBe(false)
  })

  it('Jihad: a Fire minion may enter a covered square, not one outside the aura', () => {
    const g: any = newGame(); keepBoth(g)
    const allows = getScript('Jihad')!.auraAllowsSummon!
    const aura = AURA(0)
    expect(allows(g, aura, 0, 'Lava Salamander', { x: 1, y: 1 }), 'Fire minion, inside the aura').toBe(true)
    expect(allows(g, aura, 0, 'Lava Salamander', { x: 3, y: 3 }), 'Fire minion, OUTSIDE the aura').toBe(false)
    expect(allows(g, aura, 0, 'Cave Trolls', { x: 0, y: 0 }), 'an Earth minion is not permitted by Jihad').toBe(false)
  })
})

describe('Tokens carry an explicit element (exception to the "element from symbols" rule)', () => {
  it('Foot Soldier is Earth, Skeleton is Air, Frog is Water', () => {
    expect(getCard('Foot Soldier').elements, 'Foot Soldier token = Earth').toContain('Earth')
    expect(getCard('Skeleton').elements, 'Skeleton token = Air').toContain('Air')
    expect(getCard('Frog').elements, 'Frog token = Water').toContain('Water')
  })

  it('Crusade boosts a Foot Soldier token on a covered site (+1), but not an Air Skeleton', () => {
    const g: any = newGame(); keepBoth(g)
    // Crusade covering (0,0)-(1,1), controlled by player 0
    g.auras['r1'] = { id: 'r1', name: 'Crusade', controller: 0, squares: AURA(0).squares }
    placeSite(g, 0, 'Bedrock', 0, 0)
    placeSite(g, 0, 'Bedrock', 1, 1)
    // an Earth Foot Soldier token walks onto a covered site → +1 power (grant is by position, live)
    const fs = summonCard(g, 0, 'Foot Soldier', 0, 0)
    expect(effAttack(g, fs), 'Earth token on an affected site gets Crusade +1').toBe(2)
    // an Air Skeleton on a covered site is NOT an earth minion → no boost
    const sk = summonCard(g, 0, 'Skeleton', 1, 1)
    expect(effAttack(g, sk), 'Air token gets nothing from an earth aura').toBe(1)
  })
})
