import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'
import type { UnitState } from '../src'

// Final ruling: a carried minion may partake in the defense, but ONLY if its carrier defends
// too — it never defends on its own. Fine Courser (Movement +1) reaches a 2-away fight; its
// Bosk Troll rider (1 step) cannot get there alone, so it depends entirely on the carrier.

function carry(carrier: UnitState, rider: UnitState) {
  carrier.carryingUnits = [...(carrier.carryingUnits ?? []), rider.id]; rider.carriedBy = carrier.id
}
function setup() {
  const g = newGame(); keepBoth(g)
  const site = placeSite(g, 1, 'Spire', 2, 2) // enemy site = the attack target
  placeSite(g, 1, 'Spire', 2, 3)              // path square
  placeSite(g, 1, 'Spire', 2, 4)              // carrier's home
  const attacker = summonCard(g, 0, 'Foot Soldiers', 2, 2, 'surface'); attacker.enteredTurn = 0
  const courser = summonCard(g, 1, 'Fine Courser', 2, 4, 'surface'); courser.enteredTurn = 0 // reaches (2,2)
  const rider = summonCard(g, 1, 'Bosk Troll', 2, 4, 'surface'); rider.enteredTurn = 0        // cannot reach (2,2) alone
  carry(courser, rider)
  return { g, site, attacker, courser, rider }
}

describe('a carried minion defends only alongside its carrier', () => {
  it('offers the rider as a candidate because its carrier can reach the fight', () => {
    const { g, site, attacker, courser, rider } = setup()
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { site: site.id } })
    const cands: string[] = g.prompts[0]!.data!.candidates
    expect(cands, 'the carrier is offered').toContain(courser.id)
    expect(cands, 'the rider is offered (via its carrier)').toContain(rider.id)
  })

  it('the rider CANNOT defend alone — picking only the rider does nothing', () => {
    const { g, site, attacker, courser, rider } = setup()
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { site: site.id } })
    answer(g, [rider.id]) // only the rider
    expect([g.units[rider.id]?.x, g.units[rider.id]?.y], 'rider stayed put').toEqual([2, 4])
    expect(g.units[rider.id]?.tapped, 'rider did NOT defend').toBe(false)
    expect(courser.tapped, 'carrier was not committed').toBe(false)
  })

  it('picking BOTH brings them in together — both defend and tap', () => {
    const { g, site, attacker, courser, rider } = setup()
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { site: site.id } })
    answer(g, [courser.id, rider.id])
    expect([courser.x, courser.y], 'carrier moved to the fight').toEqual([2, 2])
    expect(courser.tapped, 'carrier defends').toBe(true)
    const r = g.units[rider.id]!
    expect([r.x, r.y], 'rider brought along by the carrier').toEqual([2, 2])
    expect(r.tapped, 'rider joins the defense').toBe(true)
  })
})
