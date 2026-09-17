import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { getScript, canActivate, avatarOf, type GameState } from '../src'

const floodDef = () => getScript('Avatar of Water')!.abilities!.find((a) => a.key === 'flood')!
const clearSitesUnder = (g: GameState, x: number, y: number) => {
  for (const id of Object.keys(g.sites)) if (g.sites[id].x === x && g.sites[id].y === y) delete g.sites[id]
}

describe('Avatar of Water — flood needs a body of water + adjacency', () => {
  it('is a fish out of water (unavailable) when not on a water site', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0); avatar.name = 'Avatar of Water'
    clearSitesUnder(g, avatar.x, avatar.y)
    placeSite(g, 0, 'Arid Desert', avatar.x, avatar.y) // dry land under the avatar
    expect(floodDef().available!(g, avatar.id)).toBe(false)
    expect(canActivate(g, 0, avatar.id, 'flood')).not.toBeNull()
  })

  it('on a body of water, only sites ADJACENT to that body are legal flood targets', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0); avatar.name = 'Avatar of Water'
    clearSitesUnder(g, avatar.x, avatar.y)
    const under = placeSite(g, 0, 'Pond', avatar.x, avatar.y) // water site (body of water)
    const adj = placeSite(g, 0, 'Arid Desert', avatar.x, avatar.y + 1) // orthogonally adjacent
    const far = placeSite(g, 0, 'Arid Desert', avatar.x + 2, avatar.y) // two squares away — NOT adjacent
    const flood = floodDef()

    expect(flood.available!(g, avatar.id)).toBe(true)
    expect(canActivate(g, 0, avatar.id, 'flood')).toBeNull()
    const filter = flood.targets![0].filter!
    expect(filter(g, adj, avatar)).toBe(true) // adjacent to the body → legal
    expect(filter(g, far, avatar)).toBe(false) // not adjacent → illegal
    expect(filter(g, under, avatar)).toBe(false) // the body itself is not "adjacent to" the body
  })
})
