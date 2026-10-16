import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, injectToHand, giveMana, placeSite, summonCard, waiveThreshold } from './helpers'
import { legalActions, type GameState } from '../src'
import '../src/cards/scripts/index'

// Reveal-from-hand transforms — Slimy Mutants ("(3) → Transform an ally with Submerge into Slimy
// Mutants from your hand.") and Sir Gareth (a Mortal ally) — were offered whenever the cost was
// affordable, even with NO eligible ally: activating spent the mana and only logged "No submerging
// ally to mutate." Offer them only while an eligible ally exists.
describe('a reveal-from-hand transform needs an eligible ally', () => {
  const offers = (g: GameState, cardId: string) =>
    legalActions(g, 0).filter((a) => a.t === 'activate' && String(a.ability).endsWith(`:${cardId}`))

  it('Slimy Mutants: only with a submerging ally', () => {
    const g = newGame(); keepBoth(g)
    const slime = injectToHand(g, 0, 'Slimy Mutants')
    giveMana(g, 0, 9); waiveThreshold(g, 0)
    expect(offers(g, slime), 'no ally at all').toEqual([])
    summonCard(g, 0, 'Bone Jumble', 2, 2)
    expect(offers(g, slime), 'an ally without Submerge').toEqual([])
    summonCard(g, 0, 'Coy Nixie', 2, 2)
    expect(offers(g, slime), 'a submerging ally').toHaveLength(1)
  })

  it('Sir Gareth: only with an eligible ally', () => {
    const g = newGame(); keepBoth(g)
    const gareth = injectToHand(g, 0, 'Sir Gareth')
    placeSite(g, 0, 'Spire', 0, 3) // (A)
    placeSite(g, 0, 'Autumn River', 1, 3) // (W)
    expect(offers(g, gareth), 'no ally at all').toEqual([])
    summonCard(g, 0, 'Sea Raider', 2, 2) // Mortal
    expect(offers(g, gareth), 'a Mortal ally').toHaveLength(1)
  })
})
