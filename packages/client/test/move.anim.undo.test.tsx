// THE user's repro: move a unit (a walk), UNDO, then move it again — the walk must animate the 2nd time.
// Undo restores the pre-move state, so flow.moveSeq rolls BACKWARDS; the animation "seen" watermark only
// climbs, so the re-done move (same seq) used to be rejected as already-shown → no animation. The effects
// now re-arm the watermark whenever the seq rolls back, so a redo re-fires.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { board, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null; vi.useRealTimers() })

const ghost = (h: GameHarness) => h.container.querySelector('.unit.anim-move')

describe('walk animation after undo', () => {
  it('re-animates a move that was undone and redone (same seq)', () => {
    vi.useFakeTimers()
    const g = board(); g.prompts = []
    const u = usummon(g, 0, 'Bone Jumble', 0, 1); g.units[u].enteredTurn = -5
    const h = new GameHarness(g).mount(); active = h
    const s = h.state as GameState
    s.flow = (s.flow ?? {}) as any
    const route = [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]

    const move = () => {
      s.units[u].x = 2; s.units[u].y = 1
      ;(s.flow as any).moveSeq = 1
      ;(s.flow as any).moveAnim = [{ unitId: u, name: 'Bone Jumble', squares: route, seq: 1 }]
      h.rerender()
    }
    const undo = () => {
      // undo restores the FULL pre-move state: unit back at origin, seq rolled back, the record removed
      s.units[u].x = 0; s.units[u].y = 1
      ;(s.flow as any).moveSeq = 0
      ;(s.flow as any).moveAnim = []
      h.rerender()
    }

    move()
    expect(ghost(h), '1st move animates').toBeTruthy()
    act(() => { vi.advanceTimersByTime(1500) }); h.rerender() // finish the walk

    undo()
    expect(ghost(h), 'undo does not animate anything').toBeFalsy()

    move() // redo the SAME move (seq 1 again)
    expect(ghost(h), 'the redone move animates again (watermark re-armed by the undo)').toBeTruthy()
  })
})
