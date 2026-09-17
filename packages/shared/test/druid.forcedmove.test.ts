// A forced relocation that mutates position directly (Call of the Sea drags minions onto a site)
// now fires "enters here" triggers — e.g. the flipped Druid's nearby-allied-site thorns.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, waiveThreshold } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Druid thorns fire on a Call-of-the-Sea forced entry', () => {
  it('an enemy dragged onto a nearby allied (water) site takes 1 damage', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 5
    const av = avatarOf(g, 0); av.name = 'Druid'; (av as any).flipped = true; av.x = 1; av.y = 1; av.region = 'surface'
    const water = placeSite(g, 0, 'Rustic Village', 2, 1); (water as any).flooded = true // allied water site, nearby the Druid
    // a Submerge enemy so it survives the submerge (a non-Submerge minion would just drown here)
    const foe = summonCard(g, 1, 'Coral-Reef Kelpie', 3, 1); foe.enteredTurn = -5 // 3/3 Submerge, adjacent to the site

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Call of the Sea', { targets: [water.id] })

    expect([g.units[foe.id]?.x, g.units[foe.id]?.y], 'enemy was dragged onto the site').toEqual([2, 1])
    expect(g.units[foe.id]?.region, 'and submerged there').toBe('underwater')
    expect(g.units[foe.id]?.damage, 'the forced entry triggered the Druid thorns').toBe(1)
  })
})
