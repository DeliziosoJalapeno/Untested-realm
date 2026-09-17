// Route enumeration must stay BOUNDED on a route-dense board (an Airborne high-movement unit on a full
// board of sites, or free-step corridors, can otherwise explode super-exponentially). The picker only
// needs a handful of routes; reachability (reachableLocations, a BFS) stays COMPLETE, and the fastest
// path (findPath, a BFS) is unaffected by the enumeration cap.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { enumeratePaths, reachableLocations, findPath, applyJudge, type GameState, type Step, type UnitState } from '../src'

function denseBoard(): { g: GameState; u: UnitState } {
  const g = newGame(); keepBoth(g)
  for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) applyJudge(g, 0, { k: 'placeSite', name: 'Rustic Village', player: 0, x, y })
  applyJudge(g, 0, { k: 'summonUnit', name: 'Bone Jumble', player: 0, x: 0, y: 0, region: 'surface', noGenesis: true })
  const u = Object.values(g.units).find((v) => v.name === 'Bone Jumble')! as UnitState
  u.enteredTurn = -5
  u.modifiers.push({ kind: 'keyword', keyword: 'airborne' } as any) // diagonals → many routes
  u.modifiers.push({ kind: 'keyword', keyword: 'movement +5' } as any) // maxSteps 6 → whole board reachable
  return { g, u }
}

describe('enumeratePaths stays bounded; reachability + fastest path are complete', () => {
  it('returns at most `cap` routes and terminates on a route-dense board', () => {
    const { g, u } = denseBoard()
    const dest: Step = { x: 4, y: 3, region: 'surface' }
    const report = { truncated: false }
    const routes = enumeratePaths(g as GameState, u, dest, 12, { allLengths: true, report })
    expect(routes.length).toBeGreaterThan(1)      // many routes exist…
    expect(routes.length).toBeLessThanOrEqual(12) // …but we stop at the cap (test completing = it terminated)
    // this board has FAR more than 12 routes, so we either hit the cap or the budget bailed (truncated).
    expect(routes.length === 12 || report.truncated).toBe(true)
  })

  it('reachableLocations is COMPLETE (the far corner is reachable) independent of the enum cap', () => {
    const { g, u } = denseBoard()
    const reach = reachableLocations(g as GameState, u)
    expect(reach.some((s) => s.x === 4 && s.y === 3 && s.region === 'surface')).toBe(true)
    expect(reach.some((s) => s.x === 4 && s.y === 0 && s.region === 'surface')).toBe(true)
  })

  it('findPath gives the true shortest route (BFS), not the shortest of the capped enum', () => {
    const { g, u } = denseBoard()
    const fast = findPath(g as GameState, u, { x: 4, y: 3, region: 'surface' })
    expect(fast).toBeTruthy()
    expect(fast!.length).toBe(4) // airborne diagonal: (0,0)→(4,3) closes max(4,3)=4 in 4 steps
  })
})
