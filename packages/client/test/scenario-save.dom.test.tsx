// 💾 Save as scenario from a REPLAY: the replay holds the full game, so the board at the current step
// is saved exactly (both hands, decks). The rail button opens a name + public dialog.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { createGame, applyAction, starterDecks, type GameState } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

const pushed: { name: string; isPublic: boolean; data: GameState }[] = []
vi.mock('../src/auth', async (orig) => ({
  ...(await orig<typeof import('../src/auth')>()),
  isSignedIn: () => true,
  pushScenario: async (s: { name: string; isPublic: boolean; data: GameState }) => { pushed.push(s) },
}))
import ReplayViewer from '../src/components/ReplayViewer'
import { startReplay } from '../src/replay'

afterEach(() => { cleanup(); pushed.length = 0 })

describe('Save scenario from a replay', () => {
  it('saves the full board at the current step', async () => {
    const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 5, 0)
    const rec = startReplay('hotseat', [starterDecks[0] as any, starterDecks[1] as any], ['A', 'B'], 5, 0, null, false)
    for (const seat of [0, 1] as const) { applyAction(g, seat, { t: 'keepHand' }); rec.actions.push({ seat, action: { t: 'keepHand' } }) }
    const { container } = render(<ReplayViewer replay={rec} onLeave={() => {}} />)
    fireEvent.click(container.querySelector('[data-save-scenario="1"]')!)
    fireEvent.change(container.querySelector('[data-scen-name]')!, { target: { value: 'From replay' } })
    await act(async () => { fireEvent.click(container.querySelector('[data-scen-save]')!) })
    expect(pushed.length).toBe(1)
    expect(pushed[0].name).toBe('From replay')
    // step 0 of the replay = the fresh game: BOTH full hands, not a redacted view
    const fresh = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 5, 0)
    expect(pushed[0].data.players.map((p) => p.hand)).toEqual(fresh.players.map((p) => p.hand))
    expect(pushed[0].data.players[1].hand).not.toContain('hidden')
    expect(container.querySelector('[data-scen-msg]')?.textContent).toMatch(/Saved/)
  })
})
