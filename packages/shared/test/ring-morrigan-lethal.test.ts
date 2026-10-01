// A carried artifact's ability acts through its BEARER, so its damage inherits the bearer's Lethal:
// Ring of Morrigan's 1-damage bleed, on a bearer also holding a Poisonous Dagger (Lethal), kills any
// minion. Regression: ctx.dealDamage read the Lethal off state.units[sourceId] — but sourceId is the
// ARTIFACT, never a unit, so the bearer's Lethal was ignored.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, giveArtifact, answer } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

function bleed(g: GameState, bearerId: string, ringId: string, foeId: string) {
  getScript('Ring of Morrigan')!.onSpellCast!(makeCtx(g, ringId, 0, []), 0, 'Any Spell', bearerId)
  answer(g, [foeId]) // choose whom the Ring bleeds
}

describe('Ring of Morrigan bleed inherits the bearer\'s Poisonous Dagger Lethal', () => {
  it('with the Dagger, the 1-damage bleed KILLS a 6/6', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2); placeSite(g, 0, 'Rustic Village', 2, 3)
    const bearer = summonCard(g, 0, 'Bone Jumble', 2, 2); bearer.enteredTurn = -1
    giveArtifact(g, bearer, 'Poisonous Dagger') // bearer has Lethal
    const ring = giveArtifact(g, bearer, 'Ring of Morrigan')
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 3); foe.enteredTurn = -1 // 6/6
    bleed(g, bearer.id, ring.id, foe.id)
    expect(g.units[foe.id], 'the Lethal ring bleed killed the Cyclops').toBeUndefined()
  })

  it('control — WITHOUT the Dagger, the same 1 bleed only chips the 6/6', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2); placeSite(g, 0, 'Rustic Village', 2, 3)
    const bearer = summonCard(g, 0, 'Bone Jumble', 2, 2); bearer.enteredTurn = -1
    const ring = giveArtifact(g, bearer, 'Ring of Morrigan')
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 3); foe.enteredTurn = -1
    bleed(g, bearer.id, ring.id, foe.id)
    expect(g.units[foe.id], 'no Lethal → the Cyclops survives').toBeDefined()
    expect(g.units[foe.id]?.damage).toBe(1)
  })
})
