// The editor can grant OR reduce a unit's movement via a "movement +N" / "movement -N"
// keyword modifier. maxSteps = 1 + movement, clamped at 0.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { maxSteps, type GameState } from '../src'
import '../src/cards/scripts/index'

function grantKeyword(u: any, keyword: string, turn: number) {
  u.modifiers.push({ kind: 'keyword', keyword, duration: 'permanent', turn, sourcePlayer: 0 })
}

describe('editor movement +1 / -1', () => {
  it('base movement is 1 step', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const u = summonCard(g, 0, 'Bone Jumble', 1, 1)
    expect(maxSteps(g, u)).toBe(1)
  })

  it('movement +1 grants a second step; stacking grants more', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const u = summonCard(g, 0, 'Bone Jumble', 1, 1)
    grantKeyword(u, 'movement +1', g.turn)
    expect(maxSteps(g, u)).toBe(2)
    grantKeyword(u, 'movement +1', g.turn)
    expect(maxSteps(g, u)).toBe(3)
  })

  it('movement -1 removes a step; a +1 and a -1 cancel out', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const u = summonCard(g, 0, 'Bone Jumble', 1, 1)
    grantKeyword(u, 'movement -1', g.turn)
    expect(maxSteps(g, u), 'reduced to 0 — cannot move').toBe(0)
    grantKeyword(u, 'movement +1', g.turn)
    expect(maxSteps(g, u), '+1 offsets the -1 back to 1').toBe(1)
  })

  it('movement never goes below 0 even when over-reduced', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const u = summonCard(g, 0, 'Bone Jumble', 1, 1)
    grantKeyword(u, 'movement -1', g.turn)
    grantKeyword(u, 'movement -1', g.turn)
    grantKeyword(u, 'movement -1', g.turn)
    expect(maxSteps(g, u)).toBe(0)
  })
})
