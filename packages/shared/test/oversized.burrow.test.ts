import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'

// Rulebook: an effect that forcibly burrows or submerges an OVERSIZED unit (Bury,
// Drown, Cave-In, flood) FAILS unless the unit occupies a single terrain — all land
// (to bury) or all water (to submerge). A footprint straddling both is not moved.

/** a 2x2 oversized minion anchored at (1,1), covering (1,1)(2,1)(1,2)(2,2) on land. */
function oversizedOnLand() {
  const g = newGame(); keepBoth(g)
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) placeSite(g, 0, 'Active Volcano', x, y)
  const u = summonCard(g, 0, 'Escyllion Cyclops', 1, 1); u.size = '2x2'; u.enteredTurn = 0
  return { g, u }
}
const cast = (g: GameState, name: string, unitId: string) =>
  getScript(name)!.onCast!(makeCtx(g, g.players[0].avatarUnitId, 0, [{ unit: unitId }]))
const floodAt = (g: GameState, x: number, y: number) => {
  for (const s of Object.values(g.sites)) if (s.x === x && s.y === y) s.flooded = true
}

describe('Bury / Drown on an oversized unit require a uniform footprint', () => {
  it('Bury succeeds when the whole 2x2 is land', () => {
    const { g, u } = oversizedOnLand()
    cast(g, 'Bury', u.id)
    expect(g.units[u.id].region).toBe('underground')
  })

  it('Bury FAILS (no move) when the footprint straddles a water square', () => {
    const { g, u } = oversizedOnLand()
    floodAt(g, 2, 2) // one of its four squares becomes water → mixed terrain
    cast(g, 'Bury', u.id)
    expect(g.units[u.id].region, 'still on the surface — the burrow failed').toBe('surface')
  })

  it('Drown succeeds when the whole 2x2 is water', () => {
    const { g, u } = oversizedOnLand()
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) floodAt(g, x, y)
    cast(g, 'Drown', u.id)
    expect(g.units[u.id].region).toBe('underwater')
  })

  it('Drown FAILS (no move) when the footprint straddles a land square', () => {
    const { g, u } = oversizedOnLand()
    for (const [x, y] of [[1, 1], [2, 1], [1, 2]] as const) floodAt(g, x, y) // (2,2) stays land → mixed
    cast(g, 'Drown', u.id)
    expect(g.units[u.id].region, 'still on the surface — the submerge failed').toBe('surface')
  })

  it('control: a normal 1x1 minion still buries on land and submerges on water', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    const land = summonCard(g, 0, 'Carrion Beetles', 2, 2); land.enteredTurn = 0 // has Burrowing
    cast(g, 'Bury', land.id)
    expect(g.units[land.id].region).toBe('underground')

    const site = Object.values(g.sites).find((s) => s.x === 2 && s.y === 2)!
    site.flooded = true
    const water = summonCard(g, 0, 'Anui Undine', 2, 2); water.enteredTurn = 0 // has Submerge
    cast(g, 'Drown', water.id)
    expect(g.units[water.id].region).toBe('underwater')
  })
})
