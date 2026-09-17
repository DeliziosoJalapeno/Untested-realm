import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, giveArtifact, castMagic, waiveThreshold } from './helpers'
import { checkStateBased } from '../src/engine/effects'

// FAQ: "If a minion leaves the realm, anything they're carrying remains in the realm"
// (Cast into Exile, Fey Changeling, Monster Hunter). Cast into Exile direct-deleted the unit
// without dropping its cargo, orphaning carried artifacts + units.

describe('a minion cast into exile leaves its cargo behind', () => {
  it('carried artifact AND carried unit remain in the realm', () => {
    const g = newGame(42, 0); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Active Volcano', 2, 2) // caster's site
    const carrier = summonCard(g, 1, 'War Horse', 2, 2); carrier.enteredTurn = 0 // an intruder on your site
    const rider = summonCard(g, 1, 'Bosk Troll', 2, 2); rider.enteredTurn = 0
    carrier.carryingUnits = [rider.id]; rider.carriedBy = carrier.id
    const art = giveArtifact(g, carrier, 'Excalibur')

    castMagic(g, 0, 'Cast into Exile', { targets: [carrier.id] })

    expect(g.units[carrier.id], 'the carrier is exiled').toBeUndefined()
    expect(g.units[rider.id], 'the carried unit stays in the realm').toBeDefined()
    expect(g.units[rider.id]?.carriedBy ?? null, 'and is no longer carried').toBeNull()
    expect(g.artifacts[art.id], 'the artifact stays in the realm').toBeDefined()
    expect(g.artifacts[art.id]?.carriedBy ?? null, 'no longer carried by the exiled unit').toBeNull()
    expect([g.artifacts[art.id]?.x, g.artifacts[art.id]?.y], 'dropped where the carrier stood').toEqual([2, 2])
  })

  it('checkStateBased is a safety net for any direct removal that orphans cargo', () => {
    const g = newGame(42, 0); keepBoth(g)
    const carrier = summonCard(g, 0, 'War Horse', 2, 2); carrier.enteredTurn = 0
    const rider = summonCard(g, 0, 'Bosk Troll', 2, 2); rider.enteredTurn = 0
    carrier.carryingUnits = [rider.id]; rider.carriedBy = carrier.id
    const art = giveArtifact(g, carrier, 'Excalibur')
    delete g.units[carrier.id] // a card that direct-deletes without dropping cargo
    checkStateBased(g)
    expect(g.units[rider.id], 'the carried unit remains').toBeDefined()
    expect(g.units[rider.id]?.carriedBy ?? null, 'no longer carried').toBeNull()
    expect(g.artifacts[art.id]?.carriedBy ?? null, 'artifact freed').toBeNull()
  })
})
