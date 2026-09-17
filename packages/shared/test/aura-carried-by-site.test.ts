// A 1x1 (single-site) aura is conjured ATOP a site — Wildfire, Castle's/Hamlet's Ablaze! — so it must
// ride along when that site is moved or swapped (Baba Yaga's Hut, Earthquake, Mover of Mountains…).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { type GameState } from '../src'
import { swapSquares, carryContents } from '../src/cards/scripts/gen/site-move'
import '../src/cards/scripts/index'

function injectSingleSiteAura(g: GameState, name: string, x: number, y: number) {
  const cardId = `c${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: 0 }
  const id = `r${g.nextId++}`
  ;(g.auras as any)[id] = { id, cardId, name, controller: 0, squares: [{ x, y }], enteredTurn: 0 }
  return (g.auras as any)[id]
}

describe('a 1x1 aura is carried when its site moves', () => {
  it('a swap carries each site\'s single-site aura with it', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Active Volcano', 3, 3)
    const fire = injectSingleSiteAura(g, 'Wildfire', 2, 2)
    const blaze = injectSingleSiteAura(g, "Castle's Ablaze!", 3, 3)

    swapSquares(g, { x: 2, y: 2 }, { x: 3, y: 3 })
    expect(fire.squares[0], 'Wildfire rides its site to (3,3)').toEqual({ x: 3, y: 3 })
    expect(blaze.squares[0], "Castle's Ablaze rides its site to (2,2)").toEqual({ x: 2, y: 2 })
  })

  it('a one-way site move carries the aura (carryContents)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 1, 1)
    const fire = injectSingleSiteAura(g, 'Wildfire', 1, 1)
    carryContents(g, { x: 1, y: 1 }, { x: 4, y: 2 })
    expect(fire.squares[0], 'the aura follows the moved site').toEqual({ x: 4, y: 2 })
  })

  it('does NOT carry a 2x2 (multi-square) aura, which is not tied to one site', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Active Volcano', 3, 3)
    // a normal 2x2 aura covering (2,2) among its four squares
    const cardId = `c${g.nextId++}`; g.cards[cardId] = { id: cardId, name: 'Crusade', owner: 0 }
    const id = `r${g.nextId++}`
    ;(g.auras as any)[id] = { id, cardId, name: 'Crusade', controller: 0, squares: [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }], anchor: { x: 2, y: 2 }, enteredTurn: 0 }
    swapSquares(g, { x: 2, y: 2 }, { x: 3, y: 3 })
    expect((g.auras as any)[id].squares.length, 'the area aura is untouched by the site swap').toBe(4)
  })
})
