// Repro: the walk animation must fire on EVERY move, not just the first. Drives the same unit through
// several sequential walks (each a new moveSeq) and asserts each one animates.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { board, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null; vi.useRealTimers() })

const ghost = (h: GameHarness) => h.container.querySelector('.unit.anim-move')

describe('walk animation retriggers on every move', () => {
  it('the same unit animates on its 1st, 2nd and 3rd move', () => {
    vi.useFakeTimers()
    const g = board(); g.prompts = []
    const u = usummon(g, 0, 'Bone Jumble', 0, 1); g.units[u].enteredTurn = -5
    const h = new GameHarness(g).mount(); active = h
    const s = h.state as GameState
    s.flow = (s.flow ?? {}) as any

    const routes: { x: number; y: number }[][] = [
      [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
      [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }],
      [{ x: 4, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 1 }],
    ]
    routes.forEach((route, i) => {
      const seq = i + 1
      const dest = route[route.length - 1]
      s.units[u].x = dest.x; s.units[u].y = dest.y
      ;(s.flow as any).moveSeq = seq
      ;(s.flow as any).moveAnim = [...((s.flow as any).moveAnim ?? []), { unitId: u, name: 'Bone Jumble', squares: route, seq }]
      h.rerender()
      expect(ghost(h), `move #${seq} animates`).toBeTruthy()
      act(() => { vi.advanceTimersByTime(1500) }) // let the walk finish before the next move
      h.rerender()
      expect(ghost(h), `move #${seq} completed (ghost cleared)`).toBeFalsy()
    })
  })
})
