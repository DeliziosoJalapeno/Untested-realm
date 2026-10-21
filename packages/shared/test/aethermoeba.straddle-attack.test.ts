// An Aethermoeba straddling the void and a site is ON THE SURFACE of that site (each body part keeps its
// own region). A minion on the site must be able to attack it there — it used to fail with "target was
// moved away", because the check compared the moeba's anchor region (void) with the attacker's (surface).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, act, answer } from './helpers'
import { sharedLocation, type GameState } from '../src'
import '../src/cards/scripts/index'

function straddlingMoeba(g: GameState) {
  placeSite(g, 0, 'Rustic Village', 2, 1)
  // the moeba's anchor is in the void at (3,1); it has expanded onto the site at (2,1)
  const moeba = summonCard(g, 1, 'Aethermoeba', 3, 1); moeba.enteredTurn = -1
  moeba.region = 'void'
  moeba.extraSquares = [{ x: 2, y: 1, region: 'surface' }]
  return moeba
}

describe('attacking an Aethermoeba on the part that sits on a site', () => {
  it('shares the surface location with a minion on that site', () => {
    const g = newGame() as GameState; keepBoth(g)
    const moeba = straddlingMoeba(g)
    const cyclops = summonCard(g, 0, 'Escyllion Cyclops', 2, 1); cyclops.enteredTurn = -1
    expect(sharedLocation(cyclops, moeba)).toEqual({ x: 2, y: 1, region: 'surface' })
  })

  it('the attack goes through and the fight happens', () => {
    const g = newGame() as GameState; keepBoth(g)
    const moeba = straddlingMoeba(g)
    const cyclops = summonCard(g, 0, 'Escyllion Cyclops', 2, 1); cyclops.enteredTurn = -1
    act(g, 0, { t: 'moveAttack', unitId: cyclops.id, path: [], attack: { unit: moeba.id } })
    for (let i = 0; g.prompts.length && i < 20; i++) {
      const p: any = g.prompts[0]
      expect(p.title ?? '', 'no "target was moved away" retarget').not.toContain('moved away')
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage'
        ? { strikerId: p.data.strikerId, allocation: { [moeba.id]: 6 } } : true)
    }
    expect(g.log.some((l) => l.msg.includes('slipped away')), 'the attack found its target').toBe(false)
    expect(g.units[moeba.id], 'the 6-power Cyclops killed the moeba').toBeUndefined()
  })

  it('a minion in the void square can still attack the void part', () => {
    const g = newGame() as GameState; keepBoth(g)
    const moeba = straddlingMoeba(g)
    const walker = summonCard(g, 0, 'Bone Jumble', 3, 1); walker.region = 'void'
    expect(sharedLocation(walker, moeba)).toEqual({ x: 3, y: 1, region: 'void' })
  })
})
