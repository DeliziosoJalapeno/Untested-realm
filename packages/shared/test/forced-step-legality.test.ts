// The "make a unit take a step" bug class: an effect that steps a unit must first confirm the step is
// LEGAL — an Immobile unit (or one blocked by a wall / entry ban) doesn't move. Fixed in Call of the Sea,
// Led Astray and Hotwheel (Giant Shark's forced move already pathfinds legal steps only).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold, answer } from './helpers'
import { getScript, makeCtx, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

const immobilize = (u: any) => u.modifiers.push({ kind: 'keyword', keyword: 'immobile', duration: 'permanent', turn: 0, sourcePlayer: u.controller as PlayerId })

describe('forced "take a step" effects skip units that can\'t step', () => {
  it('Led Astray: an Immobile enemy stays; a free one is led away', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2) // the enemies stand here
    placeSite(g, 0, 'Rustic Village', 3, 2) // destination
    const free = summonCard(g, 1, 'Bone Jumble', 2, 2); free.enteredTurn = 0
    const stuck = summonCard(g, 1, 'Bone Jumble', 2, 2); stuck.enteredTurn = 0; immobilize(stuck)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Led Astray', { targets: ['sq:2,2,surface'] })
    answer(g, { x: 3, y: 2 })
    expect([g.units[free.id]?.x, g.units[free.id]?.y], 'the free enemy was led away').toEqual([3, 2])
    expect([g.units[stuck.id]?.x, g.units[stuck.id]?.y], 'the Immobile enemy stayed put').toEqual([2, 2])
  })

  it('Hotwheel: an Immobile Hotwheel does not roll forward', () => {
    const g = newGame() as GameState; keepBoth(g)
    for (const [x, y] of [[2, 0], [2, 1], [2, 2]] as const) placeSite(g, 0, 'Rustic Village', x, y)
    const wheel = summonCard(g, 0, 'Hotwheel', 2, 0); wheel.enteredTurn = 0; immobilize(wheel)
    getScript('Hotwheel')!.genesis!(makeCtx(g, wheel.id, 0, []))
    expect([g.units[wheel.id]?.x, g.units[wheel.id]?.y], 'blocked from stepping → it stays').toEqual([2, 0])
  })
})
