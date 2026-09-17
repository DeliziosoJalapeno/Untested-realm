// Alternative art travels with the deck: each card instance is stamped with the owner's chosen art at
// game creation, and viewFor sends it to the opponent ONLY for cards they can see (a public avatar yes; a
// hidden spellbook card no) — so art is revealed-only and never leaks unseen cards.
import { describe, it, expect } from 'vitest'
import { createGame, viewFor, applyJudge, starterDecks, type DeckList } from '../src'

describe('alternative art is baked on instances and revealed-only', () => {
  it('stamps the owner art and only shows it for cards the opponent can see', () => {
    const base = starterDecks[0] as DeckList
    const spellName = Object.keys(base.spellbook)[0]
    const deck0: DeckList = { ...base, art: { [base.avatar]: 'AV-alt', [spellName]: 'SP-alt' } }
    const g = createGame([deck0, starterDecks[1] as DeckList], ['A', 'B'], 12345)

    // baked onto the instances
    const avatarCard = g.cards[g.units[g.players[0].avatarUnitId].cardId]
    expect(avatarCard.art, 'avatar art baked').toBe('AV-alt')
    const spellCard = g.players[0].spellbook.map((id) => g.cards[id]).find((c) => c.name === spellName)!
    expect(spellCard.art, 'spellbook card art baked').toBe('SP-alt')

    // opponent's view: the avatar is public → its art is visible; the hidden spellbook card isn't sent at all
    const opp = viewFor(g, 1)
    expect(opp.cards[avatarCard.id]?.art, 'opponent sees the public avatar art').toBe('AV-alt')
    expect(opp.cards[spellCard.id], 'a hidden card is not leaked (no art, not even the instance)').toBeUndefined()

    // player 2 with NO art choices → their avatar carries no override
    const oppAvatar = g.cards[g.units[g.players[1].avatarUnitId].cardId]
    expect(oppAvatar.art, 'no art chosen → undefined').toBeUndefined()
  })

  it("the editor's setArt op changes and clears a card's art", () => {
    const g = createGame([starterDecks[0] as DeckList, starterDecks[1] as DeckList], ['A', 'B'], 7)
    const cardId = g.units[g.players[0].avatarUnitId].cardId
    expect(applyJudge(g, 0, { k: 'setArt', cardId, slug: '999-x-op-s' })).toBeNull()
    expect(g.cards[cardId].art).toBe('999-x-op-s')
    expect(applyJudge(g, 0, { k: 'setArt', cardId, slug: null })).toBeNull()
    expect(g.cards[cardId].art, 'null clears back to default').toBeUndefined()
    expect(applyJudge(g, 0, { k: 'setArt', cardId: 'nope', slug: 'x' }), 'unknown card errors').toBeTruthy()
  })
})
