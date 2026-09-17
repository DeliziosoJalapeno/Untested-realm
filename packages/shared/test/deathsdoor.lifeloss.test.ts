import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { loseLife } from '../src/engine/effects'

// "Arrives at Death's Door" must fire whether the avatar reaches 0 by DAMAGE or by LIFE LOSS
// (site attacks). loseLife wasn't emitting onDeathsDoor, so Mount Ussar Sanctuary's
// "flee here and gain Ward" (and any onDeathsDoor trigger) silently missed life-loss deaths.

describe('onDeathsDoor fires on life loss too (Mount Ussar Sanctuary)', () => {
  it('an avatar brought to 0 life by life loss flees to the Sanctuary and is warded', () => {
    const g = newGame(42, 0); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    av.x = 3; av.y = 1; av.region = 'surface'; av.life = 2
    const sanctuary = placeSite(g, 0, 'Mount Ussar Sanctuary', 0, 0) // earth 1
    placeSite(g, 0, 'Fertile Earth', 1, 0) // +2 earth
    placeSite(g, 0, 'Fertile Earth', 2, 0) // +2 earth  → 5 total ≥ 4
    loseLife(g, 0, 2) // e.g. an enemy strikes your undefended site
    expect(av.life, 'at 0 life — death\'s door').toBe(0)
    expect([av.x, av.y], 'fled to the Sanctuary').toEqual([sanctuary.x, sanctuary.y])
    expect(av.ward, 'and gained Ward').toBe(true)
  })

  it('without enough earth (< 4) the Sanctuary does nothing', () => {
    const g = newGame(42, 0); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    av.x = 3; av.y = 1; av.region = 'surface'; av.life = 2
    placeSite(g, 0, 'Mount Ussar Sanctuary', 0, 0) // earth 1 only
    loseLife(g, 0, 2)
    expect(av.life).toBe(0)
    expect([av.x, av.y], 'not enough earth → stays put').toEqual([3, 1])
    expect(av.ward ?? false).toBe(false)
  })
})
