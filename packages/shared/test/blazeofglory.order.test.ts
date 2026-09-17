// Blaze of Glory: "An ally fights each enemy near it, ONE AT A TIME." With 2+ nearby foes
// the controller chooses the order, and fights resolve sequentially (a foe that dies to the
// first fight's side effects is simply skipped). The hero is undying until every fight is done.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, castMagic, waiveThreshold, answer } from './helpers'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('Blaze of Glory fights nearby foes one at a time, in a chosen order', () => {
  it('prompts to order 2+ foes, then resolves each fight; the last auto-resolves', () => {
    const g: GameState = newGame(); keepBoth(g); waiveThreshold(g, 0)
    const hero = summonCard(g, 0, 'Escyllion Cyclops', 0, 1) // 6/6, corner (away from enemy avatar at 2,3)
    const a = summonCard(g, 1, 'Bone Jumble', 0, 0) // 1/1 foe
    const b = summonCard(g, 1, 'Bone Jumble', 1, 1) // 1/1 foe

    castMagic(g, 0, 'Blaze of Glory', { targets: [hero.id] })
    // two nearby foes → an ordering prompt naming both
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    expect(g.prompts[0]?.data.candidates.slice().sort()).toEqual([a.id, b.id].sort())
    answer(g, [b.id]) // fight b first
    // only one foe left → resolved automatically, no second prompt
    expect(g.prompts.length).toBe(0)
    expect(g.units[a.id], 'both foes were fought and died').toBeUndefined()
    expect(g.units[b.id]).toBeUndefined()
    expect(g.units[hero.id], 'the 6/6 hero survived two 1-damage blows').toBeTruthy()
    expect(g.units[hero.id]?.damage).toBe(2)
  })

  it('a single nearby foe is fought with NO prompt (single-option auto-resolve)', () => {
    const g: GameState = newGame(); keepBoth(g); waiveThreshold(g, 0)
    const hero = summonCard(g, 0, 'Escyllion Cyclops', 0, 1)
    const only = summonCard(g, 1, 'Bone Jumble', 0, 0)
    castMagic(g, 0, 'Blaze of Glory', { targets: [hero.id] })
    expect(g.prompts.length, 'no ordering prompt for a lone foe').toBe(0)
    expect(g.units[only.id]).toBeUndefined()
  })
})
