// King of the Realm ("control all Mortals") and Returned King ("you control all Undead") are
// CONTINUOUS control effects: when the King LEAVES the realm — dies OR exits (banish/bounce) —
// the minions it claimed return to their previous controller. Handled centrally in
// removeUnitFromRealm, keyed on `by`, so co-existing lords keep their own courts.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { getScript, makeCtx, killUnit, banishUnit, checkStateBased } from '../src'

describe('Kings return control of claimed minions when they leave the realm', () => {
  it('King of the Realm: a claimed enemy Mortal reverts to its owner when the King DIES', () => {
    const g = newGame(); keepBoth(g)
    const foe = summonCard(g, 1, 'Foot Soldiers', 3, 3) // Mortal, owned+controlled by player 1
    const king = summonCard(g, 0, 'King of the Realm', 2, 2)
    getScript('King of the Realm')!.startOfTurn!(makeCtx(g, king.id, 0, []))
    expect(g.units[foe.id].controller, 'the King claims the enemy Mortal').toBe(0)
    killUnit(g, king.id)
    expect(g.units[foe.id].controller, 'reverts to its owner (1) when the King dies').toBe(1)
  })

  it('Returned King: a claimed enemy Undead reverts when the King EXITS (banished, not dead)', () => {
    const g = newGame(); keepBoth(g)
    const foe = summonCard(g, 1, 'Skeleton', 3, 3) // Undead, owned+controlled by player 1
    const king = summonCard(g, 0, 'Returned King', 2, 2)
    getScript('Returned King')!.genesis!(makeCtx(g, king.id, 0, []))
    expect(g.units[foe.id].controller, 'the King claims the enemy Undead').toBe(0)
    banishUnit(g, king.id)
    expect(g.units[foe.id].controller, 'reverts to its owner (1) on exile too').toBe(1)
  })

  it('King of the Realm: a claimed Mortal reverts when the King is SILENCED, and again when DISABLED', () => {
    const g = newGame(); keepBoth(g)
    const foe = summonCard(g, 1, 'Foot Soldiers', 3, 3)
    const king = summonCard(g, 0, 'King of the Realm', 2, 2)
    getScript('King of the Realm')!.startOfTurn!(makeCtx(g, king.id, 0, []))
    expect(g.units[foe.id].controller).toBe(0)
    g.units[king.id].silenced = true
    checkStateBased(g)
    expect(g.units[foe.id].controller, 'a silenced King loses its court').toBe(1)
    // un-silence + re-sweep re-establishes control, then a DISABLE frees it again
    g.units[king.id].silenced = undefined
    getScript('King of the Realm')!.startOfTurn!(makeCtx(g, king.id, 0, []))
    expect(g.units[foe.id].controller, 're-claimed once un-hushed').toBe(0)
    const gorgon = summonCard(g, 1, 'Stone-gaze Gorgons', 2, 1); gorgon.enteredTurn = -1 // disables the adjacent King
    checkStateBased(g)
    expect(g.units[foe.id].controller, 'a disabled King loses its court too').toBe(1)
  })

  it('Returned King: a claimed Undead reverts when the King is SILENCED', () => {
    const g = newGame(); keepBoth(g)
    const foe = summonCard(g, 1, 'Skeleton', 3, 3)
    const king = summonCard(g, 0, 'Returned King', 2, 2)
    getScript('Returned King')!.genesis!(makeCtx(g, king.id, 0, []))
    expect(g.units[foe.id].controller).toBe(0)
    g.units[king.id].silenced = true
    checkStateBased(g)
    expect(g.units[foe.id].controller, 'a silenced Returned King loses its court').toBe(1)
  })

  it('two lords coexist: one leaving only disbands ITS own court', () => {
    const g = newGame(); keepBoth(g)
    const mortal = summonCard(g, 1, 'Foot Soldiers', 3, 3)
    const undead = summonCard(g, 1, 'Skeleton', 4, 3)
    const realmKing = summonCard(g, 0, 'King of the Realm', 2, 2)
    const undeadKing = summonCard(g, 0, 'Returned King', 1, 2)
    getScript('King of the Realm')!.startOfTurn!(makeCtx(g, realmKing.id, 0, []))
    getScript('Returned King')!.genesis!(makeCtx(g, undeadKing.id, 0, []))
    expect(g.units[mortal.id].controller).toBe(0)
    expect(g.units[undead.id].controller).toBe(0)
    killUnit(g, realmKing.id)
    expect(g.units[mortal.id].controller, 'Mortal freed').toBe(1)
    expect(g.units[undead.id].controller, 'Undead still under the Returned King').toBe(0)
  })
})
