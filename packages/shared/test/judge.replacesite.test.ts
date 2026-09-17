// Editor "replace site" — an atomic destroy-and-place that swaps one site for another in the SAME
// square, keeping whoever controlled it. No rubble, no lingering old site.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { applyAction, type GameState } from '../src'

describe('judge replaceSite', () => {
  it('swaps a site for another in place, keeping the controller and leaving no rubble', () => {
    const g = newGame() as GameState; keepBoth(g)
    const old = placeSite(g, 1, 'Rustic Village', 2, 2) // controlled by player 1
    const res = applyAction(g, 0, { t: 'judge', op: { k: 'replaceSite', siteId: old.id, name: 'Spire' } } as any)
    expect(res.ok, res.ok ? '' : (res as any).error).toBe(true)

    const here = Object.values(g.sites).filter((s) => s.x === 2 && s.y === 2)
    expect(here.length, 'exactly one site remains on the square (no rubble)').toBe(1)
    expect(here[0].name).toBe('Spire')
    expect(here[0].controller, 'keeps the old controller (1), not the editing player (0)').toBe(1)
    expect(here[0].id).not.toBe(old.id) // a fresh site
    expect(g.sites[old.id], 'the old site is gone').toBeUndefined()
  })

  it('rejects a non-site replacement', () => {
    const g = newGame() as GameState; keepBoth(g)
    const old = placeSite(g, 0, 'Rustic Village', 2, 2)
    const res = applyAction(g, 0, { t: 'judge', op: { k: 'replaceSite', siteId: old.id, name: 'Foot Soldier' } } as any)
    expect(res.ok).toBe(false)
    expect(g.sites[old.id]?.name, 'the original site is untouched on rejection').toBe('Rustic Village')
  })
})
