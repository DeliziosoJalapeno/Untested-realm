// Atlantean Fate's flood is a continuous effect: a non-Ordinary site played under it LATER is flooded the
// moment it enters (not just the sites there at the aura's Genesis). Same for Flood (any site). An Ordinary
// site played under Atlantean Fate stays dry, and removing the aura un-floods only what it flooded.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { enterSite, siteSilenced, type GameState } from '../src'
import { unfloodOnAuraLeave } from '../src/cards/scripts/multi-card-utils/dispel-script'
import '../src/cards/scripts/index'

function aura(g: GameState, name: string, squares: { x: number; y: number }[]) {
  const a = { id: `ra${g.nextId++}`, cardId: `ca${g.nextId++}`, name, controller: 0, squares } as any
  g.auras[a.id] = a
  return a
}
function play(g: GameState, player: 0 | 1, name: string, x: number, y: number) {
  const cardId = `ctest${g.nextId++}`
  g.cards[cardId] = { id: cardId, name, owner: player } as any
  return g.sites[enterSite(g, player, cardId, x, y)]
}

describe('sites played under a flooding aura', () => {
  it('Atlantean Fate floods (and silences) a non-Ordinary site played under it', () => {
    const g = newGame() as GameState; keepBoth(g)
    aura(g, 'Atlantean Fate', [{ x: 1, y: 1 }, { x: 2, y: 1 }])
    const site = play(g, 1, 'Active Volcano', 1, 1)
    expect(site.flooded, 'flooded on entry').toBe(true)
    expect(siteSilenced(g, site)).toBe(true)
  })

  it('an Ordinary site played under Atlantean Fate stays dry', () => {
    const g = newGame() as GameState; keepBoth(g)
    aura(g, 'Atlantean Fate', [{ x: 2, y: 1 }])
    const site = play(g, 1, 'Rustic Village', 2, 1)
    expect(site.flooded).toBeFalsy()
  })

  it('Flood floods any site played under it', () => {
    const g = newGame() as GameState; keepBoth(g)
    aura(g, 'Flood', [{ x: 2, y: 1 }])
    const site = play(g, 1, 'Rustic Village', 2, 1)
    expect(site.flooded).toBe(true)
  })

  it('a site played outside the aura is untouched', () => {
    const g = newGame() as GameState; keepBoth(g)
    aura(g, 'Atlantean Fate', [{ x: 1, y: 1 }])
    const site = play(g, 1, 'Active Volcano', 3, 3)
    expect(site.flooded).toBeFalsy()
  })

  it('when Atlantean Fate leaves, it does not dry an Ordinary site that something else flooded', () => {
    const g = newGame() as GameState; keepBoth(g)
    const a = aura(g, 'Atlantean Fate', [{ x: 2, y: 1 }])
    const site = play(g, 1, 'Rustic Village', 2, 1)
    site.flooded = true // flooded by some other, permanent effect
    unfloodOnAuraLeave(g, a); delete g.auras[a.id]
    expect(site.flooded, 'Atlantean Fate never flooded it, so it stays flooded').toBe(true)
  })
})
