// Rules principle: a card that says "an ally" / "an enemy" / "a unit" (NOT "minion")
// may target an Avatar. In the engine a spec's `what: 'unit'` INCLUDES avatars while
// `what: 'minion'` EXCLUDES them (casting.ts). These 8 ally/enemy cards were wrongly
// `what: 'minion'` — this proves the fixed specs now accept avatars, and that the
// effects actually resolve against an avatar (strike / fight, avatar loses life,
// never "killed" by a strike — it goes to death's door).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, castMagic, waiveThreshold } from './helpers'
import { validateTarget } from '../src/engine/casting'
import { getScript } from '../src/cards/scripts/registry'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('ally/enemy target specs may target an Avatar', () => {
  it('Duel: an ally (my avatar) fights the ENEMY AVATAR — both specs accept avatars', () => {
    const g: GameState = newGame(); keepBoth(g); waiveThreshold(g, 0)
    const myAv = g.units[g.players[0].avatarUnitId]
    const foeAv = g.units[g.players[1].avatarUnitId]
    // sit them adjacent (Duel requires adjacency), same region
    myAv.x = 2; myAv.y = 1; myAv.region = 'surface'
    foeAv.x = 2; foeAv.y = 2; foeAv.region = 'surface'
    const foeLife0 = foeAv.life!
    const myLife0 = myAv.life!

    // BOTH target specs (ally + enemy) must validate the avatars
    const spec = getScript('Duel')!.targets!
    const caster = myAv
    expect(validateTarget(g, spec[0], { unit: myAv.id }, caster, 0), 'ally spec accepts my avatar').toBeNull()
    expect(validateTarget(g, spec[1], { unit: foeAv.id }, caster, 0), 'enemy spec accepts the enemy avatar').toBeNull()

    castMagic(g, 0, 'Duel', { targets: [myAv.id, foeAv.id] })

    // both avatars take a strike's worth of damage → life drops, neither is removed
    // (an avatar is never "killed" by a strike; it would go to death's door instead)
    expect(g.units[foeAv.id], 'enemy avatar still on the board').toBeTruthy()
    expect(g.units[myAv.id], 'my avatar still on the board').toBeTruthy()
    expect(foeAv.life!, 'enemy avatar lost life from the duel').toBeLessThan(foeLife0)
    expect(myAv.life!, 'my avatar lost life from the duel').toBeLessThan(myLife0)
  })

  it('Spin Attack: cast on MY avatar as the "ally" — it strikes the adjacent enemy', () => {
    const g: GameState = newGame(); keepBoth(g); waiveThreshold(g, 0)
    const myAv = g.units[g.players[0].avatarUnitId]
    myAv.x = 2; myAv.y = 1; myAv.region = 'surface'
    // an enemy sharing the avatar's square (Spin Attack strikes each enemy at its location)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 1) // a 1/1

    // the ally spec must accept my avatar now
    const spec = getScript('Spin Attack')!.targets!
    expect(validateTarget(g, spec[0], { unit: myAv.id }, myAv, 0), 'ally spec accepts my avatar').toBeNull()

    castMagic(g, 0, 'Spin Attack', { targets: [myAv.id] })

    // the avatar's strike kills the 1/1 co-located enemy
    expect(g.units[foe.id], 'the co-located 1/1 died to the avatar’s strike').toBeUndefined()
  })
})
