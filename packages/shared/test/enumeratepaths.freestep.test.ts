// Route enumeration must be bounded by COST, not step-count. A free step (Updraft Ridge lets
// an Airborne minion glide off the ridge for 0) lets a route have MORE steps than its cost
// limit. The old guard pruned any route longer than `maxSteps`, so a far square reachable only
// via the free step yielded ZERO enumerated routes → the client silently auto-resolved.
// The free step is evaluated at every hop, so it applies whether the unit STARTS on the ridge
// OR merely passes THROUGH it — both are covered here.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { enumeratePaths, maxSteps, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

// a horizontal corridor of sites along y=1, with an Updraft Ridge at `ridgeX`. Off-corridor
// squares have no site, so an Airborne mover is confined to the row → the DFS stays cheap.
function corridor(ridgeX: number, startX: number): { g: GameState; u: UnitState } {
  const g: GameState = newGame(); keepBoth(g); g.turn = 3
  for (let x = 0; x < 5; x++) {
    if (x === ridgeX) placeSite(g, 0, 'Updraft Ridge', x, 1)
    else placeSite(g, 0, 'Spire', x, 1)
  }
  const u = summonCard(g, 0, 'Bone Jumble', startX, 1)
  u.enteredTurn = -5
  u.modifiers.push({ kind: 'keyword', keyword: 'airborne', duration: 'permanent', turn: 0, sourcePlayer: 0 } as any)
  u.modifiers.push({ kind: 'keyword', keyword: 'movement +1', duration: 'permanent', turn: 0, sourcePlayer: 0 } as any)
  return { g, u }
}

describe('enumeratePaths honors Updraft Ridge free steps', () => {
  it('reaches a 3-away square when STARTING on the ridge (glide first, then 2 costed)', () => {
    const { g, u } = corridor(0, 0) // ridge at (0,1); the unit stands on it
    expect(maxSteps(g, u)).toBe(2)
    const routes = enumeratePaths(g, u, { x: 3, y: 1, region: 'surface' }, 40, { allLengths: true })
    expect(routes.length, 'the glide-extended route is found (not zero → no silent auto)').toBeGreaterThan(0)
    expect(routes.some((r) => r.length === 3), 'a 3-step route exists past the 2-cost limit').toBe(true)
  })

  it('reaches a 3-away square with the ridge only PASSED THROUGH mid-route', () => {
    const { g, u } = corridor(1, 0) // ridge at (1,1); the unit starts one square before it
    // (0,1) --cost1--> (1,1)=ridge --FREE glide--> (2,1) --cost2--> (3,1): 3 steps, cost 2.
    const routes = enumeratePaths(g, u, { x: 3, y: 1, region: 'surface' }, 40, { allLengths: true })
    expect(routes.length, 'a unit that only passes through the ridge still gets the free glide').toBeGreaterThan(0)
    expect(routes.some((r) => r.length === 3 && r[r.length - 1].x === 3), 'the 3-step glide route reaches (3,1)').toBe(true)
  })

  it('without any ridge, the same unit can only reach 2 squares away', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    for (let x = 0; x < 5; x++) placeSite(g, 0, 'Spire', x, 1)
    const u = summonCard(g, 0, 'Bone Jumble', 0, 1); u.enteredTurn = -5
    u.modifiers.push({ kind: 'keyword', keyword: 'airborne', duration: 'permanent', turn: 0, sourcePlayer: 0 } as any)
    u.modifiers.push({ kind: 'keyword', keyword: 'movement +1', duration: 'permanent', turn: 0, sourcePlayer: 0 } as any)
    expect(enumeratePaths(g, u, { x: 3, y: 1, region: 'surface' }, 40, { allLengths: true }).length, 'no free step → 3-away is out of reach').toBe(0)
    expect(enumeratePaths(g, u, { x: 2, y: 1, region: 'surface' }, 40, { allLengths: true }).length, '2-away is reachable').toBeGreaterThan(0)
  })
})
