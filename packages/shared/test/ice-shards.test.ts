// Ice Shards: "Shoot three projectiles, one at a time. Each deals 1 damage but melts before the third
// step." No "in the same direction" (unlike Magic Missiles / Firebolts) → each shard is aimed separately.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, answer, waiveThreshold } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame(42, 0); keepBoth(g)
  for (let x = 0; x <= 4; x++) for (let y = 0; y <= 3; y++) placeSite(g, 0, 'Active Volcano', x, y)
  waiveThreshold(g, 0)
  const av = avatarOf(g, 0); av.x = 2; av.y = 1
  const foe = avatarOf(g, 1); foe.x = 4; foe.y = 3 // out of every lane the tests aim down
  return g
}

describe('Ice Shards', () => {
  it('each of the three shards picks its own direction', () => {
    const g = board()
    const north = summonCard(g, 1, 'Stygian Archers', 2, 2)
    const east = summonCard(g, 1, 'Stygian Archers', 3, 1)
    const west = summonCard(g, 1, 'Stygian Archers', 1, 1)
    castMagic(g, 0, 'Ice Shards', { extra: { direction: 'n' } })
    expect(g.units[north.id].damage, 'shard 1 north').toBe(1)
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    expect(g.prompts[0].title).toMatch(/shard 2 of 3/)
    answer(g, 'e')
    expect(g.units[east.id].damage, 'shard 2 east').toBe(1)
    expect(g.prompts[0].title).toMatch(/shard 3 of 3/)
    answer(g, 'w')
    expect(g.units[west.id].damage, 'shard 3 west').toBe(1)
    expect(g.prompts.length, 'done after three').toBe(0)
  })

  it('the same direction three times still works', () => {
    const g = board()
    const big = summonCard(g, 1, 'Escyllion Cyclops', 2, 2) // 6/6 survives all three
    castMagic(g, 0, 'Ice Shards', { extra: { direction: 'n' } })
    answer(g, 'n')
    answer(g, 'n')
    expect(g.units[big.id].damage).toBe(3)
  })

  it('shards melt before the third step', () => {
    const g = board()
    const far = summonCard(g, 1, 'Escyllion Cyclops', 2, 3) // 2 steps north of (2,1): in range
    const west = summonCard(g, 1, 'Escyllion Cyclops', 0, 1) // 2 steps west: in range
    const east = summonCard(g, 1, 'Escyllion Cyclops', 4, 1) // 2 steps east: in range
    castMagic(g, 0, 'Ice Shards', { extra: { direction: 'n' } })
    answer(g, 'w')
    answer(g, 'e')
    expect([far, west, east].map((u) => g.units[u.id].damage)).toEqual([1, 1, 1])
    // a target 3 steps away is never reached
    const g2 = board()
    const av = avatarOf(g2, 0); av.x = 0; av.y = 0
    const out = summonCard(g2, 1, 'Escyllion Cyclops', 0, 3)
    castMagic(g2, 0, 'Ice Shards', { extra: { direction: 'n' } })
    answer(g2, 'n')
    answer(g2, 'n')
    expect(g2.units[out.id].damage).toBe(0)
  })
})
