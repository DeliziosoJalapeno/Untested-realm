// The Doom of Dilmun: "Can't be banished, destroyed, or modified." FAQ 1: a SACRIFICE still kills
// it (a sacrifice is not a destroy). Sacrifice paths mark flow.sacrificing so the Doom's death-
// replacement lets the death proceed; ordinary destroy/damage is still prevented.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, castMagic, waiveThreshold, answer } from './helpers'
import { killUnit, dealDamageToUnit, checkStateBased } from '../src/engine/effects'

describe('The Doom of Dilmun', () => {
  it('survives an ordinary destroy (killUnit) and lethal damage', () => {
    const g: any = newGame(); keepBoth(g)
    const doom = summonCard(g, 0, 'The Doom of Dilmun', 2, 2, 'surface')

    killUnit(g, doom.id)
    checkStateBased(g)
    expect(g.units[doom.id], "can't be destroyed by an ordinary kill").toBeTruthy()

    dealDamageToUnit(g, g.units[doom.id], 99, 1, { lethal: true, source: { player: 1, kind: 'effect', name: 'test' } })
    checkStateBased(g)
    expect(g.units[doom.id], "shrugs off even lethal damage").toBeTruthy()
  })

  it('IS killed by a sacrifice', () => {
    const g: any = newGame(); keepBoth(g)
    const doom = summonCard(g, 0, 'The Doom of Dilmun', 2, 2, 'surface')

    waiveThreshold(g, 0)
    // Symmetric Suffering: "Sacrifice up to one minion…" — the caster sacrifices the Doom
    castMagic(g, 0, 'Symmetric Suffering')
    // caster's minion-sacrifice prompt: choose the Doom
    answer(g, [doom.id])
    // resolve any remaining prompts (opponent's matching sacrifice etc.)
    let guard = 0
    while (g.prompts.length && guard++ < 20) {
      const p = g.prompts[0]
      answer(g, p.kind === 'chooseTargets' ? [] : '(none)')
    }

    expect(g.units[doom.id], 'a sacrifice bypasses "can\'t be destroyed"').toBeUndefined()
  })
})
