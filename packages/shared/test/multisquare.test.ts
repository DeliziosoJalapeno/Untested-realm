import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { resolveMovement, reachableLocations, beginAttack, GRID_W, GRID_H, occupiedSquares, type GameState } from '../src'

const fillSites = (g: GameState) => {
  for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) placeSite(g, 0, 'Spire', x, y)
}

describe('rigid multi-square bodies shift as one when they move', () => {
  it('a 2x1 body moves and its extra square shifts with the anchor', () => {
    const g = newGame(); keepBoth(g)
    fillSites(g)
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1); u.enteredTurn = -1
    u.extraSquares = [{ x: 2, y: 1, region: 'surface' }] // occupies (1,1)+(2,1)
    const taken = resolveMovement(g, u, [{ x: 1, y: 2, region: 'surface' }]) // shift north
    expect(taken).toBe(1)
    expect(u.x).toBe(1); expect(u.y).toBe(2)
    expect(u.extraSquares).toEqual([{ x: 2, y: 2, region: 'surface' }]) // moved with it
    expect(occupiedSquares(u)).toEqual(expect.arrayContaining([{ x: 1, y: 2 }, { x: 2, y: 2 }]))
  })
})

describe('Yog-Sothoth — occupies everything: immobile but strikes anywhere', () => {
  function yog(g: GameState) {
    const u = summonCard(g, 0, 'Yog-Sothoth', 0, 0); u.enteredTurn = -1
    u.extraSquares = []
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (!(x === 0 && y === 0)) u.extraSquares.push({ x, y })
    return u
  }
  it('has no reachable move (nowhere to go)', () => {
    const g = newGame(); keepBoth(g); fillSites(g)
    expect(reachableLocations(g, yog(g))).toEqual([])
  })
  it('can strike an enemy in the farthest corner', () => {
    const g = newGame(); keepBoth(g); fillSites(g)
    const y = yog(g)
    const foe = summonCard(g, 1, 'Foot Soldier', GRID_W - 1, GRID_H - 1)
    expect(beginAttack(g, y, { unit: foe.id })).toBeNull()
  })
})

describe('amoebas still GROW (not shift) — occupiesAllVisited', () => {
  it('a Megamoeba keeps the square it left as it moves', () => {
    const g = newGame(); keepBoth(g); fillSites(g)
    const m = summonCard(g, 0, 'Megamoeba', 1, 1); m.enteredTurn = -1
    resolveMovement(g, m, [{ x: 1, y: 2, region: 'surface' }])
    // it now occupies BOTH the old and the new square (engulfed the trail)
    const occ = occupiedSquares(m)
    expect(occ).toEqual(expect.arrayContaining([{ x: 1, y: 1 }, { x: 1, y: 2 }]))
  })
})
