import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, answer } from './helpers'
import { makeCtx } from '../src/engine/effects'

// Interrogator avatar: "Whenever an ally strikes an enemy Avatar, draw a spell
// unless they pay 3 life." This must fire for EFFECT strikes too (Hotwheel's roll,
// Wraetannis Titan's genesis, …), which go through ctx.strike — not just melee
// blows. Regression: ctx.strike used to deal bare damage and skip the trigger.

function setup() {
  const g = newGame(42, 0); keepBoth(g)
  // Player 0 pilots the Interrogator avatar (rename the avatar unit → its script applies).
  g.units[g.players[0].avatarUnitId].name = 'Interrogator'
  const enemyAv = g.units[g.players[1].avatarUnitId]
  const ally = summonCard(g, 0, 'Bone Jumble', enemyAv.x, enemyAv.y) // an ally 1/1
  return { g, enemyAv, ally }
}

describe('Interrogator triggers on an effect strike (Hotwheel-style)', () => {
  it('ctx.strike against the enemy Avatar prompts the victim to pay 3 life or let you draw', () => {
    const { g, enemyAv, ally } = setup()
    makeCtx(g, ally.id, 0, []).strike(ally, { unit: enemyAv.id })
    const p = g.prompts[0]
    expect(p, 'Interrogation prompt fired on the effect strike').toBeTruthy()
    expect(p.player, 'the struck Avatar’s controller chooses').toBe(1)
    expect(p.title).toMatch(/Interrogation/)
  })

  it('paying 3 life resolves the interrogation and costs the victim 3 life', () => {
    const { g, enemyAv, ally } = setup()
    makeCtx(g, ally.id, 0, []).strike(ally, { unit: enemyAv.id })
    const afterStrike = enemyAv.life ?? 0 // strike damage already applied; interrogation pending
    answer(g, 'pay 3 life')
    expect(enemyAv.life).toBe(afterStrike - 3)
  })

  it('control: striking a non-Avatar enemy does NOT fire the interrogation', () => {
    const { g, ally } = setup()
    const foe = summonCard(g, 1, 'Bone Jumble', ally.x, ally.y)
    makeCtx(g, ally.id, 0, []).strike(ally, { unit: foe.id })
    expect(g.prompts.some((q) => /Interrogation/.test(q.title)), 'no interrogation for a minion strike').toBe(false)
  })
})

// Men of Leng: "Whenever Men of Leng strike an Avatar, that Avatar discards a
// random card." Implemented via the SAME onAllyStrikesAvatar event (gated to
// striker === self), so it was equally broken for effect strikes. This is exactly
// the path Grapple Shot's arrival-strike uses (`land` cont → ctx.strike).
describe('Men of Leng discards on an effect strike (Grapple-Shot arrival)', () => {
  it('striking the enemy Avatar makes that Avatar discard a random card', () => {
    const g = newGame(42, 0); keepBoth(g)
    const enemyAv = g.units[g.players[1].avatarUnitId]
    const mol = summonCard(g, 0, 'Men of Leng', enemyAv.x, enemyAv.y)
    const handBefore = g.players[1].hand.length
    expect(handBefore, 'victim has cards to discard').toBeGreaterThan(0)
    makeCtx(g, mol.id, 0, []).strike(mol, { unit: enemyAv.id })
    expect(g.players[1].hand.length).toBe(handBefore - 1)
  })
})
