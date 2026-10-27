// Atlantean Fate's Genesis submerges minions and artifacts atop every site in its area, Ordinary ones
// included (FAQ: an Ordinary water site is still affected by the Genesis). An Ordinary LAND site isn't
// flooded, so nothing there can be submerged: its minions and artifacts stay on the surface.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, injectToHand, giveMana, waiveThreshold, act, giveArtifact } from './helpers'
import '../src/cards/scripts/index'

function cast(g: any) {
  placeSite(g, 0, 'Autumn River', 2, 1)   // Ordinary water
  placeSite(g, 0, 'Rustic Village', 3, 1) // Ordinary land
  placeSite(g, 0, 'Active Volcano', 2, 2) // non-Ordinary land → flooded
  const kelpie = summonCard(g, 1, 'Coral-Reef Kelpie', 2, 1)
  const landling = summonCard(g, 1, 'Bone Jumble', 3, 1)
  const volcanoKelpie = summonCard(g, 1, 'Coral-Reef Kelpie', 2, 2)
  const art = (id: string, x: number, y: number) =>
    (g.artifacts[id] = { id, cardId: `c${id}`, name: 'Lance', conjuredBy: 0, x, y, region: 'surface', tapped: false, carriedBy: null })
  art('aw', 2, 1); art('al', 3, 1); art('av', 2, 2)
  const cardId = injectToHand(g, 0, 'Atlantean Fate'); giveMana(g, 0, 20); waiveThreshold(g, 0)
  act(g, 0, { t: 'castSpell', cardId, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 1 } } as any)
  return { kelpie, landling, volcanoKelpie }
}

describe('Atlantean Fate Genesis on Ordinary sites', () => {
  it('submerges minions and artifacts atop an Ordinary water site', () => {
    const g: any = newGame(); keepBoth(g)
    const { kelpie } = cast(g)
    expect(g.units[kelpie.id].region).toBe('underwater')
    expect(g.artifacts.aw.region).toBe('underwater')
  })

  it('leaves minions and artifacts atop an Ordinary land site on the surface', () => {
    const g: any = newGame(); keepBoth(g)
    const { landling } = cast(g)
    expect(g.units[landling.id]?.region, 'not drowned').toBe('surface')
    expect(g.artifacts.al.region).toBe('surface')
  })

  it('submerges what is atop a flooded non-Ordinary site', () => {
    const g: any = newGame(); keepBoth(g)
    const { volcanoKelpie } = cast(g)
    expect(g.units[volcanoKelpie.id].region).toBe('underwater')
    expect(g.artifacts.av.region).toBe('underwater')
  })
})

describe('carried artifacts go under with their bearer', () => {
  it('Atlantean Fate submerges a minion and the artifact it carries; an avatar stays up but its gear sinks', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Autumn River', 2, 1)
    const kelpie = summonCard(g, 1, 'Coral-Reef Kelpie', 2, 1)
    const lance = giveArtifact(g, kelpie, 'Lance')
    const av = g.units[g.players[1].avatarUnitId]
    av.x = 2; av.y = 1
    const crown = giveArtifact(g, av, 'Lance')
    const cardId = injectToHand(g, 0, 'Atlantean Fate'); giveMana(g, 0, 20); waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 1 } } as any)
    expect(g.units[kelpie.id].region).toBe('underwater')
    expect(g.artifacts[lance.id]).toMatchObject({ region: 'underwater', carriedBy: kelpie.id })
    expect(av.region, 'an avatar never submerges').toBe('surface')
    expect(g.artifacts[crown.id]).toMatchObject({ region: 'underwater', carriedBy: null })
  })
})
