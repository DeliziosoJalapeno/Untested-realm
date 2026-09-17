// A unit carried ON TOP (Fine Courser's rider, a carried avatar) must stay visible
// on the board at full size. Only SWALLOWED cargo (Bullfrog belly) leaves the board.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'
import type { GameState } from '@sorcery/shared'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function addUnit(g: GameState, name: string, owner: 0 | 1, x: number, y: number): string {
  const cardId = `cc${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name, owner }
  const id = `cu${g.nextId++}`
  ;(g.units as any)[id] = {
    id, cardId, name, owner, controller: owner, isAvatar: false,
    x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: -1,
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  }
  return id
}

describe('carried units on the board', () => {
  it('an ON-TOP passenger (Fine Courser rider) stays rendered at its square', () => {
    const g = sweepBoardBase()
    const courser = addUnit(g, 'Fine Courser', 0, 2, 2)
    const rider = addUnit(g, 'Foot Soldier', 0, 2, 2)
    // load the rider on top of the courser
    ;(g.units as any)[rider].carriedBy = courser
    ;(g.units as any)[courser].carryingUnits = [rider]

    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    expect(root.querySelector(`[data-unit="${courser}"]`), 'carrier on board').not.toBeNull()
    expect(root.querySelector(`[data-unit="${rider}"]`), 'on-top rider still on board').not.toBeNull()
  })

  it('a SWALLOWED unit (Bullfrog belly) is removed from the board', () => {
    const g = sweepBoardBase()
    const frog = addUnit(g, 'Brobdingnag Bullfrog', 0, 3, 2)
    const meal = addUnit(g, 'Foot Soldier', 0, 3, 2)
    ;(g.units as any)[meal].carriedBy = frog
    ;(g.units as any)[frog].carryingUnits = [meal]

    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    expect(root.querySelector(`[data-unit="${frog}"]`), 'Bullfrog on board').not.toBeNull()
    expect(root.querySelector(`[data-unit="${meal}"]`), 'swallowed meal hidden').toBeNull()
  })
})
