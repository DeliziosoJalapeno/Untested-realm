// Panpipes of Pnom: "Damage caused by nearby units is increased to 2." Through the real combat
// pipeline, a 0-power striker near Panpipes deals 2 on its strike (FAQ: 0-power units strike for 2).
// The 0-damage-ward invariant is preserved separately (ward.zerodamage.test.ts): no Panpipes → 0 → ward kept.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fetchToHand, act, answer, summonCard } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function board() {
  const g = newGame(); keepBoth(g)
  const v1 = fetchToHand(g, 0, 'Rustic Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
  if (g.prompts.length) answer(g, false)
  avatarOf(g, 0).tapped = false
  return g
}
function groundArt(g: GameState, name: string, x: number, y: number, owner = 0) {
  const cid = `ctest${g.nextId++}`; g.cards[cid] = { id: cid, name, owner } as any
  const aid = `atest${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name, conjuredBy: owner, x, y, region: 'surface', carriedBy: null, tapped: false } as any
  return aid
}

describe('Panpipes boosts a 0-power strike through combat', () => {
  it('a 0-power striker adjacent to Panpipes deals 2 on its strike', () => {
    const g = board()
    const moeba = summonCard(g, 0, 'Aethermoeba', 2, 0); moeba.enteredTurn = -1 // 0/0 — a genuine 0-power striker
    const foe = summonCard(g, 1, 'Stygian Archers', 2, 0); foe.enteredTurn = -1 // 3/3, survives 2
    groundArt(g, 'Panpipes of Pnom', 2, 0) // nearby the striker

    act(g, 0, { t: 'moveAttack', unitId: moeba.id, path: [], attack: { unit: foe.id } })
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage'
        ? { strikerId: p.data.strikerId, allocation: { [foe.id]: 0 } } : true)
    }
    expect(g.units[foe.id]?.damage, 'Panpipes raised the 0-power strike to 2').toBe(2)
  })
})
