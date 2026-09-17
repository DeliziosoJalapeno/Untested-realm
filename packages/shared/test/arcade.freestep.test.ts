// Arcade of Bones: "While in this row, Undead move freely" — an Undead on the Arcade's row takes
// 0-cost steps (the movement half that was missing; only the magic-protection half existed).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { isFreeStep, reachableLocations, drawCards, applyJudge, type GameState, type Step } from '../src'

const surf = (x: number, y: number): Step => ({ x, y, region: 'surface' })

describe('Arcade of Bones — Undead move freely', () => {
  it('only frees Undead ATOP a site in its row (like Updraft Ridge), not everywhere', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: 0, y: 1 }) // a site in the Arcade's row
    applyJudge(g, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x: 0, y: 2 }) // a site in another row
    applyJudge(g, 0, { k: 'summonUnit', name: 'Bone Jumble', player: 0, x: 0, y: 1, region: 'surface', noGenesis: true }) // Undead
    applyJudge(g, 0, { k: 'token', name: 'Foot Soldier', player: 0, x: 0, y: 1, region: 'surface' }) // not Undead
    applyJudge(g, 0, { k: 'spawnArtifact', name: 'Arcade of Bones', player: 0, x: 2, y: 1 }) // row y = 1

    const undead = Object.values(g.units).find((u) => u.name === 'Bone Jumble')!
    const nonUndead = Object.values(g.units).find((u) => u.name === 'Foot Soldier')!

    // `isFreeStep` uses the `from` square, so we can probe each gate directly:
    expect(isFreeStep(g as GameState, undead, surf(0, 1), surf(1, 1))).toBe(true)  // Undead atop a site in the row → free
    expect(isFreeStep(g as GameState, undead, surf(3, 1), surf(4, 1))).toBe(false) // in the row but NOT on a site → not free
    expect(isFreeStep(g as GameState, undead, surf(0, 2), surf(1, 2))).toBe(false) // a site in a DIFFERENT row → not free
    expect(isFreeStep(g as GameState, nonUndead, surf(0, 1), surf(1, 1))).toBe(false) // non-Undead atop a site in the row → not free
  })

  it('slides FREELY along the whole row (chaining across row sites), but a step OFF the row costs', () => {
    const g = newGame(); keepBoth(g)
    // full board so off-row steps are legal (not void), and the whole Arcade row (y=1) has sites
    for (let y = 0; y <= 3; y++) for (let x = 0; x <= 4; x++) applyJudge(g, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x, y })
    applyJudge(g, 0, { k: 'summonUnit', name: 'Bone Jumble', player: 0, x: 0, y: 1, region: 'surface', noGenesis: true })
    applyJudge(g, 0, { k: 'spawnArtifact', name: 'Arcade of Bones', player: 0, x: 2, y: 1 })
    const undead = Object.values(g.units).find((u) => u.name === 'Bone Jumble')!

    // moving ALONG the row (both ends on the row) is free from ANY row site — it's a pure step
    // property, so the 0-1 BFS chains it across the row (no bogus origin-only guard).
    expect(isFreeStep(g as GameState, undead, surf(0, 1), surf(1, 1))).toBe(true)
    expect(isFreeStep(g as GameState, undead, surf(1, 1), surf(2, 1))).toBe(true) // chaining along the row IS free
    // but LEAVING the row is a normal, costed step
    expect(isFreeStep(g as GameState, undead, surf(0, 1), surf(0, 2))).toBe(false)

    const reach = reachableLocations(g as GameState, undead)
    const has = (x: number, y: number) => reach.some((s) => s.x === x && s.y === y && s.region === 'surface')
    expect(has(4, 1)).toBe(true)  // far end of the row IS reachable (free slide the whole way)
    expect(has(4, 0)).toBe(true)  // …then ONE costed step off the row
    expect(has(0, 3)).toBe(false) // but never TWO rows off for free (the old "glide everywhere" leak)
  })
})

describe('atlas draw tracking', () => {
  it('drawCards records site (atlas) draws per player in flow', () => {
    const g = newGame(); keepBoth(g)
    expect(g.flow?.atlasDraws?.[0] ?? 0).toBe(0)
    drawCards(g as GameState, 0, 'atlas', 1)
    expect(g.flow.atlasDraws[0]).toBe(1)
    drawCards(g as GameState, 0, 'atlas', 1)
    expect(g.flow.atlasDraws[0]).toBe(2)
    expect(g.flow.atlasDraws[1] ?? 0).toBe(0) // per-player
  })
})
