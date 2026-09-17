import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fetchToHand, act, answer, summonCard } from './helpers'
import { avatarOf } from '../src'

// Ward is a DAMAGE-PREVENTION effect (codex): "If a warded site or unit would be damaged,
// destroyed, or targeted by an opponent's spell or special ability, the Ward breaks instead."
// It explicitly covers COMBAT STRIKES: "once we get to strikes in the attack sequence, assuming
// you actually strike for 1 or more damage, the [warded] Apprentice Wizard's Ward will break at
// that point, preventing the damage." And crucially, simultaneously: "If a warded unit would take
// damage from multiple sources simultaneously, all simultaneous damage is prevented and the Ward
// breaks. For example, when a minion with a Ward attacks and multiple units defend that attack."
// Regression: the per-blow ward check used to prevent only the FIRST simultaneous strike and let
// the rest land, so a multiply-defended warded attacker still took damage. It must not.

function board() {
  const g = newGame()
  keepBoth(g)
  const v1 = fetchToHand(g, 0, 'Rustic Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
  if (g.prompts.length) answer(g, false)
  avatarOf(g, 0).tapped = false
  const v2 = fetchToHand(g, 0, 'Simple Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v2, x: 3, y: 0 })
  if (g.prompts.length) answer(g, false)
  return g
}

describe('Ward cancels strike damage', () => {
  it('a single defender: the warded attacker takes 0 and the ward breaks', () => {
    const g = board()
    // 6/6 warded attacker (Escyllion Cyclops), one 3/3 defender (Stygian Archers)
    const cyclops = summonCard(g, 0, 'Escyllion Cyclops', 2, 0); cyclops.enteredTurn = -1; cyclops.ward = true
    const archer = summonCard(g, 1, 'Stygian Archers', 2, 0); archer.enteredTurn = -1
    act(g, 0, { t: 'moveAttack', unitId: cyclops.id, path: [], attack: { unit: archer.id } })
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage'
        ? { strikerId: p.data.strikerId, allocation: { [archer.id]: 6 } } : true)
    }
    expect(g.units[cyclops.id]?.damage).toBe(0)                 // the strike was prevented
    expect(g.units[cyclops.id]?.ward ?? false).toBe(false)      // …and the ward broke
  })

  it('MULTIPLE simultaneous defenders: ONE ward prevents ALL their strikes (not just the first)', () => {
    const g = board()
    const cyclops = summonCard(g, 0, 'Escyllion Cyclops', 2, 0); cyclops.enteredTurn = -1; cyclops.ward = true
    // two 3/3 defenders — together 6 damage, enough to kill the 6/6 Cyclops if the ward only
    // stopped the first strike (the pre-fix bug).
    const archer1 = summonCard(g, 1, 'Stygian Archers', 2, 0); archer1.enteredTurn = -1
    const archer2 = summonCard(g, 1, 'Stygian Archers', 2, 0); archer2.enteredTurn = -1
    act(g, 0, { t: 'moveAttack', unitId: cyclops.id, path: [], attack: { unit: archer1.id } })
    answer(g, [archer2.id]) // defend with the second archer too → both strike the Cyclops at once
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage'
        ? { strikerId: p.data.strikerId, allocation: { [archer1.id]: 3, [archer2.id]: 3 } } : true)
    }
    // the ONE ward absorbs the whole simultaneous pass: no damage, and the Cyclops survives.
    expect(g.units[cyclops.id], 'the warded Cyclops must survive both strikes').toBeDefined()
    expect(g.units[cyclops.id]?.damage).toBe(0)
    expect(g.units[cyclops.id]?.ward ?? false).toBe(false)      // the single ward is spent
  })
})
