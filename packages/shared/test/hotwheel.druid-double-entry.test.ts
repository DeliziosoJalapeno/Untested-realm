// A unit summoned onto a square DEFERS its square-entry trigger until its Genesis resolves. Hotwheel's
// Genesis rolls it forward, firing a per-square entry at every site it travels through (incl. its final
// resting square). The deferred summon-entry then fired AGAIN at wherever it ended up — so the final
// site was entered twice and a flipped Druid's "enemy entering here takes 1 damage" aura hit it twice.
// Now the deferred entry only fires if the unit never moved off its summon square.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { effectSummonUnit, type GameState, type UnitState } from '../src'

function makeHotwheel(state: GameState, player: 0 | 1, x: number, y: number): UnitState {
  const cardId = `ctest${state.nextId++}`
  state.cards[cardId] = { id: cardId, name: 'Hotwheel', owner: player }
  return {
    id: `utest${state.nextId++}`, cardId, name: 'Hotwheel', owner: player, controller: player,
    isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0,
    enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
}

describe('Hotwheel rolling onto a flipped-Druid site is not damaged twice at its final square', () => {
  it('takes exactly 1 Druid-aura hit on the square it rolls to rest on (not 2)', () => {
    const g = newGame(); keepBoth(g)
    // enemy flipped Druid at (1,3): its 3x3 "nearby" covers y 2–3, x 0–2
    const druid = summonCard(g, 1, 'Druid', 1, 3); druid.flipped = true
    // the roll runs up column x=2 (controller 0 rolls y+): (2,1) → (2,2) → (2,3)
    placeSite(g, 0, 'Rustic Village', 2, 1) // summon square (ours — no Druid damage, out of range anyway)
    placeSite(g, 0, 'Rustic Village', 2, 2) // first roll square (ours — no Druid damage)
    placeSite(g, 1, 'Rustic Village', 2, 3) // FINAL roll square — enemy (Druid) site, in the Druid's range

    const hw = effectSummonUnit(g, makeHotwheel(g, 0, 2, 1))!
    // it rolled two steps to rest on (2,3); the flipped Druid aura hits it ONCE there, not twice —
    // a 2-defence Hotwheel would die if the final square were entered twice.
    expect(g.units[hw.id], 'survives — only one aura hit, not a double').toBeTruthy()
    expect(g.units[hw.id]?.y, 'came to rest on the enemy site').toBe(3)
    expect(g.units[hw.id]?.damage, 'exactly one Druid-aura hit on the resting square').toBe(1)
  })
})
