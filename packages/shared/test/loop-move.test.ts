// A unit with movement to spare may step OUT and back, ending on the site it started on ("move in
// place" — rulebook: it spends movement leaving and returning). loopRoutes enumerates those one-hop
// round trips so the GUI can offer the unit's own site as a move destination.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { loopRoutes, maxSteps, applyAction, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

function row(): GameState {
  const g = newGame(); keepBoth(g); g.turn = 3
  for (let x = 0; x < 3; x++) placeSite(g, 0, 'Spire', x, 1) // sites at (0,1),(1,1),(2,1)
  return g
}
const withMove = (u: UnitState) => { u.enteredTurn = -5; u.modifiers.push({ kind: 'keyword', keyword: 'movement +1', duration: 'permanent', turn: 0, sourcePlayer: 0 } as any) }

describe('loopRoutes — move out and back to your own site', () => {
  it('offers an out-and-back hop off each reachable neighbour when movement ≥ 2', () => {
    const g = row()
    const u = summonCard(g, 0, 'Bone Jumble', 1, 1); withMove(u) // centre site, movement +1 → 2 steps
    expect(maxSteps(g, u)).toBe(2)
    const loops = loopRoutes(g, u)
    // two neighbours on the row → two loops, each ending back on the unit's own square
    expect(loops.length).toBe(2)
    for (const r of loops) {
      expect(r[r.length - 1]).toEqual({ x: 1, y: 1, region: 'surface' })
      expect(r).toHaveLength(2) // [neighbour, home]
    }
    expect(loops.some((r) => r[0].x === 0 && r[0].y === 1)).toBe(true)
    expect(loops.some((r) => r[0].x === 2 && r[0].y === 1)).toBe(true)
  })

  it('a plain 1-step unit cannot loop (no budget to leave AND return)', () => {
    const g = row()
    const u = summonCard(g, 0, 'Bone Jumble', 1, 1); u.enteredTurn = -5 // no movement bonus → 1 step
    expect(maxSteps(g, u)).toBe(1)
    expect(loopRoutes(g, u)).toHaveLength(0)
  })

  it('the engine resolves a loop path — the unit ends where it started, having moved', () => {
    const g = row()
    const u = summonCard(g, 0, 'Bone Jumble', 1, 1); withMove(u)
    const loop = loopRoutes(g, u)[0] // e.g. [(0,1),(1,1)]
    const res = applyAction(g, 0, { t: 'moveAttack', unitId: u.id, path: loop })
    expect(res.ok).toBe(true)
    const after = g.units[u.id]
    expect({ x: after.x, y: after.y, region: after.region }).toEqual({ x: 1, y: 1, region: 'surface' })
    expect(after.tapped, 'moving taps the unit').toBe(true)
  })
})
