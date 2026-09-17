import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold, answer } from './helpers'
import { getScript } from '../src/cards/scripts/registry'
import { validateTarget } from '../src/engine/casting'
import { avatarOf } from '../src'
import '../src/cards/scripts/index'

// General rule: a nearby/adjacent UNIT target is region-locked to a unit source unless the card
// says otherwise (Gargantula drags an ADJACENT minion — same region only).
describe('adjacent/nearby targeting is region-locked (Gargantula)', () => {
  it('a surface Gargantula cannot drag an adjacent UNDERGROUND minion', () => {
    const g: any = newGame(); keepBoth(g)
    const garg = summonCard(g, 0, 'Gargantula', 2, 2)
    const spec = getScript('Gargantula')!.genesisTargets![0]
    const surf = summonCard(g, 1, 'Bone Jumble', 3, 2) // adjacent, same region
    const under = summonCard(g, 1, 'Bone Jumble', 3, 2, 'underground') // adjacent, different region
    expect(validateTarget(g, spec, { unit: surf.id }, garg, 0), 'same-region drag is legal').toBeNull()
    expect(validateTarget(g, spec, { unit: under.id }, garg, 0), 'cross-region drag is refused').toMatch(/same region/i)
  })
})

// Led Astray: "Choose any number of ENEMIES" — an enemy avatar is an enemy and must be movable.
describe('Led Astray moves avatars', () => {
  it('drags the enemy avatar a step to an adjacent site', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 2) // destination site
    const foeAv = avatarOf(g, 1); foeAv.x = 2; foeAv.y = 2; foeAv.region = 'surface'
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Led Astray', { targets: ['sq:2,2,surface'] })
    answer(g, { x: 3, y: 2 }) // lead them to the adjacent site
    expect([foeAv.x, foeAv.y], 'the enemy avatar was moved').toEqual([3, 2])
  })
})
