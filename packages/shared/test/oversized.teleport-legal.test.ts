// Teleporting an oversized (2x2) unit must land its WHOLE footprint on a legal set of locations
// (rulebook: "to a location or set of locations that conforms to its size restrictions and is otherwise
// legal to occupy"). A relocation that would strand a part off-board or over a void is refused.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, fillSites, castMagic, waiveThreshold } from './helpers'
import { makeCtx, occupiedSquares, oversizedTeleportPlacements, teleportWithPlacement, applyAction, type GameState } from '../src'

const mk2x2 = (g: GameState, x: number, y: number) => {
  const u = summonCard(g, 0, 'Foot Soldier', x, y); u.size = '2x2'; u.enteredTurn = -1
  return u
}
const tp = (g: GameState, uid: string, x: number, y: number) => makeCtx(g, uid, 0, []).teleport(uid, x, y, 'surface')

describe('Oversized teleport conforms to its 2x2 size', () => {
  it('lands on a fully-sited 2x2 area, but is refused off-board or over a void', () => {
    const g = newGame(); keepBoth(g); fillSites(g, 0)
    const u = mk2x2(g, 1, 1)

    tp(g, u.id, 0, 0) // footprint (0,0),(1,0),(0,1),(1,1) — all sited
    expect([u.x, u.y], 'teleported onto the legal 2x2 area').toEqual([0, 0])

    tp(g, u.id, 4, 0) // footprint would need (5,0) — off the right edge (GRID_W=5) → refused
    expect([u.x, u.y], 'refused — a part would hang off the board').toEqual([0, 0])

    // knock out one site so a footprint corner is void, then try to land there
    const corner = Object.values(g.sites).find((s) => s.x === 3 && s.y === 2)!
    delete g.sites[corner.id]
    tp(g, u.id, 2, 1) // footprint (2,1),(3,1),(2,2),(3,2) — (3,2) is now void → refused
    expect([u.x, u.y], 'refused — a part would be over the void').toEqual([0, 0])
  })

  it('a legal teleport relocates the whole footprint together', () => {
    const g = newGame(); keepBoth(g); fillSites(g, 0)
    const u = mk2x2(g, 1, 1)
    tp(g, u.id, 2, 2)
    expect(occupiedSquares(u)).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }])
  })

  it('enumerates 4 rigid rotations of a Megamoeba-style L-blob; applying one keeps it rigid', () => {
    const g = newGame(); keepBoth(g); fillSites(g, 0)
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1); u.enteredTurn = -1
    u.extraSquares = [{ x: 2, y: 1, region: 'surface' }, { x: 1, y: 2, region: 'surface' }] // L: (1,1),(2,1),(1,2)

    const places = oversizedTeleportPlacements(g, u, { x: 2, y: 2 })
    expect(places.length, 'an L has no rotational symmetry → 4 distinct rotations').toBe(4)
    for (const p of places) {
      expect(p.squares.length, 'rigid: still 3 squares').toBe(3)
      expect(p.squares.some((s) => s.x === 2 && s.y === 2), 'each rotation covers the clicked square').toBe(true)
    }

    const leftRot = places.find((p) => p.shape?.some((o) => o.dx < 0))! // a rotation extending left
    makeCtx(g, u.id, 0, []).teleport(u.id, 2, 2, 'surface', { shape: leftRot.shape })
    expect(occupiedSquares(u).length, 'stayed a rigid 3-square body').toBe(3)
    expect(occupiedSquares(u).some((s) => s.x === 2 && s.y === 2)).toBe(true)
  })

  it('a 2x2 near the right edge offers only the legal anchor corners', () => {
    const g = newGame(); keepBoth(g); fillSites(g, 0)
    const u = mk2x2(g, 1, 1)
    // clicked (4,1): TL/BL anchors would need column 5 (off-board, GRID_W=5) → dropped; TR/BR fit
    const places = oversizedTeleportPlacements(g, u, { x: 4, y: 1 })
    expect(places.length, 'two legal corners (TR, BR)').toBe(2)
    for (const p of places) {
      expect(p.squares.length).toBe(4)
      expect(p.squares.some((s) => s.x === 4 && s.y === 1), 'each covers the clicked square').toBe(true)
      expect(p.shape, 'a 2x2 needs no shape — just its anchor corner').toBeUndefined()
    }
  })

  it('Blink honours a client-chosen oversized placement (extra.teleportPlace)', () => {
    const g = newGame(); keepBoth(g); fillSites(g, 0)
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1); u.enteredTurn = -1
    u.extraSquares = [{ x: 2, y: 1, region: 'surface' }, { x: 1, y: 2, region: 'surface' }] // L-blob
    waiveThreshold(g, 0)

    const rot = oversizedTeleportPlacements(g, u, { x: 2, y: 2 }).find((p) => p.shape?.some((o) => o.dx < 0))!
    castMagic(g, 0, 'Blink', { targets: [u.id, 'sq:2,2'], extra: { teleportPlace: { x: rot.x, y: rot.y, shape: rot.shape } } })

    expect(occupiedSquares(u).length, 'the blob stayed rigid (3 squares)').toBe(3)
    expect(occupiedSquares(u).some((s) => s.x === 2 && s.y === 2), 'at the chosen location').toBe(true)
    // and it matches the chosen rotation exactly
    const got = occupiedSquares(u).map((s) => `${s.x},${s.y}`).sort().join('|')
    const want = rot.squares.map((s) => `${s.x},${s.y}`).sort().join('|')
    expect(got).toBe(want)
  })

  it('ANY teleport spell honours the chosen placement — e.g. Flanking Maneuver, not just Blink', () => {
    const g = newGame(); keepBoth(g); fillSites(g, 0); waiveThreshold(g, 0)
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1); u.enteredTurn = -1
    u.extraSquares = [{ x: 2, y: 1, region: 'surface' }, { x: 1, y: 2, region: 'surface' }] // L-blob at (1,1)
    // (3,2) is a knight's move from (1,1): dx 2, dy 1
    const rot = oversizedTeleportPlacements(g, u, { x: 3, y: 2 }).find((p) => p.shape?.some((o) => o.dx < 0 || o.dy < 0))!
    castMagic(g, 0, 'Flanking Maneuver', { targets: ['sq:1,1', 'sq:3,2'], extra: { teleportPlace: { x: rot.x, y: rot.y, shape: rot.shape } } })

    expect(occupiedSquares(u).some((s) => s.x === 3 && s.y === 2), 'the oversized ally flanked to the spot').toBe(true)
    const got = occupiedSquares(u).map((s) => `${s.x},${s.y}`).sort().join('|')
    const want = rot.squares.map((s) => `${s.x},${s.y}`).sort().join('|')
    expect(got, 'with exactly the chosen rotation').toBe(want)
  })

  it('teleportWithPlacement (engine-prompt abilities, e.g. Avatar of Air) raises a placement prompt for an oversized unit', () => {
    const g = newGame(); keepBoth(g); fillSites(g, 0)
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1); u.enteredTurn = -1
    u.extraSquares = [{ x: 2, y: 1, region: 'surface' }, { x: 1, y: 2, region: 'surface' }] // L-blob

    teleportWithPlacement(makeCtx(g, u.id, 0, []), u.id, { x: 3, y: 2 })
    const pr = g.prompts[0] as any
    expect(pr?.kind, 'an oversized unit with several placements is asked how it lands').toBe('teleportPlace')
    expect(pr.data.placements.length).toBeGreaterThan(1)

    const idx = 1 // pick the second orientation
    const want = pr.data.placements[idx].squares.map((s: any) => `${s.x},${s.y}`).sort().join('|')
    applyAction(g, 0, { t: 'prompt', promptId: pr.id, choice: idx })
    expect(occupiedSquares(u).map((s) => `${s.x},${s.y}`).sort().join('|')).toBe(want)
  })

  it('teleportWithPlacement teleports directly (no prompt) for a single-square unit', () => {
    const g = newGame(); keepBoth(g); fillSites(g, 0)
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1); u.enteredTurn = -1
    teleportWithPlacement(makeCtx(g, u.id, 0, []), u.id, { x: 3, y: 2 })
    expect(g.prompts.length, 'no placement choice for a single-square unit').toBe(0)
    expect([u.x, u.y]).toEqual([3, 2])
  })

  it('a wall body can be ROTATED (horizontal → vertical) via the teleport `shape`', () => {
    const g = newGame(); keepBoth(g); fillSites(g, 0)
    const u = summonCard(g, 0, 'Foot Soldier', 1, 1); u.enteredTurn = -1
    u.extraSquares = [{ x: 2, y: 1, region: 'surface' }] // a 2x1 wall, horizontal at (1,1)-(2,1)
    // teleport to (2,2) choosing a VERTICAL orientation: anchor + one step DOWN
    makeCtx(g, u.id, 0, []).teleport(u.id, 2, 2, 'surface', { shape: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }] })
    expect([u.x, u.y]).toEqual([2, 2])
    expect(u.extraSquares).toEqual([{ x: 2, y: 3, region: 'surface' }]) // now vertical (2,2)-(2,3)
    expect(occupiedSquares(u)).toEqual([{ x: 2, y: 2 }, { x: 2, y: 3 }])
  })
})
