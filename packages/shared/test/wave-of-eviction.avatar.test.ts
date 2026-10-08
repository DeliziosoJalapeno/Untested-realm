// Wave of Eviction "carries away enemies" — enemy AVATARS are enemies too, so the wave sweeps them.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, answer, waiveThreshold, giveArtifact, summonCard } from './helpers'
import { avatarOf } from '../src'
import '../src/cards/scripts/index'

const surge = (g: any, dir: string) => {
  answer(g, dir)
  while (g.prompts.length) answer(g, g.prompts[0].kind === 'chooseOption' ? g.prompts[0].data.options[0] : true)
}

describe('Wave of Eviction sweeps enemy avatars', () => {
  it('an enemy avatar on a flooded site is carried one step by the wave', () => {
    const g = newGame(); keepBoth(g)
    const water = placeSite(g, 0, 'Aqueduct', 2, 2) // allied water site (the wave's origin)
    placeSite(g, 0, 'Rustic Village', 3, 2)          // where the avatar is swept to
    const foeAv = avatarOf(g, 1); foeAv.x = 2; foeAv.y = 2; foeAv.region = 'surface'

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Wave of Eviction', { targets: [water.id] })
    surge(g, 'e')

    expect([foeAv.x, foeAv.y], 'the enemy avatar was swept one step east').toEqual([3, 2])
  })

  it('an enemy avatar DOWNSTREAM of the origin is still carried', () => {
    const g = newGame(); keepBoth(g)
    const water = placeSite(g, 0, 'Aqueduct', 0, 2)
    placeSite(g, 0, 'Rustic Village', 1, 2)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const foeAv = avatarOf(g, 1); foeAv.x = 1; foeAv.y = 2; foeAv.region = 'surface'
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Wave of Eviction', { targets: [water.id] })
    surge(g, 'e')
    expect([foeAv.x, foeAv.y], 'the avatar one square downstream was still carried').toEqual([2, 2])
  })

  it('a swept avatar carries its artifact along, and an enemy minion is swept too', () => {
    const g = newGame(); keepBoth(g)
    const water = placeSite(g, 0, 'Aqueduct', 0, 2)
    placeSite(g, 0, 'Rustic Village', 1, 2)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    const foeAv = avatarOf(g, 1); foeAv.x = 1; foeAv.y = 2; foeAv.region = 'surface'
    const art = giveArtifact(g, foeAv, 'Horn of Call')
    const foeMin = summonCard(g, 1, 'Foot Soldiers', 2, 2); foeMin.enteredTurn = -1
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Wave of Eviction', { targets: [water.id] })
    surge(g, 'e')
    expect(foeAv.x, 'avatar moved east').toBeGreaterThan(1)
    expect([art.x, art.y], 'its artifact rode along').toEqual([foeAv.x, foeAv.y])
    expect(foeMin.x, 'the enemy minion moved east too').toBeGreaterThan(2)
  })
})
