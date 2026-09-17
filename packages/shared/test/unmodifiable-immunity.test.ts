import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold } from './helpers'
import { isDisabled, effAttack } from '../src/engine/statics'
import { reachableLocations } from '../src/engine/movement'
import { checkStateBased, getCard } from '../src'

// "Can't be modified" (Monks of Kobalsa, Bedrock…): the unit can't be disabled, silenced,
// immobilized or transformed. Root Spider (disable) and Sisters of Silence (silence) must skip it.
describe('unmodifiable units resist disable and silence', () => {
  it('Root Spider does not disable an unmodifiable minion above it (but disables a vanilla one)', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const spider = summonCard(g, 1, 'Root Spider', 2, 2); spider.enteredTurn = -1; spider.region = 'underground'
    const monks = summonCard(g, 0, 'Monks of Kobalsa', 2, 2); monks.enteredTurn = -1
    const vanilla = summonCard(g, 0, 'Bone Jumble', 2, 2); vanilla.enteredTurn = -1
    checkStateBased(g)

    expect(isDisabled(g, g.units[monks.id]), 'unmodifiable Monks are immune to the disable').toBe(false)
    expect(isDisabled(g, g.units[vanilla.id]), 'a vanilla minion is still disabled').toBe(true)
  })

  it('Sisters of Silence do not silence an unmodifiable minion (but silence a vanilla one)', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 2)
    const sisters = summonCard(g, 1, 'Sisters of Silence', 2, 2); sisters.enteredTurn = -1
    const monks = summonCard(g, 0, 'Monks of Kobalsa', 1, 2); monks.enteredTurn = -1 // nearby
    const vanilla = summonCard(g, 0, 'Bone Jumble', 3, 2); vanilla.enteredTurn = -1 // nearby
    checkStateBased(g)

    expect(g.units[monks.id].silenced ?? false, 'unmodifiable Monks are immune to silence').toBe(false)
    expect(g.units[vanilla.id].silenced ?? false, 'a vanilla minion is still silenced').toBe(true)
  })

  it('Monstermorphosis cannot chrysalis/transform an unmodifiable minion', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const avatar = g.units[g.players[0].avatarUnitId]; avatar.x = 2; avatar.y = 2
    const monks = summonCard(g, 0, 'Monks of Kobalsa', 2, 2); monks.enteredTurn = -1 // nearby the caster

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Monstermorphosis', { targets: [monks.id] })

    expect(g.units[monks.id].disabled ?? false, 'no chrysalis disable on an unmodifiable minion').toBe(false)
    expect((g.flow?.morphoses ?? []).length, 'and no pending transformation was recorded').toBe(0)
    expect(g.units[monks.id].name, 'it is still Monks of Kobalsa').toBe('Monks of Kobalsa')
  })

  it('Bog (site immobilize) does not hold an unmodifiable minion (but holds a vanilla one)', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 2)
    const site = Object.values(g.sites).find((s) => s.x === 2 && s.y === 2)!
    g.flow = g.flow ?? {}
    g.flow.immobileSites = [{ siteId: site.id, player: 1, turn: g.turn }] // Bog marks (2,2)
    const monks = summonCard(g, 0, 'Monks of Kobalsa', 2, 2); monks.enteredTurn = -1
    const vanilla = summonCard(g, 0, 'Bone Jumble', 2, 2); vanilla.enteredTurn = -1

    expect(reachableLocations(g, monks).length > 0, 'unmodifiable Monks can still move').toBe(true)
    expect(reachableLocations(g, vanilla).length > 0, 'a vanilla minion is stuck fast').toBe(false)
  })

  it('an external power buff (House Arn Bannerman) does not raise an unmodifiable minion\'s power', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [1, 2, 3] as const) placeSite(g, 0, 'Rustic Village', x, 2)
    summonCard(g, 0, 'House Arn Bannerman', 2, 2).enteredTurn = -1 // "other nearby allies have +1 power"
    const monks = summonCard(g, 0, 'Monks of Kobalsa', 1, 2); monks.enteredTurn = -1 // nearby ally
    const vanilla = summonCard(g, 0, 'Bone Jumble', 3, 2); vanilla.enteredTurn = -1 // nearby ally

    expect(effAttack(g, g.units[monks.id]), 'Monks keep their printed power').toBe(getCard('Monks of Kobalsa').attack ?? 0)
    expect(effAttack(g, g.units[vanilla.id]), 'a vanilla ally gets the +1').toBe((getCard('Bone Jumble').attack ?? 0) + 1)
  })
})
