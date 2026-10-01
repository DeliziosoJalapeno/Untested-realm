// Three reported fixes:
//  1. A PAID cast-from-collection Magic (Toolbox / Silver Bullet / Malleus) is the REAL card — after it
//     resolves it goes to the CEMETERY, not vanish (only a FREE copy like Chaoswish is a token).
//  2. Legion of Gall's banish actually removes a card from the collection's fetch pool (collectionNames).
//  3. A forced "take a step" (Screamer push-away, Unland Angler pull) prompts the EFFECT's controller
//     for the direction on ties — not the victim's controller.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer, waiveThreshold } from './helpers'
import { effectCastSpell, collectionNames, getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('paid cast-from-collection Magic goes to the cemetery', () => {
  it('a collection-cast Lash resolves into the caster\'s cemetery (not banished)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const caster = summonCard(g, 0, 'Bone Jumble', 2, 2); caster.enteredTurn = -1
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 1); foe.enteredTurn = -1 // nearby target for Lash
    g.players[0].collection['Lash'] = 1
    g.players[0].mana += 20
    waiveThreshold(g, 0) // a PAID collection cast still needs the element threshold; the board has no Fire

    effectCastSpell(g, 0, 'Lash', { free: false, caster: caster.id, grantsCasting: true })
    let guard = 0
    while (g.prompts.length && guard++ < 20) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'chooseTargets' ? [foe.id] : p.kind === 'magic' ? [foe.id] : (p.data?.candidates?.[0] ?? foe.id))
    }
    expect(g.players[0].cemetery.some((id) => g.cards[id]?.name === 'Lash'), 'Lash is in the cemetery').toBe(true)
    expect(Object.values(g.cards).filter((c) => c.name === 'Lash').length, 'exactly one Lash instance survives (not duplicated/deleted)').toBe(1)
  })
})

describe('Legion of Gall banishes cards from the collection pool', () => {
  it('banished names drop out of collectionNames (every fetch pool)', () => {
    const g = newGame() as GameState; keepBoth(g)
    g.players[0].collection = { 'Bone Jumble': 2, 'Lash': 1 }
    const legion = summonCard(g, 0, 'Legion of Gall', 2, 2); legion.enteredTurn = -1

    getScript('Legion of Gall')!.genesis!(makeCtx(g, legion.id, 0, []))
    answer(g, 'yours')          // raid your own collection
    answer(g, 'Bone Jumble')    // banish #1
    answer(g, 'Lash')           // banish #2 (then nothing left → resolves)

    expect(g.flow?.collectionBans?.[0]).toEqual(expect.arrayContaining(['Bone Jumble', 'Lash']))
    expect(collectionNames(g, 0), 'the fetch pool is now empty — both were banished').toEqual([])
  })
})

describe('forced "take a step" prompts the effect controller', () => {
  it('Screamer: with several ways to flee, YOU (the caster) choose the direction', () => {
    const g = newGame() as GameState; keepBoth(g)
    for (const [x, y] of [[2, 2], [2, 1], [2, 0], [1, 1], [3, 1]] as const) placeSite(g, 0, 'Rustic Village', x, y)
    const screamer = summonCard(g, 0, 'Screamer', 2, 2); screamer.enteredTurn = -1
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 1); foe.enteredTurn = -1 // adjacent, 3 legal ways away

    getScript('Screamer')!.genesis!(makeCtx(g, screamer.id, 0, [{ unit: foe.id }]))
    expect(g.prompts.length, 'a direction prompt was raised').toBeGreaterThan(0)
    expect(g.prompts[0].player, 'addressed to the Screamer\'s controller, not the victim').toBe(0)
  })
})
