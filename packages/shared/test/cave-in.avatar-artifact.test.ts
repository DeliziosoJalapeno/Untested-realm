// Cave-In / Earthquake bury the artifacts at a site — including one CARRIED by an unburiable bearer
// (the Avatar, which stays on the surface): the artifact is detached and buried on its own.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, giveArtifact, waiveThreshold } from './helpers'
import { avatarOf } from '../src'
import '../src/cards/scripts/index'

describe('Cave-In buries an artifact carried by the avatar', () => {
  it("the avatar's carried artifact is detached and burrowed; the avatar stays on the surface", () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2) // a land site
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; av.region = 'surface'
    const art = giveArtifact(g, av, 'Flaming Sword')
    ;(art as any).x = 0; (art as any).y = 0 // stale carried-artifact position — must still be found via its bearer

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Cave-In', { targets: [site.id] })

    expect(g.artifacts[art.id]?.region, 'the carried artifact was burrowed').toBe('underground')
    expect(g.artifacts[art.id]?.carriedBy ?? null, 'and detached from the avatar').toBeNull()
    expect(g.units[av.id].region, 'the avatar itself stays on the surface').toBe('surface')
  })
})
