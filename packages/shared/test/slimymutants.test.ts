import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, injectToHand, giveMana, act, answer } from './helpers'

// #2: "(3) → Transform an ally with Submerge into Slimy Mutants from your hand."
// Swan Maidens have Airborne + Submerge, so they are a legal target.
describe('Slimy Mutants transform a Submerge ally (Swan Maidens)', () => {
  it('paying 3 turns a Swan Maidens into Slimy Mutants', () => {
    const g = newGame(42, 0); keepBoth(g)
    const avatarId = g.players[0].avatarUnitId
    const cardId = injectToHand(g, 0, 'Slimy Mutants')
    giveMana(g, 0, 5)
    const swan = summonCard(g, 0, 'Swan Maidens', 2, 2); swan.enteredTurn = 0
    const manaBefore = g.players[0].mana

    act(g, 0, { t: 'activate', sourceId: avatarId, ability: `slime:${cardId}` } as any)
    // the ability prompts which Submerge ally to slough
    answer(g, [swan.id])

    expect(g.units[swan.id]?.name, 'the Swan Maidens became Slimy Mutants').toBe('Slimy Mutants')
    expect(g.players[0].hand.includes(cardId), 'the hand card was consumed').toBe(false)
    expect(g.players[0].mana, 'cost 3 mana').toBe(manaBefore - 3)
  })
})
