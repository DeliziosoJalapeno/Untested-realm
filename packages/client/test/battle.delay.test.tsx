// Regression: a Move & Attack records the attacker's walk (moveAnim) AND the battle (battleReveal) in one
// state update. The battle popup is a centred fixed panel that would cover the board — so it must WAIT for
// the walk to finish, or the movement animation is never seen. Here the popup is held ~1.5s (a 3-square
// walk) then appears.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { board, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null; vi.useRealTimers() })

const popup = (h: GameHarness) => h.container.querySelector('[data-battle-pop]')

describe('battle popup waits for the attacker walk', () => {
  it('holds the battle reveal until the Move & Attack walk finishes, then shows it', () => {
    vi.useFakeTimers()
    const g = board(); g.prompts = []
    const atk = usummon(g, 0, 'Bone Jumble', 0, 1); g.units[atk].enteredTurn = -5
    const h = new GameHarness(g).mount(); active = h

    // one update carries BOTH the attacker's 2-step walk and the resolved battle
    const f = (h.state.flow = (h.state.flow ?? {}) as any)
    f.moveSeq = 1
    f.moveAnim = [{ unitId: atk, name: 'Bone Jumble', squares: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], seq: 1 }]
    h.state.units[atk].x = 2; h.state.units[atk].y = 1
    f.battleReveal = { seq: 1, site: 'the open field', attackers: [], defenders: [], logs: [] }
    h.rerender()

    // the popup is NOT shown yet — the walk is playing
    expect(popup(h), 'battle popup held while the attacker walks').toBeFalsy()
    expect(h.container.querySelector('.unit.anim-move'), 'the attacker is walking (ghost)').toBeTruthy()

    // partway through the walk it is still held
    act(() => { vi.advanceTimersByTime(800) })
    expect(popup(h), 'still held mid-walk').toBeFalsy()

    // once the 3-square walk (3×500ms) completes, the battle popup appears
    act(() => { vi.advanceTimersByTime(800) })
    h.rerender()
    expect(popup(h), 'battle popup shows after the walk').toBeTruthy()
  })
})
