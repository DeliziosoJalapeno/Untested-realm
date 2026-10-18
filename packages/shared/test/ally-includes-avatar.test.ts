// "An ally" means any unit you control — your Avatar included — unless the card says "allied minion".
// Consecrate/Desecrate, Harpyon Urge, Willing Tribute, Dream-Quest and Trial by Water (its own file) used to
// accept minions only.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, waiveThreshold, answer } from './helpers'
import { avatarOf, siteAt, type GameState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame(42, 0); keepBoth(g)
  for (let x = 0; x <= 4; x++) for (let y = 0; y <= 3; y++) placeSite(g, 0, 'Active Volcano', x, y)
  waiveThreshold(g, 0)
  return g
}

describe('"an ally" includes your Avatar', () => {
  it('Consecrate: your Avatar wards its site', () => {
    const g = board()
    const av = avatarOf(g, 0)
    castMagic(g, 0, 'Consecrate', { targets: [av.id] })
    expect((siteAt(g, av.x, av.y) as any).ward).toBe(true)
    if (g.prompts[0]) answer(g, false) // decline the transform
  })

  it('Dream-Quest: a legal target on your Avatar, but nothing happens (FAQ: avatars can\'t be disabled)', () => {
    const g = board()
    const av = avatarOf(g, 0)
    castMagic(g, 0, 'Dream-Quest', { targets: [av.id] })
    expect(g.units[av.id].disabled).toBeFalsy()
    expect(g.units[av.id].counters?.asleep).toBeUndefined()
  })

  it('Harpyon Urge: your Avatar flies to a weaker minion and strikes it', () => {
    const g = board()
    const av = avatarOf(g, 0)
    av.modifiers.push({ kind: 'power', amount: 2, duration: 'permanent', turn: 0, sourcePlayer: 0 }) // 3 power vs the 1/1
    const prey = summonCard(g, 1, 'Bone Jumble', av.x, av.y === 0 ? 2 : av.y - 2)
    castMagic(g, 0, 'Harpyon Urge', { targets: [av.id, prey.id] })
    expect(g.units[prey.id], 'the 1/1 was struck down').toBeUndefined()
  })
})
