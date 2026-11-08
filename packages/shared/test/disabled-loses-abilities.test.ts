// Rulebook: "While disabled, a minion has no abilities" — passive, static, triggered and replacement
// abilities switch off exactly as they do for a silenced minion. These used to check only `.silenced`.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { dealDamageToUnit, untapUnit, checkStateBased, killUnit } from '../src/engine/effects'
import { affinity, isDisabled } from '../src/engine/statics'
import { sourceMana } from '../src/engine/turn'
import { getScript } from '../src/cards/scripts/registry'
import { disableUntilYourNextTurn } from '../src/cards/scripts/multi-card-utils/disable-until-next-turn'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g: GameState = newGame(); keepBoth(g)
  placeSite(g, 0, 'Rustic Village', 2, 2)
  placeSite(g, 0, 'Rustic Village', 2, 3)
  return g
}

describe('a disabled minion loses all its abilities (not only a silenced one)', () => {
  it('Seirawan Hydra: a disabled Hydra does not heal non-lethal damage', () => {
    const g = board()
    const hydra = summonCard(g, 0, 'Seirawan Hydra', 2, 2)
    disableUntilYourNextTurn(g, hydra.id, 1)
    expect(isDisabled(g, hydra)).toBe(true)
    dealDamageToUnit(g, hydra, 2, 1, { source: { player: 1, kind: 'effect' } })
    expect(g.units[hydra.id]).toBeDefined()
    expect(g.units[hydra.id].damage, 'no regrowth while disabled').toBe(2)
  })

  it('Rhitta Gawr: other minions untap while she is disabled', () => {
    const g = board()
    const rhitta = summonCard(g, 1, 'Rhitta Gawr of Snowdonia', 2, 3)
    const other = summonCard(g, 0, 'Bone Jumble', 2, 2)
    other.tapped = true
    expect(untapUnit(g, other), 'an active Rhitta stops the untap').toBe(false)
    disableUntilYourNextTurn(g, rhitta.id, 0)
    expect(untapUnit(g, other), 'a disabled Rhitta stops nothing').toBe(true)
    expect(other.tapped).toBe(false)
  })

  it('Älvalinne Dryads: a disabled mana-providing minion provides nothing', () => {
    const g = board()
    const before = sourceMana(g, 0)
    const dryads = summonCard(g, 0, 'Älvalinne Dryads', 2, 2)
    expect(sourceMana(g, 0)).toBe(before + 1)
    disableUntilYourNextTurn(g, dryads.id, 1)
    expect(sourceMana(g, 0), 'disabled → no ①').toBe(before)
  })

  it('a damageBoost unit boosts nothing while disabled', () => {
    const g = board()
    // no printed minion has a damage INCREASE today (Panpipes is an artifact): lend one to a vanilla minion
    const sc = getScript('Bone Jumble') as Record<string, unknown> | undefined
    expect(sc, 'Bone Jumble has a script object to borrow').toBeDefined()
    const prev = sc!.damageBoost
    sc!.damageBoost = (_s: GameState, _id: string, _v: unknown, n: number) => n + 3
    try {
      const booster = summonCard(g, 0, 'Bone Jumble', 2, 3)
      const victimA = summonCard(g, 1, 'Seirawan Hydra', 2, 2)
      // Hydra would heal; disable it so the damage stays readable
      disableUntilYourNextTurn(g, victimA.id, 0)
      dealDamageToUnit(g, victimA, 1, 0, { source: { player: 0, kind: 'effect' } })
      expect(g.units[victimA.id].damage, 'an active booster adds 3').toBe(4)
      disableUntilYourNextTurn(g, booster.id, 1)
      dealDamageToUnit(g, victimA, 1, 0, { source: { player: 0, kind: 'effect' } })
      expect(g.units[victimA.id].damage, 'a disabled booster adds nothing').toBe(5)
    } finally {
      sc!.damageBoost = prev
    }
  })

  it('Sir Bors the Younger: a disabled Bors does not strip enemy Stealth', () => {
    const g = board()
    const bors = summonCard(g, 0, 'Sir Bors the Younger', 2, 2)
    disableUntilYourNextTurn(g, bors.id, 1)
    const sneak = summonCard(g, 1, 'Bone Jumble', 2, 3)
    sneak.stealth = true
    checkStateBased(g)
    expect(g.units[sneak.id].stealth, 'the enemy keeps its Stealth').toBe(true)
  })

  it('Lady Iseult: a disabled Iseult does not replace a nearby ally\'s death', () => {
    const g = board()
    const iseult = summonCard(g, 0, 'Lady Iseult', 2, 2)
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 3)
    disableUntilYourNextTurn(g, iseult.id, 1)
    killUnit(g, ally.id)
    expect(g.units[ally.id]).toBeUndefined()
    expect(g.players[0].hand, 'not returned to hand').not.toContain(ally.cardId)
    expect(g.players[0].cemetery, 'it really died').toContain(ally.cardId)
  })

  it('Granary Rats: a disabled Rats no longer suppresses its site\'s threshold', () => {
    const g = board()
    placeSite(g, 0, 'Active Volcano', 3, 2) // fire 2
    const base = affinity(g, 0).fire
    const rats = summonCard(g, 1, 'Granary Rats', 3, 2)
    expect(affinity(g, 0).fire, 'the Rats eat the threshold').toBe(base - 2)
    disableUntilYourNextTurn(g, rats.id, 0)
    expect(affinity(g, 0).fire, 'a disabled Rats suppresses nothing').toBe(base)
  })
})
