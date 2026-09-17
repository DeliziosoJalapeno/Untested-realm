import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { getScript, canActivate, avatarOf, type GameState } from '../src'

const flyDef = () => getScript('Avatar of Air')!.abilities!.find((a) => a.key === 'fly')!
const clearSitesUnder = (g: GameState, x: number, y: number) => {
  for (const id of Object.keys(g.sites)) if (g.sites[id].x === x && g.sites[id].y === y) delete g.sites[id]
}

describe('Avatar of Air — fly only shows when it occupies an Air site', () => {
  it('unavailable on a non-Air site, available on an Air site', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0); avatar.name = 'Avatar of Air'
    const fly = flyDef()

    clearSitesUnder(g, avatar.x, avatar.y)
    placeSite(g, 0, 'Arid Desert', avatar.x, avatar.y) // air threshold 0
    expect(fly.available!(g, avatar.id)).toBe(false)
    expect(canActivate(g, 0, avatar.id, 'fly')).not.toBeNull()

    // turn the site into an Air site
    const site = Object.values(g.sites).find((s) => s.x === avatar.x && s.y === avatar.y)!
    site.name = 'Beacon' // air threshold 1
    expect(fly.available!(g, avatar.id)).toBe(true)
    expect(canActivate(g, 0, avatar.id, 'fly')).toBeNull()
  })

  it('unavailable with no site under the avatar at all', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0); avatar.name = 'Avatar of Air'
    clearSitesUnder(g, avatar.x, avatar.y)
    expect(flyDef().available!(g, avatar.id)).toBe(false)
  })
})
