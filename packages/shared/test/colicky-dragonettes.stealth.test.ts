// Colicky Dragonettes shoot a projectile at the end of your turn. Stealth is only spent when the
// fireball HITS a unit: a miss deals no damage, so a Stealthed (e.g. Infiltrated) Dragonettes stays
// hidden — and stays under the Infiltrate player's control (reported: lost an Infiltrated Dragonettes
// to a fireball that hit nothing).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx } from '../src'
import { checkStateBased } from '../src/engine/effects'

describe('Colicky Dragonettes and Stealth', () => {
  it('a stealthed Dragonettes keeps Stealth when its hiccup hits nothing', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 2)
    const dragon = summonCard(g, 0, 'Colicky Dragonettes', 2, 2); dragon.enteredTurn = -1
    g.units[dragon.id].stealth = true

    getScript('Colicky Dragonettes')!.conts!.hiccup!(makeCtx(g, dragon.id, 0, []), {}, 'w')

    expect(g.units[dragon.id].stealth, 'a miss deals no damage: Stealth stays').toBe(true)
    expect(g.units[dragon.id].interactedTurn, 'firing still counts as interacting (no Drop)').toBe(g.turn)
  })

  it('a stealthed Dragonettes loses Stealth when its hiccup hits a unit', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 2)
    const dragon = summonCard(g, 0, 'Colicky Dragonettes', 2, 2); dragon.enteredTurn = -1
    g.units[dragon.id].stealth = true
    const foe = summonCard(g, 1, 'Nimbus Jinn', 1, 2); foe.enteredTurn = -1

    getScript('Colicky Dragonettes')!.conts!.hiccup!(makeCtx(g, dragon.id, 0, []), {}, 'w')

    expect(g.units[dragon.id].stealth ?? false, 'the hit reveals them').toBe(false)
  })

  it('an Infiltrated Dragonettes stays yours after a miss, goes home after a hit', () => {
    const setup = (withFoe: boolean) => {
      const g = newGame(); keepBoth(g)
      for (const x of [1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 2)
      // player 1's Dragonettes, Infiltrated by player 0
      const dragon = summonCard(g, 1, 'Colicky Dragonettes', 2, 2); dragon.enteredTurn = -1
      dragon.controller = 0
      dragon.stealth = true
      g.flow = { ...(g.flow ?? {}), infiltrations: [{ unitId: dragon.id, to: 1 }] } as any
      if (withFoe) { const foe = summonCard(g, 1, 'Nimbus Jinn', 1, 2); foe.enteredTurn = -1 }
      getScript('Colicky Dragonettes')!.conts!.hiccup!(makeCtx(g, dragon.id, 0, []), {}, 'w')
      checkStateBased(g)
      return g.units[dragon.id]
    }
    expect(setup(false).controller, 'miss: still yours').toBe(0)
    expect(setup(true).controller, 'hit: cover blown, back to its owner').toBe(1)
  })
})
