// Call of the Sea: "Minions adjacent to target Water site step towards it. Then submerge all minions
// there." Stepping toward the site is a STEP — a minion that can't take it (Immobile, a wall, an entry ban)
// must NOT be moved. It used to yank every adjacent minion onto the site unconditionally.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Call of the Sea only moves minions that can take the step', () => {
  it('an Immobile adjacent minion stays put; a free one steps in and submerges', () => {
    const g = newGame() as GameState; keepBoth(g)
    const water = placeSite(g, 0, 'Rustic Village', 2, 2); water.flooded = true // the target water site
    placeSite(g, 0, 'Rustic Village', 2, 1) // sites under the adjacent minions
    placeSite(g, 0, 'Rustic Village', 1, 2)

    const free = summonCard(g, 0, 'Bone Jumble', 2, 1); free.enteredTurn = 0
    free.modifiers.push({ kind: 'keyword', keyword: 'submerge', duration: 'permanent', turn: g.turn, sourcePlayer: 0 })
    const stuck = summonCard(g, 0, 'Bone Jumble', 1, 2); stuck.enteredTurn = 0
    stuck.modifiers.push({ kind: 'keyword', keyword: 'immobile', duration: 'permanent', turn: g.turn, sourcePlayer: 0 })

    getScript('Call of the Sea')!.onCast!(makeCtx(g, water.id, 0, [{ site: water.id }]))

    expect([g.units[free.id]?.x, g.units[free.id]?.y], 'the free minion stepped onto the site').toEqual([2, 2])
    expect(g.units[free.id]?.region, 'and submerged').toBe('underwater')
    expect([g.units[stuck.id]?.x, g.units[stuck.id]?.y], 'the Immobile minion did not move').toEqual([1, 2])
    expect(g.units[stuck.id]?.region, 'and stayed on the surface').toBe('surface')
  })
})
