// Codex, Disabled: "While disabled, a minion has no abilities (including basic abilities), cannot strike
// or deal damage, … and cannot be tapped to pay for costs. They also cannot take any action granted by
// another card or effect … If a site is disabled, it has no abilities and cannot provide any mana or
// affinity."
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, castMagic, waiveThreshold, act } from './helpers'
import { affinity, dealDamageToUnit, effKeywords, isDisabled, siteSilenced, sourceMana, type GameState } from '../src'
import '../src/cards/scripts/index'

function game() {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  return g
}

describe('a disabled minion cannot be tapped to pay for costs', () => {
  function ballista(helperAsleep: boolean) {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const bearer = summonCard(g, 0, 'Wild Boars', 2, 2); bearer.enteredTurn = -1
    const helper = summonCard(g, 0, 'Slumbering Giantess', 2, 2); helper.enteredTurn = -1
    if (helperAsleep) helper.disabled = true
    const art = giveArtifact(g, bearer, 'Siege Ballista')
    act(g, 0, { t: 'activate', sourceId: art.id, ability: 'ballista' })
    return { g, helper }
  }

  it('Siege Ballista finds no crew when the only other ally is disabled', () => {
    const { g, helper } = ballista(true)
    expect(isDisabled(g, helper)).toBe(true)
    expect(g.prompts, 'no crew prompt').toHaveLength(0)
    expect(helper.tapped, 'the disabled minion was not tapped').toBe(false)
  })

  it('an awake ally can crew it', () => {
    const { g, helper } = ballista(false)
    expect(g.prompts[0]?.data?.candidates).toEqual([helper.id])
  })
})

describe('a disabled site has no abilities and provides no mana or affinity', () => {
  it('a site under a Blightstone counts as having no abilities', () => {
    const g = game()
    const site = placeSite(g, 0, 'Fae City', 2, 2)
    expect(siteSilenced(g, site)).toBe(false)
    g.artifacts.bs = { id: 'bs', cardId: 'cbs', name: 'Blightstone', conjuredBy: 1, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false }
    g.cards.cbs = { id: 'cbs', name: 'Blightstone', owner: 1 }
    expect(siteSilenced(g, site), 'disabled: no abilities').toBe(true)
  })

  it('a Court disabled by an Overflowing Court gives no mana or affinity', () => {
    const g = game()
    for (const s of Object.values(g.sites)) delete g.sites[s.id]
    const court = placeSite(g, 0, 'Mock Court', 2, 3)
    const manaBefore = sourceMana(g, 0)
    const airBefore = affinity(g, 0).air
    const flooder = placeSite(g, 1, 'Overflowing Court', 2, 0)
    g.flow = { ...(g.flow ?? {}), courtDisables: [{ player: 1, turn: g.turn, sourceId: flooder.id }] }
    expect(sourceMana(g, 0), 'the disabled Court gives no mana').toBe(manaBefore - 1)
    expect(affinity(g, 0).air, 'nor its air').toBe(airBefore - 1)
    expect(siteSilenced(g, court)).toBe(true)
    expect(siteSilenced(g, flooder), 'the Overflowing Court itself is not disabled').toBe(false)
  })
})

describe('every kind of disabled minion loses its keywords', () => {
  it('a Waterbound minion off water is disabled and keeps no Submerge', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const worm = summonCard(g, 0, 'Mester Stoor Worm', 2, 2); worm.enteredTurn = -1
    expect(isDisabled(g, worm)).toBe(true)
    expect(effKeywords(g, worm).submerge ?? false).toBe(false)
  })
})

describe('a disabled ally cannot Duel', () => {
  it('the duel does not happen, so the disabled ally is not struck either', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const ally = summonCard(g, 0, 'Slumbering Giantess', 2, 2); ally.enteredTurn = -1
    ally.disabled = true
    const foe = summonCard(g, 1, 'Wild Boars', 2, 1); foe.enteredTurn = -1
    castMagic(g, 0, 'Duel', { targets: [ally.id, foe.id] })
    expect(g.units[ally.id]?.damage, 'no fight: the ally is unhurt').toBe(0)
    expect(g.units[ally.id]?.disabled, 'and still asleep').toBe(true)
    expect(g.units[foe.id]?.damage).toBe(0)
  })
})

describe("a disabled minion's own triggers do not fire", () => {
  it('Flagellant heals its controller when hurt, but not while disabled', () => {
    for (const disabled of [false, true]) {
      const g = game()
      placeSite(g, 0, 'Rustic Village', 2, 2)
      const avatar = g.units[g.players[0].avatarUnitId]
      avatar.life = 15 // room to heal
      const fl = summonCard(g, 0, 'Flagellant', 2, 2); fl.enteredTurn = -1
      if (disabled) fl.disabled = true
      dealDamageToUnit(g, fl, 1, 1)
      expect(avatar.life, disabled ? 'disabled: no heal' : 'awake: heals 1').toBe(disabled ? 15 : 16)
    }
  })
})
