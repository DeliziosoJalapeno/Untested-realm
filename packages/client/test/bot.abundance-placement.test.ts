// Abundance boosts whoever controls each covered site, so the bot must cast it over its OWN sites —
// never over the opponent's (it used to: the eval scored any aura flatly by who cast it). The scoring is
// pinned in shared test/eval.interrogator.test.ts; this guards the end-to-end choice.
import { describe, it, expect } from 'vitest'
import { applyAction, avatarOf, createGame, starterDecks, type GameState, type PlayerId } from '@sorcery/shared'
import { searchBotAction, resetSearchState } from '../src/bot_search'

function board(): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['Alice', 'Bob'], 11, 0)
  g.prompts = []
  g.phase = 'main'
  g.activePlayer = 0
  g.turn = 9
  let n = 0
  const site = (owner: PlayerId, x: number, y: number) => {
    const id = `s${n++}`
    const name = owner === 0 ? 'Stream' : 'Spire' // my water sites meet Abundance's threshold
    g.cards[`c${id}`] = { id: `c${id}`, name, owner }
    g.sites[id] = { id, cardId: `c${id}`, name, owner, controller: owner, x, y, tapped: false, isRubble: false }
  }
  // my 4 sites in my back rows, theirs (5) in theirs
  for (const [x, y] of [[1, 0], [2, 0], [1, 1], [2, 1]]) site(0, x, y)
  for (const [x, y] of [[1, 2], [2, 2], [3, 2], [1, 3], [2, 3]]) site(1, x, y)
  g.cards.cab = { id: 'cab', name: 'Abundance', owner: 0 }
  g.players[0].hand = ['cab']
  g.players[0].mana = 5
  avatarOf(g, 0 as PlayerId).tapped = false
  return g
}

describe('the search bot places Abundance over its own sites', () => {
  it('casts it where it boosts more of its sites than the opponent\'s', () => {
    resetSearchState()
    const g = board()
    // play the turn out (it may draw a site first) until it casts Abundance or passes
    for (let i = 0; i < 12 && g.activePlayer === 0 && !g.prompts.length; i++) {
      const action = searchBotAction(g, 0 as PlayerId)
      if (action.t === 'endTurn') break
      expect(applyAction(g, 0, action).ok, JSON.stringify(action)).toBe(true)
      if (Object.values(g.auras).some((a) => a.name === 'Abundance')) break
    }
    const aura = Object.values(g.auras).find((a) => a.name === 'Abundance')!
    expect(aura, 'Abundance is in play').toBeTruthy()
    const covered = Object.values(g.sites).filter((s) => aura.squares.some((q) => q.x === s.x && q.y === s.y))
    const mine = covered.filter((s) => s.controller === 0).length
    const theirs = covered.filter((s) => s.controller === 1).length
    expect(mine, JSON.stringify(aura.squares)).toBe(4) // the block covering all four of mine
    expect(theirs).toBe(0)
  })
})
