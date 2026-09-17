import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, answer } from './helpers'
import { dealDamageToUnit } from '../src/engine/effects'
import type { GameState } from '../src'

function imposterGame(): GameState {
  const g = newGame(42, 0)
  g.units[g.players[0].avatarUnitId].name = 'Imposter'
  keepBoth(g)
  g.players[0].mana = 20 // after the start-of-turn mana reset
  return g
}

describe('Imposter masks ONLY avatars in your collection', () => {
  it('offers just the collection avatars (not every avatar in the game), then banishes the chosen one', () => {
    const g = imposterGame()
    g.players[0].collection = { Animist: 1, Pathfinder: 1, Excalibur: 1 } // an artifact too — must be ignored
    act(g, 0, { t: 'activate', sourceId: g.players[0].avatarUnitId, ability: 'imposter:mask' })

    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseCards')
    // exactly the collection's AVATARS — not Excalibur, not the whole avatar roster
    expect(new Set(p!.data.cards)).toEqual(new Set(['Animist', 'Pathfinder']))

    const pick = (p!.data.cards as string[]).indexOf('Animist')
    answer(g, [pick])

    expect(g.flow?.imposterMask?.[0]).toBe('Animist') // now wearing Animist's face
    expect(g.players[0].collection.Animist ?? 0).toBe(0) // banished from the collection
    expect(g.players[0].collection.Pathfinder).toBe(1) // the other avatar untouched
    expect(g.players[0].collection.Excalibur).toBe(1) // the artifact untouched
  })

  it('with no avatar in the collection, the ability finds nothing to mask (no prompt)', () => {
    const g = imposterGame()
    g.players[0].collection = { Excalibur: 2 } // no avatars
    act(g, 0, { t: 'activate', sourceId: g.players[0].avatarUnitId, ability: 'imposter:mask' })
    expect(g.prompts.some((p) => p.kind === 'chooseCards')).toBe(false)
    expect(g.flow?.imposterMask?.[0]).toBeUndefined()
  })
})

describe('a mask forwards its damage-reduction while worn', () => {
  it('Imposter wearing Ironclad takes 3 damage as 3-2 = 1 (reduction applies before the mask cracks)', () => {
    const g = imposterGame()
    const av = g.units[g.players[0].avatarUnitId]
    g.flow = g.flow ?? {}
    g.flow.imposterMask = { 0: 'Ironclad' } // "Takes 2 less damage."
    const before = av.life ?? 0
    dealDamageToUnit(g, av, 3, 1, { source: { player: 1, kind: 'effect' } })
    expect((av.life ?? 0), 'only 1 damage lands (3 reduced by 2)').toBe(before - 1)
  })

  it('no reduction once the mask is gone', () => {
    const g = imposterGame()
    const av = g.units[g.players[0].avatarUnitId]
    const before = av.life ?? 0
    dealDamageToUnit(g, av, 3, 1, { source: { player: 1, kind: 'effect' } })
    expect((av.life ?? 0), 'bare Imposter takes the full 3').toBe(before - 3)
  })
})
