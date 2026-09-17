// Damage from one effect is SIMULTANEOUS: every victim's reduction/prevention resolves before a
// single death is settled. The reported bug: a Minor Explosion on a location holding an Ironclad
// avatar (−2) and Shield Maidens (−1 to nearby allies) killed the Maidens FIRST, so by the time the
// avatar's hit was computed the −1 was gone and the avatar wrongly took 1. With the engine holding an
// open damage event around the whole cast, no unit leaves the board until the blast is fully resolved,
// so the Maidens still shield the avatar for the same blast (and only THEN die).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold } from './helpers'
import { dealDamageToUnit, checkStateBased, runDamageEvent, type GameState } from '../src'

function ironcladPlusMaidens() {
  const g: GameState = newGame(); keepBoth(g)
  placeSite(g, 0, 'Rustic Village', 2, 2)
  const av = g.units[g.players[0].avatarUnitId]
  av.name = 'Ironclad'; av.x = 2; av.y = 2 // the Ironclad avatar (−2 to itself)
  const maidens = summonCard(g, 0, 'Shield Maidens', 2, 2); maidens.enteredTurn = -5 // 2/2, −1 to nearby allies
  waiveThreshold(g, 0)
  return { g, av, maidens }
}

describe('simultaneous area damage resolves reduction before any death', () => {
  it('Minor Explosion: the avatar takes 0 even though the blast kills the Shield Maidens shielding it', () => {
    const { g, av, maidens } = ironcladPlusMaidens()
    const lifeBefore = av.life
    castMagic(g, 0, 'Minor Explosion', { targets: ['sq:2,2,surface'] })

    expect(av.life, 'Ironclad −2 and the Maidens −1 fully absorb the 3 → 0 to the avatar').toBe(lifeBefore)
    expect(g.units[maidens.id], 'the Maidens took 3−1=2 = lethal and died AFTER shielding the avatar').toBeUndefined()
  })

  it('never pops an ordering prompt for two pure reductions (Ironclad + Shield Maidens)', () => {
    const { g } = ironcladPlusMaidens()
    castMagic(g, 0, 'Minor Explosion', { targets: ['sq:2,2,surface'] })
    expect(g.prompts.some((p) => p.kind === 'orderCards'), 'commutative reductions need no order choice').toBe(false)
  })

  it('the general engine event defers death: a reducer killed by a simultaneous blast still reduces the second hit', () => {
    // engine-level proof, independent of any card: two units in a shared damage event, one of them a
    // Shield Maidens that the first hit kills — the second hit still gets its −1.
    const g: GameState = newGame(); keepBoth(g)
    for (const x of [1, 2]) placeSite(g, 0, 'Rustic Village', x, 1)
    const maidens = summonCard(g, 0, 'Shield Maidens', 1, 1); maidens.enteredTurn = -5 // 2/2
    const ally = summonCard(g, 0, 'Escyllion Cyclops', 2, 1); ally.enteredTurn = -5 // 6 def, survives, is "nearby"

    runDamageEvent(g, () => {
      dealDamageToUnit(g, g.units[maidens.id], 2, 1, { source: { player: 1, kind: 'effect' } }) // 2 − 1(self) = 2 = lethal (2 def)
      dealDamageToUnit(g, g.units[ally.id], 3, 1, { source: { player: 1, kind: 'effect' } })
    })
    // the Cyclops was next to the Maidens for the whole event, so its 3 became 3−1 = 2 even though the
    // Maidens are (or are becoming) dead in the same event.
    expect(g.units[ally.id].damage, 'the Maidens shielded the ally before leaving the board').toBe(2)
  })

  it('once the Maidens have actually left (separate event), the ally takes full damage', () => {
    const g: GameState = newGame(); keepBoth(g)
    for (const x of [1, 2]) placeSite(g, 0, 'Rustic Village', x, 1)
    const maidens = summonCard(g, 0, 'Shield Maidens', 1, 1); maidens.enteredTurn = -5
    const ally = summonCard(g, 0, 'Escyllion Cyclops', 2, 1); ally.enteredTurn = -5
    delete g.units[maidens.id]; checkStateBased(g) // Maidens gone in a PRIOR event
    dealDamageToUnit(g, g.units[ally.id], 3, 1, { source: { player: 1, kind: 'effect' } })
    expect(g.units[ally.id].damage, 'no shield left → full 3').toBe(3)
  })
})

// A disabled unit has no abilities, so it neither reduces/prevents damage for others nor shells itself.
describe('disabled units provide no damage prevention', () => {
  it('a disabled Tufted Turtles does NOT shell — it takes the damage', () => {
    const g: GameState = newGame(); keepBoth(g)
    const turtles = summonCard(g, 0, 'Tufted Turtles', 2, 2); turtles.enteredTurn = -5
    turtles.disabled = true // e.g. Root Spider / a Basilisk at-rest disable
    dealDamageToUnit(g, g.units[turtles.id], 1, 1, { source: { player: 1, kind: 'effect' } })
    checkStateBased(g)
    expect(g.units[turtles.id]?.damage, 'disabled → no shell → takes the 1').toBe(1)
  })

  it('an ENABLED Tufted Turtles still shells (control)', () => {
    const g: GameState = newGame(); keepBoth(g)
    const turtles = summonCard(g, 0, 'Tufted Turtles', 2, 2); turtles.enteredTurn = -5
    dealDamageToUnit(g, g.units[turtles.id], 1, 1, { source: { player: 1, kind: 'effect' } })
    checkStateBased(g)
    expect(g.units[turtles.id]?.damage, 'shell prevents the 1').toBe(0)
  })

  it('a disabled Shield Maidens grants no −1 to nearby allies', () => {
    const g: GameState = newGame(); keepBoth(g)
    for (const x of [1, 2]) placeSite(g, 0, 'Rustic Village', x, 1)
    const maidens = summonCard(g, 0, 'Shield Maidens', 1, 1); maidens.enteredTurn = -5
    maidens.disabled = true
    const ally = summonCard(g, 0, 'Escyllion Cyclops', 2, 1); ally.enteredTurn = -5
    dealDamageToUnit(g, g.units[ally.id], 3, 1, { source: { player: 1, kind: 'effect' } })
    expect(g.units[ally.id].damage, 'disabled Maidens lend no shield → full 3').toBe(3)
  })
})
