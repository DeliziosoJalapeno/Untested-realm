// Corpse Catapult's fling ability must re-check its preconditions LIVE — its button enables the
// moment a corpse enters the cemetery and disables again when the last one leaves (was a missing
// available() gate: the button never tracked the cemetery, only the effect() failed on click).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveArtifact, summonCard } from './helpers'
import { avatarOf, canActivate } from '../src'

describe('Corpse Catapult availability tracks the cemetery live', () => {
  it('enables/disables as corpses enter and leave', () => {
    const g: any = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; av.tapped = false; av.enteredTurn = -5
    const cc = giveArtifact(g, av, 'Corpse Catapult')
    const ally = summonCard(g, 0, 'Stygian Archers', 2, 2, 'surface'); ally.tapped = false; ally.enteredTurn = -5

    expect(canActivate(g, 0, cc.id, 'fling'), 'no corpse → disabled').not.toBeNull()
    const dead = 'cmx'; g.cards[dead] = { id: dead, name: 'Stygian Archers', owner: 0 }; g.players[0].cemetery.push(dead)
    expect(canActivate(g, 0, cc.id, 'fling'), 'corpse present → enabled (check redone)').toBeNull()
    g.players[0].cemetery = g.players[0].cemetery.filter((x: string) => x !== dead)
    expect(canActivate(g, 0, cc.id, 'fling'), 'corpse gone → disabled again (not stale)').not.toBeNull()
  })
})
