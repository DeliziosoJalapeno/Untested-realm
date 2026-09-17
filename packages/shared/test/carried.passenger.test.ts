import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'

// When a CARRIER defends, it moves to the attacked square and its carried unit is dragged
// along (forced movement) — but the carried unit itself does NOT defend: it's just a
// passenger (untapped, not in the fight). Only the carrier that chose to defend fights.

describe('a carrier that defends drags its passenger along, but the passenger does not defend', () => {
  it('the rider is moved to the fight square yet stays an untapped passenger', () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 1, 'Spire', 2, 2) // enemy site = the attack target
    placeSite(g, 1, 'Spire', 2, 3)              // carrier's home, adjacent
    const attacker = summonCard(g, 0, 'Foot Soldiers', 2, 2, 'surface') // weak attacker, on the site
    attacker.enteredTurn = 0
    const horse = summonCard(g, 1, 'War Horse', 2, 3, 'surface')
    horse.enteredTurn = 0
    const rider = summonCard(g, 1, 'Bosk Troll', 2, 3, 'surface')
    rider.enteredTurn = 0
    horse.carryingUnits = [rider.id]; rider.carriedBy = horse.id

    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { site: site.id } })
    answer(g, [horse.id]) // ONLY the horse defends

    expect([horse.x, horse.y], 'the carrier moved to defend').toEqual([2, 2])
    expect(horse.tapped, 'the carrier tapped to defend').toBe(true)
    const r = g.units[rider.id]!
    expect([r.x, r.y], 'the passenger was dragged to the fight square').toEqual([2, 2])
    expect(r.tapped, 'the passenger did NOT defend — it stays untapped').toBe(false)
    expect(r.carriedBy, 'the passenger is still aboard the carrier').toBe(horse.id)
  })
})
