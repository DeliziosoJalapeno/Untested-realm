import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { makeCtx, checkStateBased, type GameState } from '../src'

// A carrier dragged INTO THE VOID (Lacuna Entity, Nightmare, Into the Abyss — ctx.teleport with
// {push, intoVoid}) leaves its ON-TOP cargo behind on the surface; it doesn't drown in the void.
// A Brobdingnag Bullfrog (swallowed / carriedAreDisabled cargo) DOES take its meal down with it.
function setup(carrierName: string) {
  const g: GameState = newGame(); keepBoth(g)
  for (const [x, y] of [[2, 2], [2, 1], [1, 2], [3, 2]] as const) placeSite(g, 0, 'Rustic Village', x, y)
  // (2,3) is intentionally left siteless — the void the carrier is dragged into
  const carrier = summonCard(g, 0, carrierName, 2, 2); carrier.enteredTurn = -1
  const cargo = summonCard(g, 0, 'Bone Jumble', 2, 2); cargo.enteredTurn = -1
  carrier.carryingUnits = [cargo.id]; cargo.carriedBy = carrier.id
  const ctx: any = makeCtx(g, carrier.id, 0, [])
  ctx.teleport(carrier.id, 2, 3, 'void', { push: true, intoVoid: true }) // drag into the void
  checkStateBased(g)
  return { g, carrier, cargo }
}

describe('a carrier dragged into the void', () => {
  it('leaves its ON-TOP cargo behind on the surface (not drowned)', () => {
    const { g, carrier, cargo } = setup('Bone Jumble') // an ordinary on-top carrier
    expect(g.units[carrier.id], 'the carrier itself is banished by the void').toBeUndefined()
    const c = g.units[cargo.id]
    expect(c, 'the cargo survives').toBeTruthy()
    expect(c.region, 'and stays on the surface').toBe('surface')
    expect({ x: c.x, y: c.y }, 'dropped in place, where the carrier was').toEqual({ x: 2, y: 2 })
    expect(c.carriedBy, 'no longer carried').toBeNull()
  })

  it('but a Brobdingnag Bullfrog takes its swallowed cargo down with it', () => {
    const { g, cargo } = setup('Brobdingnag Bullfrog') // carriedAreDisabled — cargo is inside
    expect(g.units[cargo.id], 'the swallowed meal follows the Bullfrog into the void').toBeUndefined()
  })
})
