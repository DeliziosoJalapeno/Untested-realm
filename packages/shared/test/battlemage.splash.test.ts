import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, act, answer } from './helpers'
import '../src/cards/scripts/index'

// "Whenever Battlemage attacks and kills an enemy, you may draw a spell." A single attack that fells
// MULTIPLE enemies — e.g. a struck target plus Flaming Sword splash onto the others at its location —
// must trigger once PER enemy killed, so Battlemage may draw a spell for each. Regression: the kill
// count was read from the attacker's own damage allocation only, so splash kills never triggered it.
describe('Battlemage draws once per enemy an attack kills', () => {
  it('Flaming Sword splash kills → three draws for three dead enemies', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 1, 'Rustic Village', 2, 0)
    // stand-in Battlemage (3 power) wielding Flaming Sword (+1 → 4), enough to kill 1/1s outright,
    // and its strike splashes full damage to the other enemies sharing the struck location.
    const mage = summonCard(g, 0, 'Battlemage', 2, 0); mage.enteredTurn = -1
    giveArtifact(g, mage, 'Flaming Sword')
    const foes = [0, 1, 2].map(() => { const u = summonCard(g, 1, 'Bone Jumble', 2, 0); u.enteredTurn = -1; return u })

    const handBefore = g.players[0].hand.length
    act(g, 0, { t: 'moveAttack', unitId: mage.id, path: [], attack: { unit: foes[0].id } })
    // resolve defend / allocation / the per-kill "draw a spell?" yesNo prompts (answer yes to each)
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage'
        ? { strikerId: p.data.strikerId, allocation: { [foes[0].id]: 4 } } : true)
    }

    for (const f of foes) expect(g.units[f.id], 'all three enemies died').toBeUndefined()
    expect(g.players[0].hand.length - handBefore, 'drew one spell per enemy killed').toBe(3)
  })

  it('a lone struck kill still draws exactly once', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 1, 'Rustic Village', 2, 0)
    const mage = summonCard(g, 0, 'Battlemage', 2, 0); mage.enteredTurn = -1
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 0); foe.enteredTurn = -1
    const handBefore = g.players[0].hand.length
    act(g, 0, { t: 'moveAttack', unitId: mage.id, path: [], attack: { unit: foe.id } })
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage'
        ? { strikerId: p.data.strikerId, allocation: { [foe.id]: 3 } } : true)
    }
    expect(g.units[foe.id]).toBeUndefined()
    expect(g.players[0].hand.length - handBefore).toBe(1)
  })
})
