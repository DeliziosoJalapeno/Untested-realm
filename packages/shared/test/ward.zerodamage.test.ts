// A strike that deals 0 damage "is not any damage at all" (rulebook), so it must NOT break the
// target's ward. This pins the invariant that guards the Panpipes 0-power work: a future change
// that routes 0-damage strikes through the damage pipeline must still leave ward intact on a 0.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fetchToHand, act, answer, summonCard } from './helpers'
import { avatarOf } from '../src'

function board() {
  const g = newGame()
  keepBoth(g)
  const v1 = fetchToHand(g, 0, 'Rustic Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
  if (g.prompts.length) answer(g, false)
  avatarOf(g, 0).tapped = false
  return g
}

describe('Ward is not broken by a 0-damage strike', () => {
  it('a 0-power striker deals 0 to a warded enemy — the ward survives, no damage lands', () => {
    const g = board()
    // 0/0 Aethermoeba (a genuine 0-power striker) attacks a warded 3/3 Stygian Archers.
    const zero = summonCard(g, 0, 'Aethermoeba', 2, 0); zero.enteredTurn = -1
    const warded = summonCard(g, 1, 'Stygian Archers', 2, 0); warded.enteredTurn = -1; warded.ward = true

    act(g, 0, { t: 'moveAttack', unitId: zero.id, path: [], attack: { unit: warded.id } })
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage'
        ? { strikerId: p.data.strikerId, allocation: { [warded.id]: 0 } } : true)
    }

    // the 0-damage strike landed nothing → the ward is untouched and the defender took no damage
    expect(g.units[warded.id], 'the warded defender survives').toBeDefined()
    expect(g.units[warded.id]?.damage, 'no damage was dealt by the 0-power strike').toBe(0)
    expect(g.units[warded.id]?.ward, 'the ward is NOT spent by a 0-damage strike').toBe(true)
  })
})
