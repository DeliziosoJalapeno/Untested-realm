// No Man's Land: "Players can't summon minions to this site or the one directly in front of it."
// This must block EFFECT summons too (not just a player casting a minion) — e.g. Boulevard of Bones'
// Skeleton token. Previously effect-summons (summonToken / effectSummonUnit) skipped the site ban.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { summonToken, getScript, makeCtx, type GameState } from '../src'

const skelliesAt = (g: GameState, x: number, y: number) =>
  Object.values(g.units).filter((u) => u.name === 'Skeleton' && u.x === x && u.y === y).length

describe("No Man's Land blocks effect summons", () => {
  it('a token cannot be summoned onto the No Man\'s Land site', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, "No Man's Land", 2, 3)
    const tok = summonToken(g, 'Skeleton', 0, 2, 3)
    expect(tok, 'summon is forbidden here → returns null').toBeNull()
    expect(skelliesAt(g, 2, 3)).toBe(0)
  })

  it('the same token summons fine on an ordinary site', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 3)
    expect(summonToken(g, 'Skeleton', 0, 2, 3)).not.toBeNull()
    expect(skelliesAt(g, 2, 3)).toBe(1)
  })

  it('Boulevard of Bones does not raise a Skeleton onto an adjacent No Man\'s Land', () => {
    const g: any = newGame(); keepBoth(g)
    const boulevard = placeSite(g, 0, 'Boulevard of Bones', 2, 2)
    const nml = placeSite(g, 0, "No Man's Land", 2, 3) // played adjacent → triggers Boulevard
    getScript('Boulevard of Bones')!.onSitePlayed!(makeCtx(g, boulevard.id, 0, []), 0, nml as any)
    expect(skelliesAt(g, 2, 3), 'No Man\'s Land forbids the Skeleton').toBe(0)
  })

  it('Boulevard DOES raise a Skeleton onto an adjacent ordinary site', () => {
    const g: any = newGame(); keepBoth(g)
    const boulevard = placeSite(g, 0, 'Boulevard of Bones', 2, 2)
    const spire = placeSite(g, 0, 'Spire', 2, 3)
    getScript('Boulevard of Bones')!.onSitePlayed!(makeCtx(g, boulevard.id, 0, []), 0, spire as any)
    expect(skelliesAt(g, 2, 3)).toBe(1)
  })
})
