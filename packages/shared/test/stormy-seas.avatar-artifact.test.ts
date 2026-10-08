// Stormy Seas is the water-site mirror of Cave-In: it submerges the artifacts at a site — including one
// CARRIED by a bearer that can't submerge (the Avatar stays on the surface), whose gear is detached and
// sunk on its own. A submerging minion's gear instead rides down with it.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, giveArtifact, waiveThreshold } from './helpers'
import { avatarOf } from '../src'
import '../src/cards/scripts/index'

describe('Stormy Seas submerges the artifacts at a water site', () => {
  it("the avatar's carried artifact is detached and submerged; the avatar stays on the surface", () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Aqueduct', 2, 2) // a water site
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; av.region = 'surface'
    const art = giveArtifact(g, av, 'Flaming Sword')
    ;(art as any).x = 0; (art as any).y = 0 // stale carried position — must still be found via its bearer

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Stormy Seas', { targets: [site.id] })

    expect(g.artifacts[art.id]?.region, 'the carried artifact was submerged').toBe('underwater')
    expect(g.artifacts[art.id]?.carriedBy ?? null, 'and detached from the avatar').toBeNull()
    expect(g.units[av.id].region, 'the avatar itself stays on the surface').toBe('surface')
  })

  it('a loose ground artifact at the site is submerged', () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Aqueduct', 1, 1)
    const av = avatarOf(g, 0)
    const ground = giveArtifact(g, av, 'Flaming Sword') // make a real artifact, then drop it on the ground
    ;(ground as any).carriedBy = null; av.carrying = []
    ;(ground as any).x = 1; (ground as any).y = 1; (ground as any).region = 'surface'

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Stormy Seas', { targets: [site.id] })
    expect(g.artifacts[ground.id]?.region, 'the ground artifact went under water').toBe('underwater')
  })

  it("a submerging minion's gear rides down with it — not detached", () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Aqueduct', 3, 1)
    const undine = summonCard(g, 1, 'Anui Undine', 3, 1); undine.enteredTurn = -1 // Submerge → survives underwater
    const art = giveArtifact(g, undine, 'Flaming Sword')

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Stormy Seas', { targets: [site.id] })

    expect(g.units[undine.id]?.region, 'the minion submerged').toBe('underwater')
    expect(g.artifacts[art.id]?.carriedBy, 'its artifact stayed carried (rode down)').toBe(undine.id)
    expect(g.artifacts[art.id]?.region, 'and is underwater with its bearer').toBe('underwater')
  })
})
