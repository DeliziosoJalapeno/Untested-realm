import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveMana, waiveThreshold, castMagic } from './helpers'
import { isDisabled } from '../src'
import type { UnitState } from '../src'

// "Nearby / adjacent minion|enemy|ally" is region-locked to the source (rulebook: a nearby
// minion cannot cross a regional boundary; a spell can only affect its caster's region).
// A surface caster's "nearby enemy minions" must NOT reach an underground/underwater enemy.
// (Sites are the exception — their "nearby" DOES reach sub-surface — but those weren't changed.)

function burrow(u: UnitState): UnitState { u.modifiers.push({ kind: 'keyword', keyword: 'burrowing' } as any); return u }

describe('Frost Nova (and the nearby-unit fixes) respect region boundaries', () => {
  it('freezes a nearby surface enemy but NOT a nearby underground enemy', () => {
    const g = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    av.x = 2; av.y = 2; av.region = 'surface'
    placeSite(g, 0, 'Spire', 2, 3) // a land site nearby (gives a surface + underground location)
    const surfaceFoe = summonCard(g, 1, 'Brown Bears', 2, 3, 'surface')
    const underFoe = burrow(summonCard(g, 1, 'Brown Bears', 2, 3, 'underground')) // burrowing → survives underground
    giveMana(g, 0, 20); waiveThreshold(g, 0)

    castMagic(g, 0, 'Frost Nova')

    expect(isDisabled(g, surfaceFoe), 'the SAME-region (surface) enemy is frozen').toBe(true)
    expect(isDisabled(g, underFoe), 'the underground enemy is NOT nearby the surface caster').toBe(false)
  })
})
