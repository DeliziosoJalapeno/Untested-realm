// An Avatar is never "killed": killUnit does nothing to it, a sacrifice does nothing, and a
// Mephistopheles who took the throne (a Minion CARD flagged isAvatar at runtime) is likewise safe.
// The only way an Avatar leaves play is a death blow at death's door (finalizeAvatarDeath).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { killUnit, removeUnitFromRealm } from '../src/engine/effects'
import { avatarOf, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

describe('Avatars cannot be killed', () => {
  it('killUnit and a sacrifice both no-op on an avatar', () => {
    const g: GameState = newGame(); keepBoth(g)
    const av = avatarOf(g, 0)
    killUnit(g, av.id)
    expect(g.units[av.id], 'plain killUnit does nothing').toBeDefined()
    g.flow = g.flow ?? {}
    ;(g.flow as any).sacrificing = av.id // the sacrifice bypass (Doom of Dilmun) must NOT reach an avatar
    killUnit(g, av.id)
    expect(g.units[av.id], 'a sacrifice does not kill an avatar').toBeDefined()
  })

  it('a Mephistopheles who became the avatar is unkillable (Minion card, isAvatar at runtime)', () => {
    const g: GameState = newGame(); keepBoth(g)
    g.cards['cmeph'] = { id: 'cmeph', name: 'Mephistopheles', owner: 0 } as any
    const meph: UnitState = {
      id: 'umeph', cardId: 'cmeph', name: 'Mephistopheles', owner: 0, controller: 0, isAvatar: true,
      x: 1, y: 1, region: 'surface', tapped: false, damage: 0, enteredTurn: 0,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
    }
    g.units['umeph'] = meph
    killUnit(g, 'umeph')
    expect(g.units['umeph'], 'killUnit does nothing to a Mephisto-avatar').toBeDefined()
  })

  it('removeUnitFromRealm refuses an avatar (the shared banish/exile helper)', () => {
    const g: GameState = newGame(); keepBoth(g)
    const av = avatarOf(g, 0)
    expect(removeUnitFromRealm(g, av.id), 'returns false for an avatar').toBe(false)
    expect(g.units[av.id], 'the avatar is still in the realm').toBeDefined()
  })
})
