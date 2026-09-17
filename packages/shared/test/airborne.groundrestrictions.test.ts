import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { isLegalStep } from '../src'
import type { GameState, UnitState, ArtifactState } from '../src'

// "On the ground" movement restrictions (Great Wall, Perilous Bridge, Mountain Pass, Bailey)
// must NOT stop AIRBORNE units — they fly over, not being "on the ground" (rulebook: Great
// Wall FAQ "airborne units can fly over the wall as they are not moving 'on the ground'";
// Perilous Bridge FAQ "assuming the unit does not have the Airborne ability"). Damage walls
// with the same clause (Wall of Brambles) and the hard-block Wall of Ice already handle this;
// Wall of Fire correctly still hits airborne (no "on the ground" clause). This covers the
// entryFilter cards that previously ignored the flag.

function makeAirborne(u: UnitState): UnitState {
  u.modifiers.push({ kind: 'keyword', keyword: 'airborne' } as any)
  return u
}
const step = (s: GameState, u: UnitState, from: [number, number], to: [number, number]) =>
  isLegalStep(s, u, { x: from[0], y: from[1], region: 'surface' }, { x: to[0], y: to[1], region: 'surface' })

describe('airborne ignores "on the ground" movement restrictions', () => {
  it('Bailey blocks a grounded enemy from moving in, but not an airborne one', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2) // the Bailey square (surface move needs a site)
    placeSite(g, 0, 'Spire', 2, 1) // the square it steps from
    const artId = `bail${g.nextId++}`
    const art: ArtifactState = { id: artId, cardId: artId, name: 'Bailey', conjuredBy: 0, x: 2, y: 2, region: 'surface', tapped: false } as any
    g.artifacts[artId] = art
    const foe = summonCard(g, 1, 'Brown Bears', 2, 1) // enemy of Bailey's controller (0)
    expect(step(g, foe, [2, 1], [2, 2]), 'grounded enemy is blocked by Bailey').toBe(false)
    makeAirborne(foe)
    expect(step(g, foe, [2, 1], [2, 2]), 'airborne enemy flies in over Bailey').toBe(true)
  })

  it('Perilous Bridge blocks a grounded cross of its top border, but not an airborne one', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Perilous Bridge', 2, 2) // controller 0 → top border faces y+1 = 3
    placeSite(g, 0, 'Spire', 2, 3)
    const u = summonCard(g, 1, 'Brown Bears', 2, 3)
    expect(step(g, u, [2, 3], [2, 2]), 'grounded unit cannot traverse the bridge border').toBe(false)
    makeAirborne(u)
    expect(step(g, u, [2, 3], [2, 2]), 'airborne unit flies over the bridge border').toBe(true)
  })

  it('Great Wall blocks a grounded enemy crossing, but not an airborne one', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Great Wall', 2, 2) // controller 0 → front border at y+1 = 3
    placeSite(g, 0, 'Spire', 2, 3)
    const foe = summonCard(g, 1, 'Brown Bears', 2, 3)
    expect(step(g, foe, [2, 3], [2, 2]), 'grounded enemy is walled out').toBe(false)
    makeAirborne(foe)
    expect(step(g, foe, [2, 3], [2, 2]), 'airborne enemy flies over the Great Wall').toBe(true)
  })

  it('Mountain Pass blocks a grounded minion entering an occupied pass, but not an airborne one', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Mountain Pass', 2, 2)
    placeSite(g, 0, 'Spire', 2, 1)
    summonCard(g, 0, 'Brown Bears', 2, 2) // the pass is already occupied by a minion
    const mover = summonCard(g, 1, 'Brown Bears', 2, 1)
    expect(step(g, mover, [2, 1], [2, 2]), 'grounded minion cannot enter the occupied pass').toBe(false)
    makeAirborne(mover)
    expect(step(g, mover, [2, 1], [2, 2]), 'airborne minion flies into the pass').toBe(true)
  })
})
