// Conceding is destructive (it immediately hands the win to the opponent), so the concede
// button must ask for confirmation first — a mis-click shouldn't end the game.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('concede asks for confirmation before ending the game', () => {
  it('clicking concede opens a confirm dialog; Cancel aborts, Confirm forfeits', () => {
    const g = sweepBoardBase()
    const h = new GameHarness(g); h.mobile = true; h.mount(); active = h

    // no dialog until you ask
    expect(h.container.querySelector('.confirm-concede'), 'no dialog initially').toBeFalsy()

    // click the 🏳 concede icon → the confirm dialog appears, game still running
    const flag = h.container.querySelector('.m-leftmenu button.flag') as HTMLElement
    expect(flag, 'concede button is present').toBeTruthy()
    h.click(flag)
    expect(h.container.querySelector('.confirm-concede'), 'dialog shown').toBeTruthy()
    expect(g.phase, 'not conceded yet').not.toBe('over')

    // Cancel → dialog closes, game still running
    const cancel = h.container.querySelector('.confirm-concede .confirm-actions button:not(.danger)') as HTMLElement
    h.click(cancel)
    expect(h.container.querySelector('.confirm-concede'), 'dialog dismissed').toBeFalsy()
    expect(g.phase, 'cancel does not concede').not.toBe('over')

    // ask again, then Confirm → the game ends (opponent wins)
    h.click(h.container.querySelector('.m-leftmenu button.flag') as HTMLElement)
    const confirm = h.container.querySelector('.confirm-concede .confirm-actions button.danger') as HTMLElement
    h.click(confirm)
    expect(g.phase, 'confirming forfeits the game').toBe('over')
    expect(h.drifts, 'concede was accepted, not a drift').toHaveLength(0)
  })
})
