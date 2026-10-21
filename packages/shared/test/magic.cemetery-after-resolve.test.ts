// A Magic reaches the cemetery only once it has FULLY resolved — not while it is still waiting on a
// choice. So Return to Nature can't pick itself out of the cemetery it is about to go to.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, castMagic, waiveThreshold, answer, injectToHand } from './helpers'
import { type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Magics go to the cemetery after resolving', () => {
  it('Return to Nature is not among the cards it can return', () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    const p = g.players[0]
    const old = injectToHand(g, 0, 'Bone Jumble')
    p.hand = p.hand.filter((id) => id !== old); p.cemetery.push(old)
    castMagic(g, 0, 'Return to Nature')
    answer(g, 'yours')
    const prompt: any = g.prompts[0]
    expect(prompt?.kind).toBe('chooseCards')
    expect(prompt.data.cards, 'only the card already there — not the spell being cast').toEqual(['Bone Jumble'])
    expect(p.cemetery.some((id) => g.cards[id].name === 'Return to Nature'), 'still resolving').toBe(false)
    answer(g, [0])
    expect(p.cemetery.map((id) => g.cards[id].name), 'now resolved → in the cemetery').toEqual(['Return to Nature'])
  })

  it('it reaches the cemetery as soon as its last choice is made', () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    castMagic(g, 0, 'Return to Nature')
    answer(g, 'yours') // empty cemetery: draws and finishes
    expect(g.prompts.length).toBe(0)
    expect(g.players[0].cemetery.map((id) => g.cards[id].name)).toEqual(['Return to Nature'])
  })
})
