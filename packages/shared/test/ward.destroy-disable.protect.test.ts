// Ward (codex): a Ward breaks — and the bearer is spared — when the bearer would be DESTROYED from
// any source, or TARGETED by an opponent's special ability.
//   · Roots of Yggdrasil "destroy everything": a warded minion (Paladins of Bazia) survives.
//   · Gargantula's cocoon doesn't TARGET (no "target" in its text), so a warded enemy is still dragged in.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { makeCtx, getScript, wardUnit } from '../src'

describe('Ward vs mass-destroy and hostile disable', () => {
  it('Roots of Yggdrasil: a warded minion survives the collapse (ward spent); an unwarded one dies', () => {
    const g = newGame(); keepBoth(g)
    const warded = summonCard(g, 0, 'Foot Soldier', 2, 2)
    const plain = summonCard(g, 0, 'Foot Soldier', 3, 2)
    expect(wardUnit(g, warded)).toBe(true)

    getScript('Roots of Yggdrasil')!.onSelfDestroyed!(makeCtx(g, 'roots', 1, []), { x: 2, y: 3 })

    expect(g.units[warded.id], 'the warded minion survives the world-tree').toBeTruthy()
    expect(g.units[warded.id]?.ward, 'but its ward was spent absorbing the destruction').toBeFalsy()
    expect(g.units[plain.id], 'the unwarded minion is destroyed').toBeUndefined()
  })

  it("Gargantula: a warded enemy minion is still dragged and cocooned (the drag doesn't target)", () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2); placeSite(g, 0, 'Rustic Village', 3, 2)
    const garg = summonCard(g, 0, 'Gargantula', 2, 2)
    const prey = summonCard(g, 1, 'Foot Soldier', 3, 2) // orthogonally adjacent
    prey.enteredTurn = -1
    expect(wardUnit(g, prey)).toBe(true)

    getScript('Gargantula')!.genesis!(makeCtx(g, garg.id, 0, [{ unit: prey.id }]))

    expect(prey.counters?.cocooned, 'cocooned').toBe(1)
    expect([prey.x, prey.y], 'dragged onto Gargantula').toEqual([2, 2])
  })

  it('control: an UNwarded enemy minion is dragged and cocooned by Gargantula', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2); placeSite(g, 0, 'Rustic Village', 3, 2) // sites so the drag isn't into void
    const garg = summonCard(g, 0, 'Gargantula', 2, 2)
    const prey = summonCard(g, 1, 'Foot Soldier', 3, 2)
    prey.enteredTurn = -1

    getScript('Gargantula')!.genesis!(makeCtx(g, garg.id, 0, [{ unit: prey.id }]))

    expect(prey.disabled, 'no ward → cocooned/disabled').toBe(true)
    expect(prey.counters?.cocooned).toBe(1)
    expect([prey.x, prey.y], 'dragged onto Gargantula').toEqual([2, 2])
  })
})
