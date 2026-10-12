// Moon Clan Werewolf: "Sacrifice an allied Mortal → Summon Moon Clan Werewolf from your hand to the
// Mortal's location." While the Werewolf is in your hand it grants EACH of your Mortals a "sacrifice me →
// summon here" ability (surfaced on the Mortal, like a Skeleton raising a bone-raiser — NOT on the avatar).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, injectToHand, act } from './helpers'
import { avatarOf, grantedAbilities, effSubtypes, type GameState, type UnitState } from '../src'

function wolfAbilityOn(g: GameState, unit: UnitState): string | undefined {
  return grantedAbilities(g, unit).find((a) => (a.key ?? '').startsWith('wolf:'))?.key
}

describe('Moon Clan Werewolf — sacrifice-summon granted to allied Mortals', () => {
  it('each allied Mortal may sacrifice itself to summon the Werewolf onto its square', () => {
    const g = newGame(); keepBoth(g)
    const wolfCard = injectToHand(g, 0, 'Moon Clan Werewolf')
    const mortal = summonCard(g, 0, 'Foot Soldier', 2, 2)
    expect(effSubtypes(g, mortal)).toContain('Mortal')

    // the ability is on the MORTAL, not the avatar
    const key = wolfAbilityOn(g, mortal)
    expect(key, 'the Mortal carries the sacrifice ability').toBeTruthy()
    expect(wolfAbilityOn(g, avatarOf(g, 0)), 'the avatar does NOT carry it').toBeUndefined()

    act(g, 0, { t: 'activate', sourceId: mortal.id, ability: key! } as any)

    expect(g.units[mortal.id], 'the Mortal was sacrificed').toBeUndefined()
    const wolf = Object.values(g.units).find((u) => u.name === 'Moon Clan Werewolf')
    expect(wolf, 'the Werewolf entered the realm').toBeTruthy()
    expect([wolf!.x, wolf!.y], 'at the sacrificed Mortal’s location').toEqual([2, 2])
    expect(wolf!.controller).toBe(0)
    expect(g.players[0].hand.includes(wolfCard), 'the card left your hand').toBe(false)
  })

  it('a non-Mortal ally is not granted the ability', () => {
    const g = newGame(); keepBoth(g)
    injectToHand(g, 0, 'Moon Clan Werewolf')
    const beast = summonCard(g, 0, 'Bone Jumble', 2, 2) // not a Mortal
    expect(effSubtypes(g, beast)).not.toContain('Mortal')
    expect(wolfAbilityOn(g, beast)).toBeUndefined()
  })

  it('an enemy Mortal is not granted YOUR hand werewolf ability', () => {
    const g = newGame(); keepBoth(g)
    injectToHand(g, 0, 'Moon Clan Werewolf')
    const enemyMortal = summonCard(g, 1, 'Foot Soldier', 3, 2)
    expect(wolfAbilityOn(g, enemyMortal), 'the opponent can’t sacrifice their Mortal for your card').toBeUndefined()
  })
})
