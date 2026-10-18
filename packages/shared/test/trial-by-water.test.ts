// Trial by Water: "An ally submerges target minion it's nearby." — "an ally" is any unit you control, your
// Avatar included; the target must be a minion nearby THAT ally.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, castMagicFail, waiveThreshold } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame(42, 0); keepBoth(g)
  for (let x = 0; x <= 4; x++) for (let y = 0; y <= 3; y++) placeSite(g, 0, 'Stream', x, y) // all water
  waiveThreshold(g, 0)
  return g
}

describe('Trial by Water', () => {
  it('your Avatar counts as the ally: it submerges a target minion nearby it', () => {
    const g = board()
    const av = avatarOf(g, 0)
    const foe = summonCard(g, 1, 'Bone Jumble', av.x, av.y === 0 ? 1 : av.y - 1)
    castMagic(g, 0, 'Trial by Water', { targets: [av.id, foe.id] })
    expect(g.units[foe.id]?.region ?? 'gone').not.toBe('surface')
  })

  it('a target that is not nearby the chosen ally is rejected', () => {
    const g = board()
    const av = avatarOf(g, 0)
    const far = summonCard(g, 1, 'Bone Jumble', (av.x + 3) % 5, av.y === 0 ? 3 : 0)
    castMagicFail(g, 0, 'Trial by Water', { targets: [av.id, far.id] })
    expect(g.units[far.id].region).toBe('surface')
  })
})
