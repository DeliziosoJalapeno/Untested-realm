// "Target location" is region-locked like a target unit (rulebook: Targeting and Regions): a surface
// caster can't aim Minor Explosion underground. The engine must reject it itself — the bot (and any
// third-party client) sends raw `sq:x,y,region` targets, so a client-side-only check isn't enough.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, castMagicFail, waiveThreshold } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame(42, 0); keepBoth(g)
  for (let x = 1; x <= 3; x++) for (let y = 0; y <= 2; y++) placeSite(g, 0, 'Rustic Village', x, y)
  waiveThreshold(g, 0)
  const av = avatarOf(g, 0); av.x = 2; av.y = 0
  return g
}

const hit = (g: GameState, id: string) => g.units[id].damage > 0 // Sand Worm 4/4 Burrowing: lives underground, survives 3

describe('targeted square spells are region-locked', () => {
  it('a surface avatar cannot Minor Explosion an underground location', () => {
    const g = board()
    const mole = summonCard(g, 1, 'Sand Worm', 2, 1); mole.region = 'underground'
    const err = castMagicFail(g, 0, 'Minor Explosion', { targets: ['sq:2,1,underground'] })
    expect(err).toMatch(/same region/)
    expect(hit(g, mole.id)).toBe(false)
  })

  it('aiming at the surface of that square does not reach the burrowed unit', () => {
    const g = board()
    const mole = summonCard(g, 1, 'Sand Worm', 2, 1); mole.region = 'underground'
    castMagic(g, 0, 'Minor Explosion', { targets: ['sq:2,1,surface'] })
    expect(hit(g, mole.id)).toBe(false)
  })

  it('a target with no region resolves in the caster region', () => {
    const g = board()
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 1)
    castMagic(g, 0, 'Minor Explosion', { targets: ['sq:2,1'] })
    expect(g.units[foe.id].damage).toBe(3)
  })

  it('an underground caster can blast underground', () => {
    const g = board()
    const av = avatarOf(g, 0); av.region = 'underground' // stand-in for a burrowed spellcaster
    const mole = summonCard(g, 1, 'Sand Worm', 2, 1); mole.region = 'underground'
    castMagic(g, 0, 'Minor Explosion', { targets: ['sq:2,1,underground'] })
    expect(hit(g, mole.id), 'the burrowed unit is blasted').toBe(true)
  })
})

describe('"nearby" locations are same-region', () => {
  it('Blink cannot teleport a surface ally to an underground location', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Sand Worm', 2, 1) // Burrowing: it COULD live underground — the range still forbids it
    const err = castMagicFail(g, 0, 'Blink', { targets: [ally.id, 'sq:2,2,underground'] })
    expect(err).toMatch(/same region/)
    expect(g.units[ally.id].region).toBe('surface')
  })

  it('Blink to a surface location nearby still works', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Sand Worm', 2, 1)
    castMagic(g, 0, 'Blink', { targets: [ally.id, 'sq:2,2,surface'] })
    expect([g.units[ally.id].x, g.units[ally.id].y, g.units[ally.id].region]).toEqual([2, 2, 'surface'])
  })
})
