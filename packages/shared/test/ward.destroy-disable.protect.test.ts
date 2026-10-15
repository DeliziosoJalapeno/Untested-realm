// Ward (codex): a Ward breaks — and the bearer is spared — when the bearer would be DESTROYED from
// any source, or TARGETED by an opponent's special ability.
//   · Roots of Yggdrasil "destroy everything": a warded minion (Paladins of Bazia) survives.
//   · Gargantula's cocoon (a hostile disable): a warded enemy's ward absorbs it — no drag, no disable.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { makeCtx, getScript, wardUnit, checkStateBased } from '../src'

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

  it('Gargantula: a warded enemy minion is not dragged or cocooned — its ward breaks instead', () => {
    const g = newGame(); keepBoth(g)
    const garg = summonCard(g, 0, 'Gargantula', 2, 2)
    const prey = summonCard(g, 1, 'Foot Soldier', 3, 2) // orthogonally adjacent
    prey.enteredTurn = -1
    expect(wardUnit(g, prey)).toBe(true)

    getScript('Gargantula')!.genesis!(makeCtx(g, garg.id, 0, [{ unit: prey.id }]))
    checkStateBased(g)

    expect(prey.ward, 'the ward broke').toBeFalsy()
    expect(prey.disabled, 'but the prey was NOT disabled').toBeFalsy()
    expect(prey.counters?.cocooned, 'nor cocooned').toBeFalsy()
    expect([prey.x, prey.y], 'nor dragged — it stayed put').toEqual([3, 2])
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
