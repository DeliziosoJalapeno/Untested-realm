// An effect that CASTS a spell (Chaoswish copy, Silver Bullet, Toolbox, Malleus, Apex of Babel…) must
// place minions and auras with the SAME locations and visuals as a normal cast — not a degraded prompt.
//  • a plain 2x2 aura → intersection markers (area2x2) at valid anchors, landing a 2x2 footprint
//  • a wall aura      → its site (NOT a 2x2), then its Genesis picks the border (2-square span)
//  • an oversized 2x2 minion → intersection markers, not single squares
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, answer } from './helpers'
import { effectCastSpell, type GameState } from '../src'

const my2x2Sites = (g: GameState) => {
  placeSite(g, 0, 'Rustic Village', 2, 2); placeSite(g, 0, 'Rustic Village', 3, 2)
  placeSite(g, 0, 'Rustic Village', 2, 3); placeSite(g, 0, 'Rustic Village', 3, 3)
}

describe('effect-cast minion/aura placement is uniform with a normal cast', () => {
  it('a plain 2x2 aura is placed by intersection markers (area2x2) and lands a 2x2 footprint', () => {
    const g = newGame() as GameState; keepBoth(g)
    effectCastSpell(g, 0, 'Crusade', { free: true })
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    expect(p!.data.area2x2).toBe(true)                    // intersection markers, not single-square highlights
    expect(p!.data.squares).toContainEqual({ x: 2, y: 2 })
    answer(g, { x: 2, y: 2 })
    const aura = Object.values(g.auras).find((a) => a.name === 'Crusade')
    expect(aura, 'Crusade was placed').toBeTruthy()
    expect(aura!.squares.length).toBe(4)                  // a 2x2 footprint
  })

  it('a wall aura is placed on its site (NOT a 2x2), then its Genesis picks the border', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)               // a site I control
    effectCastSpell(g, 0, 'Wall of Fire', { free: true })
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    expect(p!.data.area2x2).toBeFalsy()                   // a wall is an edge, not a 2x2 area
    expect(p!.data.squares).toContainEqual({ x: 2, y: 2 })
    answer(g, { x: 2, y: 2 })                             // place it at my site
    const border = g.prompts[0]
    expect(border?.kind).toBe('chooseOption')             // wallGenesis asks which border
    answer(g, border!.data.options[0])
    const wall = Object.values(g.auras).find((a) => a.name === 'Wall of Fire')
    expect(wall, 'Wall of Fire was raised').toBeTruthy()
    expect(wall!.squares.length).toBe(2)                  // a wall spans the border between two squares
  })

  it('an oversized (2x2) minion is placed via intersection markers', () => {
    const g = newGame() as GameState; keepBoth(g)
    my2x2Sites(g)
    effectCastSpell(g, 0, 'Mountain Giant', { free: true })
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    expect(p!.data.area2x2).toBe(true)
    expect(p!.data.squares).toContainEqual({ x: 2, y: 2 })
    answer(g, { x: 2, y: 2 })
    expect(Object.values(g.units).find((u) => u.name === 'Mountain Giant'), 'the Giant was summoned').toBeTruthy()
  })
})
