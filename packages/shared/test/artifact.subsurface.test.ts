// Artifacts get buried/submerged with their bearer (or when their site caves in), a surface unit
// can't pick a subsurface artifact up, and Swap can target a carried artifact (it leaves the bearer).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, giveArtifact, placeSite, castMagic, waiveThreshold, answer, actFail } from './helpers'
import { checkStateBased } from '../src/engine/effects'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('artifacts buried with their bearer', () => {
  it('Bury takes the carried artifact underground; on death it stays buried and a surface unit cannot take it', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2) // a land site
    const bearer = summonCard(g, 1, 'Bone Jumble', 2, 2); bearer.enteredTurn = -5
    const art = giveArtifact(g, bearer, 'Poisonous Dagger')

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Bury', { targets: [bearer.id] })
    expect(bearer.region, 'bearer buried').toBe('underground')
    expect(g.artifacts[art.id].region, 'the carried artifact is buried with the bearer').toBe('underground')

    // the bearer dies while buried — the dropped artifact stays underground
    bearer.damage = 9
    checkStateBased(g)
    expect(g.units[bearer.id], 'bearer is gone').toBeUndefined()
    expect(g.artifacts[art.id].carriedBy, 'artifact dropped').toBeFalsy()
    expect(g.artifacts[art.id].region, 'dropped artifact remains buried').toBe('underground')

    // a surface minion at the same square cannot pick up the buried artifact
    const surfacer = summonCard(g, 0, 'Bone Jumble', 2, 2); surfacer.enteredTurn = -5
    const err = actFail(g, 0, { t: 'pickUp', unitId: surfacer.id, artifactIds: [art.id] })
    expect(err, 'surface unit is refused the subsurface artifact').toMatch(/not at your location/i)
  })
})

describe('Swap targets a carried artifact', () => {
  it('a carried artifact can be swapped — it leaves the bearer and relocates', () => {
    const g: GameState = newGame(); keepBoth(g)
    const bearer = summonCard(g, 0, 'Bone Jumble', 1, 1); bearer.enteredTurn = -5
    const art = giveArtifact(g, bearer, 'Poisonous Dagger') // carried, synced to (1,1)
    const other = summonCard(g, 1, 'Bone Jumble', 3, 3); other.enteredTurn = -5

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Swap')
    answer(g, [art.id, other.id]) // swap the carried artifact with the enemy minion

    expect(g.artifacts[art.id].carriedBy, 'artifact left the bearer').toBeFalsy()
    expect(bearer.carrying, 'bearer no longer lists it').not.toContain(art.id)
    expect([g.artifacts[art.id].x, g.artifacts[art.id].y], 'artifact took the enemy square').toEqual([3, 3])
    expect([g.units[other.id].x, g.units[other.id].y], 'enemy took the artifact square').toEqual([1, 1])
  })
})
