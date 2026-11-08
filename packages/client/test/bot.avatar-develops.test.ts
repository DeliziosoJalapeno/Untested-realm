// While developing, the Avatar's Tap goes on a site — not on wandering off to pick a fight. A guard on the
// end-to-end choice; the scoring itself (avatarIdle/avatarWander for a roaming Avatar, judged on my latest
// turn, and avatarConduct at a search leaf) is pinned in shared test/avatar.wander.test.ts.
import { describe, it, expect } from 'vitest'
import { applyAction, avatarOf, createGame, starterDecks, type GameState, type PlayerId } from '@sorcery/shared'
import { searchBotAction, resetSearchState } from '../src/bot_search'

function board(): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['Alice', 'Bob'], 11, 0)
  g.prompts = []
  g.phase = 'main'
  g.activePlayer = 0
  g.turn = 5 // past the turn-2 "site in front" opening shortcut, so the search itself decides
  const me = avatarOf(g, 0 as PlayerId)
  for (const [i, x] of [1, 2].entries()) {
    const id = `s${i}`
    g.cards[`c${id}`] = { id: `c${id}`, name: 'Spire', owner: 0 }
    g.sites[id] = { id, cardId: `c${id}`, name: 'Spire', owner: 0, controller: 0, x, y: 0, tapped: false, isRubble: false }
  }
  // a lone enemy 1/1 one step from my Avatar: a free kill, if the Avatar spends its Tap on it
  g.cards.cfoe = { id: 'cfoe', name: 'Bone Jumble', owner: 1 }
  g.units.ufoe = {
    id: 'ufoe', cardId: 'cfoe', name: 'Bone Jumble', owner: 1, controller: 1, isAvatar: false,
    x: me.x, y: me.y + 1, region: 'surface', tapped: false, damage: 0, enteredTurn: 0,
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  } as any
  g.cards.csite = { id: 'csite', name: 'Spire', owner: 0 }
  g.players[0].hand = ['csite']
  g.players[0].mana = 0
  return g
}

describe('the search bot develops instead of roaming', () => {
  it('plays its site rather than walking the Avatar off to a fight', () => {
    resetSearchState()
    const g = board()
    const action = searchBotAction(g, 0 as PlayerId)
    expect(action.t, JSON.stringify(action)).toBe('avatarSite')
    expect(applyAction(g, 0, action).ok).toBe(true)
  })
})
