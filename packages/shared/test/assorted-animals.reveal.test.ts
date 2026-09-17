// Assorted Animals: "Search your spellbook for different Beasts …, REVEAL them, and put them in
// your hand." It rolled its own tutor and pushed the Beasts to hand WITHOUT revealing them — the
// opponent never saw what was fetched. It must reveal each Beast (like the other spellbook tutors).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { getScript, makeCtx } from '../src'

describe('Assorted Animals reveals the Beasts it fetches', () => {
  it('a fetched Beast is put into hand AND revealed to the opponent', () => {
    const g = newGame(); keepBoth(g)
    const p = g.players[0]
    p.mana = 5
    const beast = 'Fine Courser' // Beast, cost 2
    const topId = p.spellbook[0]
    g.cards[topId].name = beast // plant a known Beast at the top of the spellbook
    const handBefore = p.hand.length

    getScript('Assorted Animals')!.conts!.took!(
      makeCtx(g, p.avatarUnitId, 0, []),
      { x: 2, spentNames: [] },
      beast,
    )

    expect(p.hand.length, 'the fetched Beast lands in hand').toBe(handBefore + 1)
    const reveals = JSON.stringify(g.flow?.reveals ?? [])
    expect(reveals.includes(beast), 'the Beast was revealed to the opponent').toBe(true)
  })
})
