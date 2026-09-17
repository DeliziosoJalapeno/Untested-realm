// The "unit STOPPED here" signal (final step of a walk) + Magellan Globe oversized edge-wrap.
//  * Vaults of Zul triggers only when an avatar STOPS on it (not passing through), once per game.
//  * Mountain Giant may straddle the top/bottom edge with Magellan Globe (FAQ3), and falls to one
//    side if the Globe leaves (FAQ4).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { resolveMovement, isLegalStep } from '../src/engine/movement'
import { checkStateBased } from '../src/engine/effects'
import type { GameState, UnitState } from '../src'
import '../src/cards/scripts/index'

function col(g: GameState, x: number) { for (let y = 0; y < 4; y++) placeSite(g, 0, 'Rustic Village', x, y) }

describe('Vaults of Zul triggers only when the avatar STOPS on it (once per game)', () => {
  it('passing THROUGH the Vaults square does not trigger; stopping ON it does', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 0, 2)
    placeSite(g, 0, 'Vaults of Zul', 1, 2)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const av = g.units[g.players[0].avatarUnitId]
    av.x = 0; av.y = 2; av.region = 'surface'
    // walk straight through the Vaults (0,2)->(1,2)->(2,2): (1,2) is an intermediate step
    resolveMovement(g, av, [{ x: 1, y: 2, region: 'surface' }, { x: 2, y: 2, region: 'surface' }])
    checkStateBased(g)
    expect(g.flow?.skipTurn?.[0], 'passing through does NOT plunder the Vaults').toBeFalsy()

    // now STOP on it
    av.x = 0; av.y = 2
    resolveMovement(g, av, [{ x: 1, y: 2, region: 'surface' }])
    expect(g.flow?.skipTurn?.[0], 'stopping on the Vaults plunders it (skip next turn)').toBe(1)

    // once per game: leave and return, no second trigger
    ;(g.flow as any).skipTurn = {}
    av.x = 0; av.y = 2
    resolveMovement(g, av, [{ x: 1, y: 2, region: 'surface' }])
    expect(g.flow?.skipTurn?.[0], 'the Vaults are plundered only once per game').toBeFalsy()
  })
})

describe('Mountain Giant edge-wrap (Magellan Globe)', () => {
  function giantBoard(): { g: GameState; giant: UnitState } {
    const g: GameState = newGame(); keepBoth(g)
    col(g, 1); col(g, 2) // two full columns of sites, all four rows
    const giant: UnitState = {
      id: 'giant1', cardId: 'cg1', name: 'Mountain Giant', owner: 0, controller: 0, isAvatar: false,
      x: 1, y: 1, region: 'surface', size: '2x2', tapped: false, damage: 0, enteredTurn: 0,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
    } as UnitState
    g.cards['cg1'] = { id: 'cg1', name: 'Mountain Giant', owner: 0 } as any
    g.units[giant.id] = giant
    return { g, giant }
  }
  const step = (g: GameState, u: UnitState, y: number) =>
    isLegalStep(g, u, { x: u.x, y: u.y, region: 'surface' }, { x: 1, y, region: 'surface' })

  it('cannot straddle the bottom edge WITHOUT the Globe', () => {
    const { g, giant } = giantBoard()
    giant.y = 2 // occupies rows 2,3
    expect(step(g, giant, 3), 'anchor at y=3 would need row 4 — illegal without the Globe').toBe(false)
  })

  it('CAN straddle the bottom edge WITH the Globe (rows wrap 3 -> 0)', () => {
    const { g, giant } = giantBoard()
    g.artifacts['mg'] = { id: 'mg', cardId: 'cmg', name: 'Magellan Globe', conjuredBy: 0, x: 4, y: 0, region: 'surface', tapped: false } as any
    g.cards['cmg'] = { id: 'cmg', name: 'Magellan Globe', owner: 0 } as any
    giant.y = 2
    expect(step(g, giant, 3), 'the footprint wraps to the top row — legal under Magellan').toBe(true)
  })

  it('falls to one side (does not die) when the Globe leaves while straddling', () => {
    const { g, giant } = giantBoard()
    g.artifacts['mg'] = { id: 'mg', cardId: 'cmg', name: 'Magellan Globe', conjuredBy: 0, x: 4, y: 0, region: 'surface', tapped: false } as any
    g.cards['cmg'] = { id: 'cmg', name: 'Magellan Globe', owner: 0 } as any
    giant.y = 3 // straddling: rows 3 and (wrapped) 0
    checkStateBased(g)
    expect(g.units[giant.id], 'legal while straddling under the Globe').toBeDefined()
    delete g.artifacts['mg'] // Globe leaves
    checkStateBased(g)
    expect(g.units[giant.id], 'it does not die — it falls to one side').toBeDefined()
    expect(g.units[giant.id].y, 'settled wholly in-bounds (anchor at row 2 = rows 2,3)').toBe(2)
  })
})
