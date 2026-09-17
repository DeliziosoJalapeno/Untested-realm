import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, act, answer } from './helpers'

// Gloam Toads: "Tap → Drags in target adjacent unit and may strike it when it arrives."
// An AVATAR is a unit, so it's a legal target — the Toad can drag the enemy avatar into its
// square and strike it (was wrongly excluded by an `if (u.isAvatar) return` guard).
describe('Gloam Toads can drag (and strike) an adjacent avatar', () => {
  it('drags the enemy avatar into its square and strikes it for its power', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const toad = summonCard(g, 0, 'Gloam Toads', 2, 2)
    toad.enteredTurn = -1; toad.tapped = false

    const avatarId = g.players[1].avatarUnitId
    const avatar = g.units[avatarId]
    avatar.x = 2; avatar.y = 1; avatar.region = 'surface' // adjacent to the Toad
    const lifeBefore = avatar.life ?? 0

    act(g, 0, { t: 'activate', sourceId: toad.id, ability: 'tongue', targets: [avatarId] })
    // the "may strike it" prompt appears → say yes
    expect(g.prompts[0]?.kind).toBe('yesNo')
    answer(g, true)

    expect(g.units[avatarId].x, 'the avatar is dragged into the Toad\'s square').toBe(2)
    expect(g.units[avatarId].y).toBe(2)
    // avatars take damage on their life total (not the `damage` field minions use)
    expect(g.units[avatarId].life, 'the Toad strikes the avatar for its 6 power').toBe(lifeBefore - 6)
    expect(g.units[toad.id].tapped, 'the Toad tapped for its ability').toBe(true)
  })
})
