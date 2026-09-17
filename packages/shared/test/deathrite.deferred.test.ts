// A deathrite applies BEFORE the unit leaves the realm — including a deathrite STRIKE that has to raise a
// prompt to pick its target (multiple candidates). Previously killUnit removed the unit immediately, so
// the strike (resolved in the prompt's continuation) hit a deleted striker and silently did nothing. Now
// the dying unit LINGERS in the realm until its deathrite fully resolves, then leaves.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, answer } from './helpers'
import { killUnit } from '../src'

describe('deferred deathrite (strike via prompt)', () => {
  it('The Green Knight’s dying strike still lands when it must choose among several targets', () => {
    const g: any = newGame(); keepBoth(g); g.activePlayer = 0
    placeSite(g, 0, 'Rustic Village', 2, 1)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 3)
    const gk = summonCard(g, 0, 'The Green Knight', 2, 2); gk.enteredTurn = -5
    const e1 = summonCard(g, 1, 'Bone Jumble', 2, 1); e1.enteredTurn = -5 // 1/1, nearby
    const e2 = summonCard(g, 1, 'Bone Jumble', 2, 3); e2.enteredTurn = -5 // 1/1, nearby

    // its deathrite "Strike target nearby enemy" has TWO candidates → a genuine prompt (async)
    killUnit(g, gk.id)

    const p = g.prompts[0]
    expect(p?.kind, 'the deathrite raised its target prompt').toBe('chooseTargets')
    expect(g.units[gk.id], 'the dying Knight LINGERS in the realm until its rite resolves').toBeTruthy()
    expect(g.units[e1.id]?.damage ?? 0, 'nothing struck yet').toBe(0)

    answer(g, [e1.id]) // strike the first Bone Jumble

    expect(g.units[e1.id], 'the deathrite strike landed — a 1-defence Bone Jumble dies to power 3').toBeFalsy()
    expect(g.units[e2.id], 'the other candidate is untouched').toBeTruthy()
    expect(g.units[gk.id], 'and NOW the Knight finally leaves the realm').toBeFalsy()
  })
})
