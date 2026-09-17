// THE bug the user hit: a Fine Courser moves 2 squares to attack a Sorcerer and DIES to the strike-back.
// The walk was recorded (moveAnim) but the attacker is gone from view.units by render time, so the old
// "relocate the live unit" animation drew nothing — no movement animation at all. The walk is now a
// self-contained ghost built from the record, so it plays regardless; and because the mover died, its
// death fade is deferred to the DESTINATION until the walk finishes (not shown at its origin immediately).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { board, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null; vi.useRealTimers() })

const ghostAt = (h: GameHarness, cls: string, sq: string) =>
  [...h.container.querySelectorAll(`.unit.${cls}`)].some((g) => g.closest('[data-sq]')?.getAttribute('data-sq') === sq)

describe('move-and-attack that kills the attacker', () => {
  it('still walks the (now-dead) attacker, then fades it at the destination', () => {
    vi.useFakeTimers()
    const g = board(); g.prompts = []
    const atk = usummon(g, 0, 'Bone Jumble', 0, 1); g.units[atk].enteredTurn = -5
    const h = new GameHarness(g).mount(); active = h // prevUnitsRef captures the attacker at (0,1)

    // the move-and-attack: the engine recorded the 2-step walk, and the attacker DIED (removed from state)
    const s = h.state as GameState
    delete s.units[atk]
    s.flow = (s.flow ?? {}) as any
    ;(s.flow as any).moveSeq = 1
    ;(s.flow as any).moveAnim = [{ unitId: atk, name: 'Bone Jumble', squares: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], seq: 1 }]
    h.rerender()

    // the walk plays from the START even though the unit is gone; the death fade is NOT shown yet
    expect(ghostAt(h, 'anim-move', '0,1'), 'the dead attacker still walks from its origin').toBe(true)
    expect(h.container.querySelector('.unit.anim-death'), 'its death fade is deferred, not shown at the origin').toBeFalsy()

    // after the full walk (3 squares × 500ms) the walk clears and the fade appears at the DESTINATION
    act(() => { vi.advanceTimersByTime(1500) })
    h.rerender()
    expect(h.container.querySelector('.unit.anim-move'), 'the walk finished').toBeFalsy()
    expect(ghostAt(h, 'anim-death', '2,1'), 'the attacker fades at the destination where it fell').toBe(true)
  })
})
