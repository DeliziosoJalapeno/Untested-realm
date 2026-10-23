// Codex: "While disabled, a minion has no abilities, cannot strike or deal damage … They also cannot
// take any action granted by another card or effect." Shatter Strike ("An ally targets an enemy
// adjacent to them, destroying an artifact they're carrying and then striking them") must not let a
// disabled ally — a sleeping Slumbering Giantess — do either. Like Grapple Shot, it may still be cast
// on that ally; the ally just does nothing.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, waiveThreshold, giveArtifact } from './helpers'
import { isDisabled, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

function board() {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  placeSite(g, 0, 'Rustic Village', 2, 2)
  placeSite(g, 1, 'Rustic Village', 2, 1)
  const ally = summonCard(g, 0, 'Slumbering Giantess', 2, 2); ally.enteredTurn = -1
  const foe = summonCard(g, 1, 'Wild Boars', 2, 1); foe.enteredTurn = -1
  return { g, ally, foe }
}

describe('a disabled ally cannot act for Shatter Strike', () => {
  it('a sleeping Giantess neither shatters the artifact nor strikes', () => {
    const { g, ally, foe } = board()
    ally.disabled = true; ally.counters = { ...ally.counters, asleep: 1 }
    const art = giveArtifact(g, foe, 'Ring of Morrigan')
    expect(isDisabled(g, ally)).toBe(true)
    castMagic(g, 0, 'Shatter Strike', { targets: [ally.id, foe.id] })
    expect(g.units[foe.id]?.damage, 'no strike from a disabled minion (alive, unhurt)').toBe(0)
    expect(g.artifacts[art.id], 'the artifact is not shattered').toBeTruthy()
  })

  it('an awake ally still shatters and strikes', () => {
    const { g, ally, foe } = board()
    const art = giveArtifact(g, foe, 'Ring of Morrigan')
    castMagic(g, 0, 'Shatter Strike', { targets: [ally.id, foe.id] })
    expect(g.artifacts[art.id], 'the artifact is shattered').toBeFalsy()
    expect(g.units[foe.id], 'the strike killed the Boars').toBeUndefined()
  })
})

describe('no card effect makes a disabled unit strike', () => {
  it('ctx.strike with a disabled attacker deals nothing', () => {
    const { g, ally, foe } = board()
    ally.disabled = true
    makeCtx(g, ally.id, 0, []).strike(ally, { unit: foe.id })
    expect(g.units[foe.id]?.damage, 'the target is alive and unhurt').toBe(0)
  })
})
