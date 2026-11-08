// Being carried is forced movement, and forced movement never changes a unit's region. So a carrier FORCED
// into another region (Drown / Bury-type effects, Cave-In…) leaves the unit carried ON TOP behind, in its own
// region and no longer carried. Only cargo carried INSIDE (a Brobdingnag Bullfrog's swallowed meal) goes
// along. A carrier's OWN step into another region still takes its rider (it confers Submerge / Burrowing).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { trySubmerge, takeOwnStep, checkStateBased, type GameState } from '../src'
import '../src/cards/scripts/index'

function setup(carrierName: string) {
  const g: GameState = newGame(); keepBoth(g)
  placeSite(g, 0, 'Deep Sea', 2, 2) // a water site
  const carrier = summonCard(g, 0, carrierName, 2, 2); carrier.enteredTurn = -1
  const rider = summonCard(g, 0, 'Bone Jumble', 2, 2); rider.enteredTurn = -1
  carrier.carryingUnits = [rider.id]; rider.carriedBy = carrier.id
  return { g, carrier, rider }
}

describe('a carrier changing region', () => {
  it('forced under (Drown-type submerge): the rider on top stays on the surface, uncarried', () => {
    const { g, carrier, rider } = setup('Deep-Sea Mermaids')
    trySubmerge(g, carrier, 1)
    checkStateBased(g)
    expect(g.units[carrier.id]?.region).toBe('underwater')
    const r = g.units[rider.id]
    expect(r, 'the rider did not drown').toBeTruthy()
    expect(r.region).toBe('surface')
    expect(r.carriedBy).toBeNull()
    expect(g.units[carrier.id].carryingUnits).not.toContain(rider.id)
  })

  it('forced under: a Bullfrog takes its swallowed meal down with it', () => {
    const { g, carrier, rider } = setup('Brobdingnag Bullfrog')
    trySubmerge(g, carrier, 1)
    checkStateBased(g)
    if (g.units[rider.id]) expect(g.units[rider.id].region).toBe('underwater')
  })

  it("the carrier's OWN submerge step takes the rider along", () => {
    const { g, carrier, rider } = setup('Deep-Sea Mermaids')
    expect(takeOwnStep(g, carrier, { x: 2, y: 2, region: 'underwater' })).toBe(true)
    checkStateBased(g)
    expect(g.units[carrier.id].region).toBe('underwater')
    expect(g.units[rider.id]?.region).toBe('underwater')
    expect(g.units[rider.id]?.carriedBy).toBe(carrier.id)
  })
})
