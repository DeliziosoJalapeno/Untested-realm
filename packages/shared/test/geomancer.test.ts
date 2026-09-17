import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { getScript, makeCtx, avatarOf, siteAt, type GameState } from '../src'

/** stand the Geomancer avatar on an interior square (2,1) with a clean slate around it. */
function setup(): { g: GameState; ax: number; ay: number } {
  const g = newGame(); keepBoth(g); g.turn = 5
  const avatar = avatarOf(g, 0); avatar.name = 'Geomancer'
  avatar.x = 2; avatar.y = 1; avatar.region = 'surface'
  // clear any sites the starter setup dropped on the neighborhood
  for (const s of Object.values(g.sites)) {
    if (Math.abs(s.x - 2) <= 1 && Math.abs(s.y - 1) <= 1) delete (g.sites as any)[s.id]
  }
  return { g, ax: 2, ay: 1 }
}

function playedEarthSite(g: GameState): string {
  // the played site only needs an earth threshold — park it off in the corner
  return placeSite(g, 0, 'Bedrock', 4, 3).id
}

describe('Geomancer — Rubble placement skips the prompt when there is only one choice', () => {
  it('a single adjacent void is filled with Rubble automatically (no prompt)', () => {
    const { g } = setup()
    // three of four neighbors have sites → exactly one void remains at (2,0)
    placeSite(g, 0, 'Bedrock', 3, 1)
    placeSite(g, 0, 'Bedrock', 1, 1)
    placeSite(g, 0, 'Bedrock', 2, 2)
    const siteId = playedEarthSite(g)

    getScript('Geomancer')!.afterAvatarSitePlay!(makeCtx(g, avatarOf(g, 0).id, 0, []), siteId)

    expect(g.prompts.length, 'no prompt was raised').toBe(0)
    const rubble = siteAt(g, 2, 0)
    expect(rubble?.isRubble, 'the lone void was filled with Rubble').toBe(true)
  })

  it('two or more adjacent voids still prompt the player to choose', () => {
    const { g } = setup()
    placeSite(g, 0, 'Bedrock', 3, 1)
    placeSite(g, 0, 'Bedrock', 1, 1) // leaves (2,0) and (2,2) void
    const siteId = playedEarthSite(g)

    getScript('Geomancer')!.afterAvatarSitePlay!(makeCtx(g, avatarOf(g, 0).id, 0, []), siteId)

    expect(g.prompts.length, 'a choose-square prompt is raised').toBe(1)
    expect(g.prompts[0].kind).toBe('chooseSquare')
    expect(siteAt(g, 2, 0)?.isRubble).toBeFalsy()
    expect(siteAt(g, 2, 2)?.isRubble).toBeFalsy()
  })
})

describe('Geomancer — Reclaim skips the prompt when there is only one adjacent Rubble', () => {
  it('a single adjacent Rubble is reclaimed automatically (no prompt)', () => {
    const { g } = setup()
    // force a Genesis-less atlas top so the only thing that could raise a prompt is the
    // reclaim's own rubble-choice (reclaim now truly PLAYS the site, firing its Genesis)
    const atlasTop = `ctop${g.nextId++}`
    g.cards[atlasTop] = { id: atlasTop, name: 'Bedrock', owner: 0 }
    g.players[0].atlas.unshift(atlasTop)
    const rubble = placeSite(g, 0, 'Rubble', 2, 0); rubble.isRubble = true

    const script = getScript('Geomancer')!
    script.abilities!.find((a) => a.key === 'reclaim')!.effect(makeCtx(g, avatarOf(g, 0).id, 0, []))

    expect(g.prompts.length, 'no prompt was raised').toBe(0)
    const replaced = siteAt(g, 2, 0)
    expect(replaced?.isRubble, 'the Rubble was reshaped into a real site').toBeFalsy()
    expect(replaced?.cardId, 'it became the atlas top site').toBe(atlasTop)
  })

  it('two or more adjacent Rubble still prompt the player to choose', () => {
    const { g } = setup()
    const r1 = placeSite(g, 0, 'Rubble', 2, 0); r1.isRubble = true
    const r2 = placeSite(g, 0, 'Rubble', 2, 2); r2.isRubble = true

    const script = getScript('Geomancer')!
    script.abilities!.find((a) => a.key === 'reclaim')!.effect(makeCtx(g, avatarOf(g, 0).id, 0, []))

    expect(g.prompts.length, 'a choose-square prompt is raised').toBe(1)
    expect(g.prompts[0].kind).toBe('chooseSquare')
    expect(siteAt(g, 2, 0)?.isRubble, 'nothing reclaimed yet').toBe(true)
    expect(siteAt(g, 2, 2)?.isRubble).toBe(true)
  })
})

describe('Geomancer — Reclaim plays the site properly (fires onSitePlayed)', () => {
  it('reclaiming a Rubble next to Boulevard of Bones makes it summon a Skeleton on the new site', () => {
    const { g } = setup()
    // force the atlas top to a plain site (no Genesis of its own) so the only reaction is Boulevard's
    const topId = `ctop${g.nextId++}`
    g.cards[topId] = { id: topId, name: 'Bedrock', owner: 0 }
    g.players[0].atlas.unshift(topId)
    // Boulevard sits adjacent to the Rubble square (2,0); the Rubble is adjacent to the Geomancer (2,1)
    placeSite(g, 0, 'Boulevard of Bones', 1, 0)
    const rubble = placeSite(g, 0, 'Rubble', 2, 0); rubble.isRubble = true

    const script = getScript('Geomancer')!
    script.abilities!.find((a) => a.key === 'reclaim')!.effect(makeCtx(g, avatarOf(g, 0).id, 0, []))

    // the Rubble became the atlas-top real site (played through enterSite, not a raw insert) …
    const replaced = siteAt(g, 2, 0)
    expect(replaced?.isRubble, 'the Rubble was reshaped into a real site').toBeFalsy()
    expect(replaced?.cardId, 'it became the atlas top site').toBe(topId)
    // … and because it was truly PLAYED, adjacent Boulevard of Bones summoned a Skeleton there
    const skele = Object.values(g.units).find((u) => u.name === 'Skeleton' && u.x === 2 && u.y === 0)
    expect(skele, 'Boulevard of Bones reacted to the reclaimed site being played').toBeTruthy()
  })
})
