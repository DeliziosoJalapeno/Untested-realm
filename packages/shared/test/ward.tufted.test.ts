import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fetchToHand, act, answer, summonCard } from './helpers'
import { avatarOf } from '../src'

// A ward breaks only when its bearer WOULD actually take damage. If another effect prevents the
// damage first (Tufted Turtles' shell — "the first time it would take damage each turn, prevent
// that damage"), the bearer takes 0, so the ward must NOT be spent. Regression: the combat pre-pass
// broke ward from the RAW blow damage, before the shell reduced it to 0 — wasting the ward.

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

describe('Ward + Tufted Turtles shell', () => {
  it('the shell prevents the strike, so the ward is NOT spent (takes 0, keeps ward)', () => {
    const g = board()
    // warded 2/2 Tufted Turtles attacks a 3/3 Stygian Archers; the archer strikes back for 3.
    const turtles = summonCard(g, 0, 'Tufted Turtles', 2, 0); turtles.enteredTurn = -1; turtles.ward = true
    const archer = summonCard(g, 1, 'Stygian Archers', 2, 0); archer.enteredTurn = -1
    act(g, 0, { t: 'moveAttack', unitId: turtles.id, path: [], attack: { unit: archer.id } })
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage'
        ? { strikerId: p.data.strikerId, allocation: { [archer.id]: 2 } } : true)
    }
    // the shell ate the 3 retaliation → 0 damage, AND the ward survived (nothing landed to break it)
    expect(g.units[turtles.id], 'the turtles survive').toBeDefined()
    expect(g.units[turtles.id]?.damage, 'the shell prevented all damage').toBe(0)
    expect(g.units[turtles.id]?.ward, 'the ward is untouched — no damage ever landed').toBe(true)
  })

  it('once the shell is spent this turn, the NEXT damage does break the ward (still no damage taken)', () => {
    const g = board()
    const turtles = summonCard(g, 0, 'Tufted Turtles', 2, 0); turtles.enteredTurn = -1; turtles.ward = true
    turtles.counters = { ...turtles.counters, shellTurn: g.turn } // shell already used this turn
    const archer = summonCard(g, 1, 'Stygian Archers', 2, 0); archer.enteredTurn = -1
    act(g, 0, { t: 'moveAttack', unitId: turtles.id, path: [], attack: { unit: archer.id } })
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage'
        ? { strikerId: p.data.strikerId, allocation: { [archer.id]: 2 } } : true)
    }
    // shell gone → the strike WOULD land → ward breaks and absorbs it (0 damage, ward spent)
    expect(g.units[turtles.id]?.damage, 'the ward absorbed the blow').toBe(0)
    expect(g.units[turtles.id]?.ward ?? false, 'the ward is now spent').toBe(false)
  })
})
