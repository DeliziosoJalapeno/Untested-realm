// Doomsday Device: each end-of-turn tick decrements the fuse AND records a synced "tick" flash
// (flow.ticks) so the GUI can float the fresh count (white-bordered black) over the device.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { applyJudge, makeCtx, getScript, type GameState } from '../src'

describe('Doomsday Device ticker', () => {
  it('decrements the fuse and records a tick flash of the new count', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'spawnArtifact', name: 'Doomsday Device', player: 0, x: 2, y: 1 })
    const art = Object.values(g.artifacts).find((a) => a.name === 'Doomsday Device')!
    art.counters = { fuse: 6 }

    const ctx = makeCtx(g as GameState, art.id, 0, [])
    getScript('Doomsday Device')!.endOfEveryTurn!(ctx)

    expect(art.counters.fuse).toBe(5)
    const ticks = (g.flow?.ticks ?? []) as { x: number; y: number; text: string; seq: number }[]
    expect(ticks.length).toBe(1)
    expect(ticks[0]).toMatchObject({ x: 2, y: 1, text: '5' })
    expect(g.flow.tickSeq).toBe(1)
  })

  it('a carried device flashes its tick over the carrier, not stale ground coords', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'token', name: 'Skeleton', player: 0, x: 3, y: 2, region: 'surface' })
    const carrier = Object.values(g.units).find((u) => u.name === 'Skeleton')!
    applyJudge(g, 0, { k: 'spawnArtifact', name: 'Doomsday Device', player: 0, x: 0, y: 0, giveTo: carrier.id })
    const art = Object.values(g.artifacts).find((a) => a.name === 'Doomsday Device')!
    expect(art.carriedBy).toBe(carrier.id)
    art.counters = { fuse: 4 }

    const ctx = makeCtx(g as GameState, art.id, 0, [])
    getScript('Doomsday Device')!.endOfEveryTurn!(ctx)

    const tick = (g.flow!.ticks as { x: number; y: number; text: string }[]).at(-1)!
    expect(tick).toMatchObject({ x: carrier.x, y: carrier.y, text: '3' })
  })

  it('detonation opens a black (doomsday) area-reveal grid over the blast', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'spawnArtifact', name: 'Doomsday Device', player: 0, x: 2, y: 1 })
    const art = Object.values(g.artifacts).find((a) => a.name === 'Doomsday Device')!
    art.counters = { fuse: 1 }

    const ctx = makeCtx(g as GameState, art.id, 0, [])
    getScript('Doomsday Device')!.endOfEveryTurn!(ctx)

    const rev = g.flow?.areaReveal as { element: string; cells: unknown[] }
    expect(rev.element).toBe('doomsday')
    expect(rev.cells.length).toBeGreaterThan(1) // the printed diamond lit up
  })
})
