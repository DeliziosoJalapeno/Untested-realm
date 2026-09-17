// Persistent bindings must stay releasable even though the SOURCE that made them is no longer in play:
//  • Bind Evil is a Magic (already in the cemetery) — an adjacent Spellcaster/Avatar must still be
//    offered "Tap → Release" for a `bound` minion.
//  • Gargantula's cocoon must still be cuttable by a co-located unit even after the Gargantula has died.
// Both abilities are surfaced by the engine from the disabled minion's own counter (grantedAbilities).
// Plus: Demonic Contract must REVEAL the card it tutors.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { grantedAbilities, makeCtx, getScript } from '../src'

describe('binding release without the source in play', () => {
  it('Bind Evil: an adjacent Avatar/Spellcaster is offered Tap → Release (spell already gone)', () => {
    const g = newGame(); keepBoth(g)
    const bound = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    bound.disabled = true; bound.counters = { bound: 1 } // as Bind Evil leaves it (the spell is in the cemetery)
    const av = g.units[g.players[0].avatarUnitId]; av.x = 2; av.y = 3; av.region = 'surface' // adjacent

    const rel = grantedAbilities(g, av).find((a) => a.key === `bind:release:${bound.id}`)
    expect(rel, 'the release button is offered').toBeTruthy()

    rel!.effect!(makeCtx(g, av.id, 0, []))
    expect(g.units[bound.id]?.disabled, 'released → no longer disabled').toBeFalsy()
    expect(g.units[bound.id]?.counters?.bound, 'the bound counter is cleared').toBeFalsy()
  })

  it('a non-adjacent / non-spellcaster is NOT offered the Bind Evil release', () => {
    const g = newGame(); keepBoth(g)
    const bound = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    bound.disabled = true; bound.counters = { bound: 1 }
    const grunt = summonCard(g, 0, 'Escyllion Cyclops', 0, 0) // far away, no Spellcaster keyword

    expect(grantedAbilities(g, grunt).some((a) => a.key.startsWith('bind:release'))).toBe(false)
  })

  it('Gargantula: a co-located unit can cut the cocoon free even after the Gargantula has died', () => {
    const g = newGame(); keepBoth(g)
    const prey = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    prey.disabled = true; prey.counters = { cocooned: 1 } // wrapped; the Gargantula that did it is gone
    const freer = summonCard(g, 0, 'Escyllion Cyclops', 2, 2) // sharing its location

    const free = grantedAbilities(g, freer).find((a) => a.key === `cocoon:free:${prey.id}`)
    expect(free, 'the cut-free button is offered without any Gargantula in play').toBeTruthy()

    free!.effect!(makeCtx(g, freer.id, 0, []))
    expect(g.units[prey.id]?.disabled).toBeFalsy()
    expect(g.units[prey.id]?.counters?.cocooned).toBeFalsy()
  })
})

describe('Demonic Contract', () => {
  it('reveals the card it tutors from the spellbook', () => {
    const g = newGame(); keepBoth(g)
    const p = g.players[0]
    const cardName = g.cards[p.spellbook[0]].name
    const handBefore = p.hand.length

    getScript('Demonic Contract')!.conts!.grant!(
      makeCtx(g, p.avatarUnitId, 0, [], undefined, undefined, { kind: 'magic', name: 'Demonic Contract' }),
      {}, cardName,
    )

    expect(p.hand.length, 'the tutored card is put into hand').toBe(handBefore + 1)
    const reveals = JSON.stringify(g.flow?.reveals ?? [])
    expect(reveals.includes(cardName), 'the card was revealed to the opponent').toBe(true)
  })
})
