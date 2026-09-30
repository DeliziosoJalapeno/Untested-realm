// A carried unit that Moves & Attacks off its carrier must DETACH the instant it steps away — before
// any entry trigger fires. Regression: a flipped Druid's "enemy enters a nearby site → 1 damage" thorns
// ran checkStateBased mid-step, whose syncCarried yanked the still-"carried" mover back onto its War
// Horse, so it took the site damage but didn't actually move and its attack found no target.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('carried Move & Attack past a flipped Druid', () => {
  it('the mover detaches, actually reaches the target square, and its attack lands', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 1, 1) // War Horse's square
    placeSite(g, 1, 'Rustic Village', 2, 1) // enemy site at the target square (near the Druid)
    placeSite(g, 1, 'Rustic Village', 2, 2) // the flipped Druid's square

    const druid = summonCard(g, 1, 'Druid', 2, 2); druid.enteredTurn = -1; druid.flipped = true // back face: thorns aura
    const horse = summonCard(g, 0, 'War Horse', 1, 1); horse.enteredTurn = -1
    const drag = summonCard(g, 0, 'Colicky Dragonettes', 1, 1); drag.enteredTurn = -1
    horse.carryingUnits = [drag.id]; drag.carriedBy = horse.id // War Horse carries the Dragonettes
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 1); foe.enteredTurn = -1 // the quarry

    act(g, 0, { t: 'moveAttack', unitId: drag.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: foe.id } })
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage' ? { strikerId: p.data.strikerId, allocation: { [foe.id]: p.data.power } } : true)
    }

    const d = g.units[drag.id]
    expect(d, 'the Dragonettes survived').toBeDefined()
    expect([d!.x, d!.y], 'it actually reached the target square (not snapped back to the War Horse)').toEqual([2, 1])
    expect(d!.carriedBy ?? null, 'stepping off the War Horse ended the ride').toBeNull()
    expect(d!.damage, 'it took the flipped Druid thorns on entry').toBeGreaterThanOrEqual(1)
    // the attack actually resolved against the quarry (killed, or at least struck)
    expect(!g.units[foe.id] || g.units[foe.id]!.damage > 0, 'the attack landed on the quarry').toBe(true)
  })
})
