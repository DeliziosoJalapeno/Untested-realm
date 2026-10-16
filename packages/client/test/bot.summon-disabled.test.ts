// The bot summons a minion as close to the enemy avatar as it can. A minion that would arrive
// DISABLED there is a wasted card: Bound Spirit ("Disabled unless adjacent to an allied
// Spellcaster") dropped beside the ENEMY avatar never acts. Prefer any spot where it can act.

import { describe, it, expect } from 'vitest'
import { avatarOf, createGame, isDisabled, starterDecks, type GameState, type PlayerId, type UnitState } from '@sorcery/shared'
import { botAction } from '../src/bot'
import { searchBotAction } from '../src/bot_search'

function boundSpiritBoard(): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['Alice', 'Bob'], 7, 1)
  g.prompts = []
  g.phase = 'main'
  g.activePlayer = 1
  const me = avatarOf(g, 1 as PlayerId)
  // a column of Bob's sites running from his avatar to the square beside Alice's
  for (let y = 0; y < 4; y++) {
    const id = `s${y}`
    g.cards[`c${id}`] = { id: `c${id}`, name: 'Spire', owner: 1 }
    g.sites[id] = { id, cardId: `c${id}`, name: 'Spire', owner: 1, controller: 1, x: me.x, y, tapped: false, isRubble: false }
  }
  me.tapped = true // nothing to do but cast
  g.cards['bound'] = { id: 'bound', name: 'Bound Spirit', owner: 1 }
  g.players[1].hand = ['bound']
  g.players[1].mana = 9
  return g
}

/** would a Bound Spirit summoned at the action's square start out disabled? */
function arrivesDisabled(g: GameState, at: { x: number; y: number }): boolean {
  const probe = { ...avatarOf(g, 1 as PlayerId), id: 'probe', name: 'Bound Spirit', isAvatar: false, x: at.x, y: at.y } as UnitState
  return isDisabled(g, probe)
}

describe('bot summons a minion where it is not disabled on arrival', () => {
  for (const [label, choose] of [['botAction', botAction], ['searchBotAction', searchBotAction]] as const) {
    it(`${label}: Bound Spirit goes next to its own avatar, not beside the enemy's`, () => {
      const g = boundSpiritBoard()
      const action = choose(g, 1 as PlayerId)
      expect(action.t).toBe('castSpell')
      if (action.t !== 'castSpell') return
      expect(action.cardId).toBe('bound')
      expect(action.at, 'a summon carries its square').toBeTruthy()
      expect(arrivesDisabled(g, action.at!), `summoned disabled at ${JSON.stringify(action.at)}`).toBe(false)
    })
  }
})
