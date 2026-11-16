// The Fast bot answers an effect-cast magic's target-location prompt (Archimago echoing Lightning Bolt)
// by aiming at enemies, like a cast from hand — it used to answer with its own empty site, so the
// echoed bolt dealt no damage.
import { it, expect } from 'vitest'
import { applyAction, avatarOf, createGame, starterDecks, type GameState, type PlayerId } from '@sorcery/shared'
import { botAction } from '../src/bot'

function board(): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['Alice', 'Bob'], 11, 0)
  g.prompts = []; g.phase = 'main'; g.activePlayer = 0; g.turn = 9
  let n = 0
  const site = (owner: PlayerId, x: number, y: number) => {
    const id = `s${n++}`; const name = owner === 0 ? 'Spire' : 'Stream'
    g.cards[`c${id}`] = { id: `c${id}`, name, owner }
    g.sites[id] = { id, cardId: `c${id}`, name, owner, controller: owner, x, y, tapped: false, isRubble: false } as any
  }
  for (const [x, y] of [[1, 0], [2, 0], [1, 1], [2, 1], [3, 1]]) site(0, x, y)
  for (const [x, y] of [[1, 2], [2, 2], [3, 2], [1, 3], [2, 3]]) site(1, x, y)
  const av = avatarOf(g, 0); av.name = 'Archimago'; av.x = 2; av.y = 1
  const foe = avatarOf(g, 1); foe.x = 2; foe.y = 3
  for (let i = 0; i < 3; i++) { const id = `cm${i}`; g.cards[id] = { id, name: 'Lightning Bolt', owner: 0 } as any; g.players[0].cemetery.push(id) }
  g.players[0].mana = 20
  return g
}

it("the Fast bot aims Archimago's echoed Lightning Bolt at the enemy, not its own site", () => {
  const g = board()
  const av = avatarOf(g, 0)
  expect(applyAction(g, 0, { t: 'activate', sourceId: av.id, ability: 'echo' } as any).ok).toBe(true)
  for (let i = 0; i < 6 && g.prompts.length; i++) expect(applyAction(g, 0, botAction(g, 0)).ok).toBe(true)
  expect(g.log.some((l) => /casts Lightning Bolt/.test(l.msg)), 'the copy was cast').toBe(true)
  expect(avatarOf(g, 1).life, 'the bolt hit the enemy avatar').toBe(17)
})
