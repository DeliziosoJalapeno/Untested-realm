// Troll Bridge: 'The first time a lone enemy enters here each turn, strike it unless they discard a card.'
// Hotwheel rolls two steps in one action across two Troll Bridges. The second toll used to offer the hand as
// it was before the first was paid (both were queued at once), so choosing the card already discarded paid
// nothing and the troll struck. Each toll must be a real choice from the current hand — and, per the
// storyline, the roll waits on each bridge until its toll is settled.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, answer } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

function rollOverTwoBridges() {
  const g = newGame() as GameState; keepBoth(g)
  placeSite(g, 0, 'Rustic Village', 2, 0)
  placeSite(g, 1, 'Troll Bridge', 2, 1)
  placeSite(g, 1, 'Troll Bridge', 2, 2)
  const hw = summonCard(g, 0, 'Hotwheel', 2, 0)
  getScript('Hotwheel')!.genesis!(makeCtx(g, hw.id, 0, []))
  return { g, hw }
}

describe('Troll Bridge: two tolls from one move', () => {
  it('asks the tolls one at a time: the second only once the first is settled', () => {
    const { g } = rollOverTwoBridges()
    expect(g.prompts.map((p) => p.cont)).toEqual(['script:Troll Bridge:toll'])
    answer(g, [0])
    expect(g.prompts.map((p) => p.cont)).toEqual(['script:Troll Bridge:toll'])
  })

  it('the second toll offers the hand left after the first, and paying both keeps Hotwheel safe', () => {
    const { g, hw } = rollOverTwoBridges()
    const hand = [...g.players[0].hand]
    answer(g, [0]) // pay the first toll with the first card
    expect(g.players[0].hand).toEqual(hand.slice(1))
    expect(g.prompts[0].data.cards, 'the paid card is not offered again').toEqual(hand.slice(1).map((id) => g.cards[id].name))
    answer(g, [0]) // pay the second toll with the first card still in hand
    expect(g.players[0].hand).toEqual(hand.slice(2))
    expect(g.units[hw.id]?.damage, 'neither troll struck').toBe(0)
  })

  it('declining both tolls means two strikes', () => {
    const { g, hw } = rollOverTwoBridges()
    const handSize = g.players[0].hand.length
    answer(g, [])
    expect(g.units[hw.id], 'the first troll strikes for 3, killing the Hotwheel').toBeUndefined()
    expect(g.players[0].hand.length).toBe(handSize)
  })
})
