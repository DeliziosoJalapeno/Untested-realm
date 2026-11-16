import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, injectToHand, giveMana, act, answer } from './helpers'

// Codex Transform: "if the old form was tapped, had taken damage, and was carrying an artifact, the new form
// will also be tapped, have damage, and will be carrying that artifact." (owner ruling 2026-11-14: Sir Gareth
// and Slimy Mutants keep damage)
describe('a transformed minion keeps its damage', () => {
  it('Slimy Mutants: a Swan Maidens with 1 damage becomes Slimy Mutants with 1 damage', () => {
    const g = newGame(42, 0); keepBoth(g)
    const avatarId = g.players[0].avatarUnitId
    const cardId = injectToHand(g, 0, 'Slimy Mutants')
    giveMana(g, 0, 5)
    const swan = summonCard(g, 0, 'Swan Maidens', 2, 2); swan.enteredTurn = 0
    swan.damage = 1

    act(g, 0, { t: 'activate', sourceId: avatarId, ability: `slime:${cardId}` } as any)
    answer(g, [swan.id])

    expect(g.units[swan.id]?.name).toBe('Slimy Mutants')
    expect(g.units[swan.id]?.damage).toBe(1)
  })
})
