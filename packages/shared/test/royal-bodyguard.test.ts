// Royal Bodyguard: "If a nearby Avatar or royalty would take damage, it MAY take that damage instead."
// The choice is offered as a yes/no prompt at the moment of damage (even for simultaneous/combat hits).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, answer } from './helpers'
import { dealDamageToUnit, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Royal Bodyguard redirect prompt', () => {
  it('offers the redirect; YES → the guard takes the damage, the royal is unharmed', () => {
    const g: GameState = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; const life0 = av.life
    const guard = summonCard(g, 0, 'Royal Bodyguard', 2, 3); guard.enteredTurn = -1

    dealDamageToUnit(g, av, 3, 1, { source: { player: 1, kind: 'effect' } })
    expect(g.prompts[0]?.cont, 'a redirect prompt is offered').toBe('guard:redirect')
    answer(g, true)

    expect(guard.damage, 'the Bodyguard soaks the 3 damage').toBe(3)
    expect(av.life, 'the avatar is unharmed').toBe(life0)
    expect(av.damage ?? 0).toBe(0)
  })

  it('NO → the royal takes the damage itself', () => {
    const g: GameState = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; const life0 = av.life!
    const guard = summonCard(g, 0, 'Royal Bodyguard', 2, 3); guard.enteredTurn = -1

    dealDamageToUnit(g, av, 3, 1, { source: { player: 1, kind: 'effect' } })
    answer(g, false)

    expect(av.life! < life0 || (av.damage ?? 0) > 0, 'the avatar took the damage').toBe(true)
    expect(guard.damage ?? 0, 'the Bodyguard is untouched').toBe(0)
  })

  it('no offer when the Bodyguard is not nearby the royal', () => {
    const g: GameState = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    summonCard(g, 0, 'Royal Bodyguard', 4, 4).enteredTurn = -1 // far away

    dealDamageToUnit(g, av, 3, 1, { source: { player: 1, kind: 'effect' } })
    expect(g.prompts.find((p) => p.cont === 'guard:redirect'), 'no redirect offered').toBeUndefined()
  })

  it('shields TWO royals in one event, soaking the whole total at once (dies once, both protected)', () => {
    const g: GameState = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 1; const life0 = av.life
    const king = summonCard(g, 0, 'King of the Realm', 2, 3); king.enteredTurn = -1
    const guard = summonCard(g, 0, 'Royal Bodyguard', 2, 2); guard.enteredTurn = -1
    guard.modifiers.push({ kind: 'power', amount: -3 } as any) // defence 4 → 1: it would die after a single 3

    // a simultaneous event: both royals would take 3 at once
    dealDamageToUnit(g, av, 3, 1, { source: { player: 1, kind: 'effect' }, batch: true })
    dealDamageToUnit(g, king, 3, 1, { source: { player: 1, kind: 'effect' }, batch: true })
    const prompts = g.prompts.filter((p) => p.cont === 'guard:redirect')
    expect(prompts.length, 'the guard is prompted for EACH royal').toBe(2)
    answer(g, true) // shield the avatar
    answer(g, true) // shield the king

    // the guard soaked all 6 at once → it dies, but BOTH royals are untouched (sequential would have
    // let it die after the first 3, leaving the second royal exposed)
    expect(av.life, 'avatar protected').toBe(life0)
    expect(king.damage ?? 0, 'king protected').toBe(0)
    expect(g.units[guard.id], 'the guard died soaking both hits at once').toBeUndefined()
  })

  it('no offer when the Bodyguard is disabled/silenced', () => {
    const g: GameState = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    const guard = summonCard(g, 0, 'Royal Bodyguard', 2, 3); guard.enteredTurn = -1; guard.silenced = true

    dealDamageToUnit(g, av, 3, 1, { source: { player: 1, kind: 'effect' } })
    expect(g.prompts.find((p) => p.cont === 'guard:redirect'), 'a silenced guard offers nothing').toBeUndefined()
  })
})
