// Hollow One: "Disabled until a Mortal or Beast dies nearby." The wake-up ends its OWN disable, so it
// must be heard while it is disabled (a disabled unit's real triggered abilities stay silent).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { killUnit, summonToken, dealDamageToUnit, checkStateBased, isDisabled } from '../src'

function board() {
  const g: any = newGame(); keepBoth(g)
  for (const x of [1, 2, 4]) placeSite(g, 0, 'Rustic Village', x, 1)
  const hollow = summonCard(g, 0, 'Hollow One', 1, 1)
  return { g, hollow }
}

describe('Hollow One wakes when a Mortal or Beast dies nearby', () => {
  it('starts disabled', () => {
    const { g, hollow } = board()
    expect(isDisabled(g, g.units[hollow.id])).toBe(true)
  })

  it('a Foot Soldier token (Mortal) dying nearby wakes it', () => {
    const { g, hollow } = board()
    const fs = summonToken(g, 'Foot Soldier', 1, 2, 1)!
    dealDamageToUnit(g, fs, 5, 0); checkStateBased(g)
    expect(g.units[fs.id]).toBeUndefined()
    expect(isDisabled(g, g.units[hollow.id])).toBe(false)
  })

  it('a Frog token (Beast) dying nearby wakes it', () => {
    const { g, hollow } = board()
    const frog = summonToken(g, 'Frog', 1, 1, 1)!
    killUnit(g, frog.id)
    expect(isDisabled(g, g.units[hollow.id])).toBe(false)
  })

  it('a Skeleton (Undead) dying nearby, or a Mortal dying far away, does not', () => {
    const { g, hollow } = board()
    killUnit(g, summonToken(g, 'Skeleton', 1, 2, 1)!.id)
    killUnit(g, summonToken(g, 'Foot Soldier', 1, 4, 1)!.id)
    expect(isDisabled(g, g.units[hollow.id])).toBe(true)
  })
})
