// Giant Shark: "Submerge, Waterbound / Whenever another unit enters or moves between sites in this body of
// water, Giant Shark moves to that unit to fight it." Fixes:
//  • it MOVES along the shortest WATER path (Waterbound) instead of teleporting;
//  • if no water path reaches the prey it does NOT move or fight;
//  • it ignores a unit merely changing region within the SAME site (FAQ: not "between sites").
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer } from './helpers'
import { emitUnitMoved } from '../src/engine/effects'
import { squareLabel } from '../src/engine/grid'
import type { GameState, PlayerId } from '../src'
import '../src/cards/scripts/index'

const submerge = (u: any, turn: number) => u.modifiers.push({ kind: 'keyword', keyword: 'submerge', duration: 'permanent', turn, sourcePlayer: u.controller as PlayerId })

describe('Giant Shark moves through water to its prey', () => {
  it('swims the shortest water path to the mover and fights (no teleport)', () => {
    const g = newGame() as GameState; keepBoth(g)
    for (const [x, y] of [[0, 0], [1, 0], [2, 0]] as const) placeSite(g, 0, 'Great Wall', x, y).flooded = true
    const shark = summonCard(g, 0, 'Giant Shark', 0, 0, 'underwater'); shark.enteredTurn = 0
    const prey = summonCard(g, 1, 'Bone Jumble', 2, 0, 'underwater'); prey.enteredTurn = 0; submerge(prey, g.turn)

    emitUnitMoved(g, prey, { x: 3, y: 0, region: 'underwater' }) // the prey moved between water sites
    expect([shark.x, shark.y], 'the Shark swam to the prey’s square').toEqual([2, 0])
    expect(prey.damage, 'and fought it').toBeGreaterThan(0)
  })

  it('lets the controller choose the route when two shortest water paths tie', () => {
    const g = newGame() as GameState; keepBoth(g)
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) placeSite(g, 0, 'Great Wall', x, y).flooded = true
    const shark = summonCard(g, 0, 'Giant Shark', 0, 0, 'underwater'); shark.enteredTurn = 0
    const prey = summonCard(g, 1, 'Bone Jumble', 1, 1, 'underwater'); prey.enteredTurn = 0; submerge(prey, g.turn)

    emitUnitMoved(g, prey, { x: 0, y: 1, region: 'underwater' }) // prey moves to (1,1) — two 2-step routes
    const p: any = g.prompts[0]
    expect(p?.kind, 'ONE route-choice prompt for the whole move').toBe('chooseOption')
    expect(p?.player, 'its controller chooses').toBe(0)
    expect(p.data.options.length, 'both tied routes are offered').toBe(2)
    answer(g, p.data.options[0]) // pick a full route
    expect([shark.x, shark.y], 'it followed the chosen route to the prey').toEqual([1, 1])
    expect(prey.damage, 'and fought').toBeGreaterThan(0)
  })

  it('offers ALL tied first steps, not just two (here three — airborne, so diagonals count)', () => {
    const g = newGame() as GameState; keepBoth(g)
    for (const [x, y] of [[1, 1], [0, 2], [1, 2], [2, 2], [1, 3]] as const) placeSite(g, 0, 'Rustic Village', x, y).flooded = true
    const shark = summonCard(g, 0, 'Giant Shark', 1, 1, 'surface'); shark.enteredTurn = 0
    shark.modifiers.push({ kind: 'keyword', keyword: 'airborne', duration: 'permanent', turn: g.turn, sourcePlayer: 0 })
    const prey = summonCard(g, 1, 'Bone Jumble', 1, 3, 'surface'); prey.enteredTurn = 0

    emitUnitMoved(g, prey, { x: 0, y: 3, region: 'surface' }) // prey moves to (1,3); 3 tied 2-step routes
    const p: any = g.prompts[0]
    expect(p?.kind, 'ONE prompt, listing every route').toBe('chooseOption')
    expect(p.data.options.length, 'all three tied routes are offered — not just two').toBe(3)
    // pick the route that goes via (2,2) (a diagonal, since it's airborne)
    const viaDiag = (p.data.options as string[]).find((o) => o.includes(squareLabel(2, 2)))!
    answer(g, viaDiag)
    expect([shark.x, shark.y], 'it took the chosen route to the prey').toEqual([1, 3])
    expect(prey.damage, 'and fought').toBeGreaterThan(0)
  })

  it('ignores a unit merely changing region within the SAME site (FAQ)', () => {
    const g = newGame() as GameState; keepBoth(g)
    for (const [x, y] of [[0, 0], [1, 0]] as const) placeSite(g, 0, 'Great Wall', x, y).flooded = true
    const shark = summonCard(g, 0, 'Giant Shark', 0, 0, 'underwater'); shark.enteredTurn = 0
    const prey = summonCard(g, 1, 'Bone Jumble', 1, 0, 'underwater'); prey.enteredTurn = 0; submerge(prey, g.turn)

    // the prey flips surface→underwater WITHIN site (1,0): same site, so the Shark must not react
    emitUnitMoved(g, prey, { x: 1, y: 0, region: 'surface' })
    expect([shark.x, shark.y], 'the Shark stayed put').toEqual([0, 0])
    expect(prey.damage, 'and did not fight').toBe(0)
  })

  it('does not move or fight when an Iceberg blocks the only way to reach the prey', () => {
    const g = newGame() as GameState; keepBoth(g)
    for (const [x, y] of [[0, 0], [1, 0], [2, 0]] as const) placeSite(g, 0, 'Great Wall', x, y).flooded = true
    placeSite(g, 0, 'Iceberg', 1, 1) // nearby (0,0),(1,0),(2,0): no unit there can submerge or surface
    const shark = summonCard(g, 0, 'Giant Shark', 0, 0, 'underwater'); shark.enteredTurn = 0
    const prey = summonCard(g, 1, 'Bone Jumble', 2, 0, 'surface'); prey.enteredTurn = 0 // on the SURFACE

    // the surface prey swims between surface water sites; the Shark (underwater) would have to surface to
    // reach it, but the Iceberg forbids surfacing anywhere in the strip → no path → it stays put.
    emitUnitMoved(g, prey, { x: 1, y: 0, region: 'surface' })
    expect([shark.x, shark.y], 'blocked by the Iceberg → the Shark does not move').toEqual([0, 0])
    expect(prey.damage, 'and does not fight').toBe(0)
  })

  it('does not move or fight when no water path reaches the prey (a gap of land)', () => {
    const g = newGame() as GameState; keepBoth(g)
    // two water squares NOT orthogonally connected as a single body reachable by steps: (0,0) water,
    // (2,0) water, but the Shark's body is only its own connected water — a lone island can't be reached.
    placeSite(g, 0, 'Great Wall', 0, 0).flooded = true
    placeSite(g, 0, 'Great Wall', 1, 0) // LAND between them (not flooded)
    placeSite(g, 0, 'Great Wall', 2, 0).flooded = true
    const shark = summonCard(g, 0, 'Giant Shark', 0, 0, 'underwater'); shark.enteredTurn = 0
    const prey = summonCard(g, 1, 'Bone Jumble', 2, 0, 'underwater'); prey.enteredTurn = 0; submerge(prey, g.turn)

    emitUnitMoved(g, prey, { x: 2, y: 1, region: 'underwater' })
    expect([shark.x, shark.y], 'unreachable → the Shark does not move').toEqual([0, 0])
    expect(prey.damage, 'and does not fight').toBe(0)
  })
})
