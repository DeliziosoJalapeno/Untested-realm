// Saint of Redemption's static abilities ("No minion is Evil" + "all enter the realm tapped") are
// ABILITIES — a DISABLED Saint has none of them (reported bug: "Saint ability funziona anche quando
// disabile"). Evil-ness returns and new minions enter untapped while he's disabled.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { makeCtx, getScript, isEvilUnit } from '../src'

describe('Saint of Redemption while disabled', () => {
  it('stops suppressing Evil when disabled', () => {
    const g = newGame(); keepBoth(g)
    const saint = summonCard(g, 0, 'Saint of Redemption', 2, 2)
    const undead = summonCard(g, 1, 'Noxious Corpse', 3, 2) // an Undead (intrinsically Evil)

    expect(isEvilUnit(g, undead), 'while the Saint stands, nobody is Evil').toBe(false)
    saint.disabled = true
    expect(isEvilUnit(g, undead), 'a disabled Saint redeems no one').toBe(true)
  })

  it('does not tap entering minions when disabled', () => {
    const g = newGame(); keepBoth(g)
    const saint = summonCard(g, 0, 'Saint of Redemption', 2, 2)
    const run = (m: ReturnType<typeof summonCard>) =>
      getScript('Saint of Redemption')!.onUnitEnters!(makeCtx(g, saint.id, 0, []), m)

    const a = summonCard(g, 0, 'Foot Soldier', 3, 2); a.tapped = false
    run(a)
    expect(a.tapped, 'active Saint taps entrants').toBe(true)

    saint.disabled = true
    const b = summonCard(g, 0, 'Foot Soldier', 4, 2); b.tapped = false
    run(b)
    expect(b.tapped, 'disabled Saint taps no one').toBe(false)
  })
})
