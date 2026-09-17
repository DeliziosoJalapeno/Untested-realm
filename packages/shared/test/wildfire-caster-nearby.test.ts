// Wildfire "must start nearby" is measured from the CASTER (a Spellcaster minion, an Omphalos, …),
// not always the avatar — so a Spellcaster far from the avatar can conjure Wildfire next to ITSELF.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Wildfire nearby is from the caster', () => {
  it('a caster far from the avatar may place Wildfire nearby itself', () => {
    const g = newGame() as GameState; keepBoth(g)
    const avatar = g.units[g.players[0].avatarUnitId]
    avatar.x = 4; avatar.y = 3 // avatar tucked in a corner
    const caster = summonCard(g, 0, 'Bone Jumble', 0, 0); caster.enteredTurn = -1 // stands far from the avatar
    placeSite(g, 0, 'Rustic Village', 1, 0) // nearby the caster, far from the avatar
    placeSite(g, 0, 'Rustic Village', 4, 2) // nearby the avatar, far from the caster
    const place = getScript('Wildfire')!.auraPlacement!

    expect(place(g, 0, { x: 1, y: 0 }, caster), 'nearby the caster → allowed').toBe(null)
    expect(place(g, 0, { x: 4, y: 2 }, caster), 'far from the caster → rejected (even though near the avatar)').not.toBe(null)
    // sanity: the OLD avatar-relative behaviour would have rejected the caster-adjacent square
    expect(place(g, 0, { x: 1, y: 0 }, avatar), 'from the avatar it would be too far').not.toBe(null)
  })
})
