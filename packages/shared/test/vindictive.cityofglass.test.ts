// Vindictive Nation: "Opponent loses 1/3/7 life if they modify/move/DESTROY a nearby
// allied site." A nearby allied City of Glass that shatters from ENEMY damage counts as
// the enemy destroying it — the shatter must be credited to the damager, not the City's
// own owner (which was swallowing the trigger via the "only opponents pay" guard).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { avatarOf, type GameState } from '../src'
import { dealDamage } from '../src/engine/effects'
import '../src/cards/scripts/index'

describe('Vindictive Nation punishes an enemy who shatters a nearby allied City of Glass', () => {
  it('the damaging opponent loses 7 life and the City is reduced to rubble', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const city = placeSite(g, 0, 'City of Glass', 2, 2)   // your City of Glass
    placeSite(g, 0, 'Vindictive Nation', 2, 3)            // your Vindictive Nation, adjacent
    const foeLife0 = avatarOf(g, 1).life!
    const myLife0 = avatarOf(g, 0).life!

    // the opponent (player 1) deals 1 damage to your City → it shatters
    dealDamage(g, { site: city.id }, 1, 1)

    // the City is gone, rubble in its place
    expect(g.sites[city.id], 'the City of Glass was destroyed').toBeUndefined()
    expect(Object.values(g.sites).some((s) => s.isRubble && s.x === 2 && s.y === 2), 'rubble remains').toBe(true)

    // you lost 1 life from the site damage itself…
    expect(avatarOf(g, 0).life, 'you lost 1 from the strike').toBe(myLife0 - 1)
    // …and the Vindictive Nation exacted its 7-life destroy price from the opponent
    expect(avatarOf(g, 1).life, 'the opponent paid the 7-life destroy grudge').toBe(foeLife0 - 7)
  })

  it("does NOT punish the City's own owner when they shatter their own site", () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const city = placeSite(g, 0, 'City of Glass', 2, 2)
    placeSite(g, 0, 'Vindictive Nation', 2, 3)
    const myLife0 = avatarOf(g, 0).life!

    // player 0 damages their OWN City → it shatters, but Vindictive only bills opponents
    dealDamage(g, { site: city.id }, 1, 0)

    expect(g.sites[city.id]).toBeUndefined()
    // 1 life lost to the strike, but NO extra 7-life grudge on yourself
    expect(avatarOf(g, 0).life, 'only the 1 strike, no self-grudge').toBe(myLife0 - 1)
  })
})
