// The search bot enumerates prompt answers via expandActions. For an `allocateDamage` prompt (splitting a
// striker's damage among several defenders) the OLD code fell through to a generic branch that produced only
// junk answers ([] / null / true) — none of which the engine accepts, so it just re-pushed the SAME prompt.
// The search then "planned" a no-op answer and reality re-prompted forever → the bot froze. expandActions
// must now emit at least one VALID, fully-spent allocation that actually CLEARS the prompt.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, answer, summonCard } from './helpers'
import { expandActions, applyAction, type GameState } from '../src'
import '../src/cards/scripts/index'

// attacker + two defenders co-located at (2,0), so the attacker's strike needs an allocation among them
function combatBoard() {
  const g = newGame() as GameState; keepBoth(g)
  const attacker = summonCard(g, 0, 'Stygian Archers', 2, 0); attacker.enteredTurn = -1 // 3/3, strikes
  const d1 = summonCard(g, 1, 'Bone Jumble', 2, 0); d1.enteredTurn = -1 // 1/1
  const d2 = summonCard(g, 1, 'Bone Jumble', 2, 0); d2.enteredTurn = -1 // 1/1
  return { g, attacker, d1, d2 }
}

// drive prompts (defenders defend; anything else, keep the fight going) until an allocateDamage prompt opens
function reachAllocation(g: GameState): any {
  for (let i = 0; i < 50 && g.prompts.length; i++) {
    const p: any = g.prompts[0]
    if (p.kind === 'allocateDamage') return p
    answer(g, p.kind === 'defend' ? (p.data?.candidates ?? []) : p.kind === 'stayInFight' ? true : true)
  }
  return g.prompts[0]?.kind === 'allocateDamage' ? g.prompts[0] : null
}

describe('bot search: allocateDamage always has a valid, prompt-clearing answer', () => {
  it('expandActions emits a valid allocation that clears the prompt (no infinite re-prompt)', () => {
    const { g, attacker, d1 } = combatBoard()
    // strike in place; the co-located enemies both join the fight regardless of which one is named
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: d1.id } })
    const prompt = reachAllocation(g)
    expect(prompt, 'an allocateDamage prompt opened').toBeTruthy()

    const kids = expandActions(g, 0)
    expect(kids.length, 'at least one candidate answer').toBeGreaterThan(0)

    for (const { action } of kids) {
      expect(action.t).toBe('prompt')
      const choice: any = (action as any).choice
      expect(choice?.strikerId, 'a striker id').toBeTruthy()
      expect(typeof choice.allocation, 'an allocation object').toBe('object')
      const total = Object.values(choice.allocation as Record<string, number>).reduce((s, n) => s + n, 0)
      expect(total, 'never spends more than the striker has').toBeLessThanOrEqual(prompt.data.power)

      // the crucial anti-hang property: applying it must NOT leave the very same allocateDamage prompt open
      const clone = structuredClone(g)
      const res = applyAction(clone, 0, action)
      expect(res.ok, 'the allocation is accepted').toBe(true)
      const still = clone.prompts.find((q: any) => q.kind === 'allocateDamage' && q.data?.strikerId === choice.strikerId)
      expect(still, 'the striker no longer awaits allocation').toBeUndefined()
    }
  })
})
