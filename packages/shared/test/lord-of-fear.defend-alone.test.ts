// Lord of Fear: "Enemies can't defend alone." With a single defender, the attacked ally must stay in
// the fight beside it; it is never offered the chance to withdraw.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, waiveThreshold, act, answer } from './helpers'
import type { GameState } from '../src'

function game(): GameState {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  for (const s of Object.values(g.sites)) delete g.sites[s.id]
  for (const [x, y] of [[1, 0], [1, 1], [1, 2]]) placeSite(g, 0, 'Rustic Village', x, y)
  return g
}

describe('Lord of Fear: a lone defender keeps the attacked ally in the fight', () => {
  for (const [label, lordAttacks, defenderAt] of [
    ['another minion attacks, the defender walks in', false, [1, 2]],
    ['another minion attacks, the defender is already there', false, [1, 1]],
    ['the Lord attacks, the defender walks in', true, [1, 2]],
  ] as const) {
    it(label, () => {
      const g = game()
      const lord = summonCard(g, 0, 'Lord of Fear', 1, 0)
      const attacker = lordAttacks ? lord : summonCard(g, 0, 'Escyllion Cyclops', 1, 0)
      const victim = summonCard(g, 1, 'Bodach Bogeyman', 1, 1)
      const defender = summonCard(g, 1, 'Monks of Kobalsa', defenderAt[0], defenderAt[1])
      act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [{ x: 1, y: 1, region: 'surface' }], attack: { unit: victim.id } })
      expect(g.prompts[0]?.kind).toBe('defend')
      answer(g, [defender.id])
      expect(g.prompts.some((p) => p.kind === 'stayInFight'), 'no chance to withdraw').toBe(false)
      expect(g.log.some((l) => l.msg.includes('must stay in the fight'))).toBe(true)
    })
  }

  it('without a Lord of Fear the attacked ally may withdraw', () => {
    const g = game()
    const attacker = summonCard(g, 0, 'Escyllion Cyclops', 1, 0)
    const victim = summonCard(g, 1, 'Bodach Bogeyman', 1, 1)
    const defender = summonCard(g, 1, 'Monks of Kobalsa', 1, 2)
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [{ x: 1, y: 1, region: 'surface' }], attack: { unit: victim.id } })
    answer(g, [defender.id])
    expect(g.prompts[0]?.kind).toBe('stayInFight')
  })
})
