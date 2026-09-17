import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { makeCtx } from '../src/engine/effects'
import { getScript } from '../src/cards/scripts/registry'

// FAQ: "new Locusts" = copies made by the end-of-turn ability, NOT the cast ones. So you
// DO get a copy at the end of the very first turn you summon them, and thereafter exactly
// one more per turn (the first trigger's copy suppresses the rest).

const countLocusts = (g: any) => Object.values(g.units).filter((u: any) => u.name === 'Locusts of Illyria').length

describe('Locusts of Illyria spread per FAQ', () => {
  it('summons a copy at the end of the FIRST turn they are summoned', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 0, 0); placeSite(g, 0, 'Active Volcano', 1, 0) // one nearby site to spread to
    const loc = summonCard(g, 0, 'Locusts of Illyria', 0, 0); loc.enteredTurn = g.turn // cast THIS turn
    getScript('Locusts of Illyria')!.endOfTurn!(makeCtx(g, loc.id, 0, []))
    expect(countLocusts(g), 'the cast Locusts is not a "new" (ability-spread) Locust').toBe(2)
  })

  it('with two in the realm, only ONE more copy is summoned (net +1)', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 0, 0); placeSite(g, 0, 'Active Volcano', 1, 0)
    placeSite(g, 0, 'Active Volcano', 4, 3)
    const l1 = summonCard(g, 0, 'Locusts of Illyria', 0, 0); l1.enteredTurn = 0
    const l2 = summonCard(g, 0, 'Locusts of Illyria', 4, 3); l2.enteredTurn = 0
    getScript('Locusts of Illyria')!.endOfTurn!(makeCtx(g, l1.id, 0, [])) // spreads → marks the copy
    getScript('Locusts of Illyria')!.endOfTurn!(makeCtx(g, l2.id, 0, [])) // sees the ability-spread copy → skips
    expect(countLocusts(g), '2 originals + exactly 1 spread').toBe(3)
  })
})
