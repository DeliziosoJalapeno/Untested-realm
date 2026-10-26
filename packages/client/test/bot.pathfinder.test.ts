// A Pathfinder plays its sites only through its own tap ability (`blaze`): "tap: draw a site" is not
// open to it. The bot still offered that draw — the engine refused it every turn ("Pathfinder plays
// sites through its own ability.") and a computer Pathfinder never laid a site after the first.
import { describe, it, expect } from 'vitest'
import { applyAction, avatarOf, createGame, starterDecks, type GameState, type PlayerId } from '@sorcery/shared'
import { botAction, botNeedsToAct } from '../src/bot'
import '../../../packages/shared/src/cards/scripts/index'

function pathfinderGame(seed: number): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['Alice', 'Bob'], seed, 0)
  avatarOf(g, 0 as PlayerId).name = 'Pathfinder'
  return g
}

/** both seats bot-driven for a few turns; returns the refused actions and how often Pathfinder blazed */
function play(seed: number, turns: number): { refused: string[]; blazes: number } {
  const g = pathfinderGame(seed)
  const refused: string[] = []
  let blazes = 0
  for (let step = 0; step < 400 && g.turn <= turns && g.winner == null; step++) {
    const seat = ([0, 1] as PlayerId[]).find((p) => botNeedsToAct(g, p))
    if (seat == null) break
    const action = botAction(g, seat)
    const res = applyAction(g, seat, action)
    if (!res.ok) {
      refused.push(`seat ${seat} turn ${g.turn} ${JSON.stringify(action)}: ${res.error}`)
      applyAction(g, seat, { t: 'endTurn' }) // keep the game moving past the refusal
      continue
    }
    if (action.t === 'activate' && action.ability === 'blaze') blazes++
  }
  return { refused, blazes }
}

describe('the bot plays a Pathfinder by its own ability', () => {
  it('never offers "tap: draw a site", and blazes trails instead', () => {
    let blazes = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = play(seed, 10)
      expect(r.refused, `seed ${seed}`).toEqual([])
      blazes += r.blazes
    }
    expect(blazes, 'Pathfinder used its ability').toBeGreaterThan(0)
  })
})
