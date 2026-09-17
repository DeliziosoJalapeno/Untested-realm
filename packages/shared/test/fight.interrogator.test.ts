import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx } from '../src'
import '../src/cards/scripts/index'

// A "fight" (Lord of Lies, Duel, Joust, Instigator Imp, Giant Shark, Meat Hook…) is a real STRIKE
// exchange: both units strike each other simultaneously, so every strike trigger fires — including
// Interrogator's "whenever an ally strikes an enemy Avatar, draw a spell unless they pay 3 life."
// These cards used to deal raw damage and skipped the trigger entirely.

describe('all fights fire strike triggers (Interrogator)', () => {
  it('Lord of Lies: my minion vs the enemy Avatar (co-located) triggers my Interrogator', () => {
    const g = newGame(42, 0); keepBoth(g)
    g.units[g.players[0].avatarUnitId].name = 'Interrogator'
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 3)
    const lord = summonCard(g, 0, 'Lord of Lies', 2, 2); lord.enteredTurn = -5
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 3); ally.enteredTurn = -5 // my 1/1
    const enemyAv = g.units[g.players[1].avatarUnitId]; enemyAv.x = 2; enemyAv.y = 3; enemyAv.region = 'surface'
    const lifeBefore = enemyAv.life ?? 0

    getScript('Lord of Lies')!.abilities![0].effect(makeCtx(g, lord.id, 0, [{ unit: ally.id }, { unit: enemyAv.id }]))

    expect(g.prompts.some((p) => /Interrogation/.test(p.title ?? '')), 'the fight struck the enemy Avatar → Interrogator fired').toBe(true)
    expect(enemyAv.life, 'the Avatar took the 1-power strike').toBe(lifeBefore - 1)
  })

  it('Duel: an adjacent (non-co-located) fight still fires Interrogator', () => {
    const g = newGame(42, 0); keepBoth(g)
    g.units[g.players[0].avatarUnitId].name = 'Interrogator'
    placeSite(g, 0, 'Rustic Village', 1, 2)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const ally = summonCard(g, 0, 'Bone Jumble', 1, 2); ally.enteredTurn = -5
    const enemyAv = g.units[g.players[1].avatarUnitId]; enemyAv.x = 2; enemyAv.y = 2; enemyAv.region = 'surface' // adjacent to the ally

    getScript('Duel')!.onCast!(makeCtx(g, g.players[0].avatarUnitId, 0, [{ unit: ally.id }, { unit: enemyAv.id }]))

    expect(g.prompts.some((p) => /Interrogation/.test(p.title ?? '')), 'an adjacent fight struck the enemy Avatar → Interrogator fired').toBe(true)
  })
})
