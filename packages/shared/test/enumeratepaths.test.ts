import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { enumeratePaths } from '../src'

// #4: the client prompts for the route ONLY when more than one shortest legal path
// reaches the clicked destination. enumeratePaths is that detector.
describe('enumeratePaths finds the distinct shortest routes', () => {
  function board() {
    const g = newGame(42, 0); keepBoth(g)
    for (let x = 0; x <= 4; x++) for (let y = 0; y <= 3; y++) placeSite(g, 0, 'Active Volcano', x, y)
    const u = summonCard(g, 0, 'Fine Courser', 2, 2); u.enteredTurn = 0 // Movement +1 → 2 steps
    return { g, u }
  }
  const dest = (x: number, y: number) => ({ x, y, region: 'surface' as const })

  it('a straight 2-step move has ONE path (no prompt)', () => {
    const { g, u } = board()
    expect(enumeratePaths(g, u, dest(2, 0)).length).toBe(1)
  })

  it('an L-shaped 2-step move has TWO paths (prompt)', () => {
    const { g, u } = board()
    const paths = enumeratePaths(g, u, dest(1, 1))
    expect(paths.length).toBe(2) // via (2,1) or via (1,2)
    expect(paths.every((p) => p.length === 2)).toBe(true)
    const mids = paths.map((p) => `${p[0].x},${p[0].y}`).sort()
    expect(mids).toEqual(['1,2', '2,1'])
  })

  it('an adjacent 1-step move has ONE path (no prompt)', () => {
    const { g, u } = board()
    expect(enumeratePaths(g, u, dest(2, 1)).length).toBe(1)
  })

  it('a blocked route collapses to the single open path', () => {
    const { g, u } = board()
    // remove the site at (2,1) → only the (1,2) route to (1,1) remains
    for (const s of Object.values(g.sites)) if (s.x === 2 && s.y === 1) delete g.sites[s.id]
    const paths = enumeratePaths(g, u, dest(1, 1))
    expect(paths.length).toBe(1)
    expect(`${paths[0][0].x},${paths[0][0].y}`).toBe('1,2')
  })
})
