// Rubble CAN be flooded — flooded rubble becomes a body of water (as The Great Drowning of Men shows).
// Flood effects must not skip rubble.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, giveArtifact, castMagic, waiveThreshold } from './helpers'
import { avatarOf, getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('flood effects flood rubble', () => {
  it('Wrath of the Sea floods adjacent rubble and submerges the avatar’s carried artifact', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Aqueduct', 0, 0) // a water site (the body of water)
    const rubble = placeSite(g, 0, 'Rustic Village', 1, 0); rubble.isRubble = true // dry rubble beside the water
    const av = avatarOf(g, 0); av.x = 0; av.y = 0; av.region = 'surface'
    const art = giveArtifact(g, av, 'Flaming Sword')

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Wrath of the Sea', {})

    expect(g.sites[rubble.id]?.flooded, 'the adjacent rubble was flooded into water').toBe(true)
    expect(g.artifacts[art.id]?.region, 'the avatar’s carried artifact was submerged').toBe('underwater')
    expect(g.units[av.id].region, 'the avatar itself stays on the surface').toBe('surface')
  })

  it('Flood floods a rubble site in its area', () => {
    const g = newGame() as GameState; keepBoth(g)
    const rubble = placeSite(g, 0, 'Rustic Village', 2, 2); rubble.isRubble = true
    const aura = { id: 'rflood', cardId: 'cflood', name: 'Flood', controller: 0, squares: [{ x: 2, y: 2 }] } as any
    g.auras[aura.id] = aura
    getScript('Flood')!.genesis!({ state: g, sourceId: aura.id, controller: 0 } as any)
    expect(g.sites[rubble.id]?.flooded, 'rubble under the Flood is flooded').toBe(true)
  })

  it('Great Old One drowns the whole realm, rubble included', () => {
    const g = newGame() as GameState; keepBoth(g)
    const rubble = placeSite(g, 0, 'Rustic Village', 2, 2); rubble.isRubble = true
    const land = placeSite(g, 0, 'Rustic Village', 0, 0)
    getScript('Great Old One')!.genesis!({ state: g, sourceId: 'x', controller: 0 } as any)
    expect(g.sites[rubble.id]?.flooded, 'rubble drowns too').toBe(true)
    expect(g.sites[land.id]?.flooded, 'and so does the dry land').toBe(true)
  })
})
