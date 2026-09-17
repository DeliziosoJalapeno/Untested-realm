// Regression: an in-flight walk must run to completion even when the NEXT move arrives (the opponent's
// reply, the bot's turn, your next move). The step timers used to live in the move effect's cleanup, so
// any following move (which re-runs the effect) cancelled them — freezing the earlier walk at its start
// square. That made movement "mostly not animate": only the last move of a burst survived.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { board, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null; vi.useRealTimers() })

function inject(g: GameState, seq: number, unitId: string, squares: { x: number; y: number }[]) {
  g.flow = g.flow ?? {}
  ;(g.flow as any).moveSeq = seq
  ;(g.flow as any).moveAnim = [...((g.flow as any).moveAnim ?? []), { unitId, name: 'Bone Jumble', squares, seq }]
}
// a walk renders as a self-contained ghost (no data-unit); detect it by row (A walks row y=1, B row y=3)
const walkingInRow = (h: GameHarness, y: number) =>
  [...h.container.querySelectorAll('.unit.anim-move')].some((g) => g.closest('[data-sq]')?.getAttribute('data-sq')?.endsWith(`,${y}`))

describe('movement animation survives a following move', () => {
  it('a later move does not freeze the earlier walk — both complete', () => {
    vi.useFakeTimers()
    const g = board(); g.prompts = []
    const a = usummon(g, 0, 'Bone Jumble', 0, 1)
    const b = usummon(g, 0, 'Bone Jumble', 0, 3)
    const h = new GameHarness(g).mount(); active = h

    // move A: a 2-step walk (3 squares) begins animating
    h.state.units[a].x = 2; h.state.units[a].y = 1
    inject(h.state as GameState, 1, a, [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }])
    h.rerender()
    expect(walkingInRow(h, 1), 'A starts walking (row 1)').toBe(true)

    // 250ms in, move B arrives (a following move) — this re-runs the move effect
    act(() => { vi.advanceTimersByTime(250) })
    h.state.units[b].x = 2; h.state.units[b].y = 3
    inject(h.state as GameState, 2, b, [{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }])
    h.rerender()
    expect(walkingInRow(h, 3), 'B starts walking (row 3)').toBe(true)

    // past A's full duration (3 squares × 500ms): A must have COMPLETED, not frozen
    act(() => { vi.advanceTimersByTime(1500) })
    h.rerender()
    expect(walkingInRow(h, 1), 'A finished its walk (was not cancelled by B)').toBe(false)

    // and B completes after its own duration too
    act(() => { vi.advanceTimersByTime(1500) })
    h.rerender()
    expect(walkingInRow(h, 3), 'B finished its walk').toBe(false)
  })
})
