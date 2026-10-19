// 🃏 Precon mode on the home page: every deck picker switches to the 12 official precons, vs Computer and
// hotseat start with the chosen precons, matchmaking is disabled, and "Create room" makes a precon room.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { PRECONS } from '@sorcery/shared'
import Home from '../src/components/Home'

vi.mock('../src/auth', () => ({
  fetchRooms: () => Promise.resolve([]),
  fetchMyRooms: () => Promise.resolve([]),
  fetchMyBugs: () => Promise.resolve([]),
  register: vi.fn(), login: vi.fn(), logout: vi.fn(),
}))

afterEach(() => { cleanup(); localStorage.clear() })

function renderHome() {
  const fns = { onVsBot: vi.fn(), onHotseat: vi.fn(), onOnline: vi.fn() }
  render(
    <Home username={null} onAuth={vi.fn()} onHotseat={fns.onHotseat} onOnline={fns.onOnline} onSealed={vi.fn()}
      onVsBot={fns.onVsBot} onDecks={vi.fn()} onCollection={vi.fn()} onScenarios={vi.fn()} onWatchReplay={vi.fn()} />,
  )
  return fns
}
const byId = (id: string) => PRECONS.find((p) => p.id === id)!

describe('Precon mode', () => {
  it('vs Computer starts with the two chosen precons', () => {
    const fns = renderHome()
    fireEvent.click(document.querySelector('[data-precon-mode]')!) // the 🃏 button in the vs Computer panel
    const mine = document.querySelector('[data-precon-pick]') as HTMLSelectElement
    expect(mine.querySelectorAll('option').length, 'all 12 precons offered').toBe(12)
    fireEvent.change(mine, { target: { value: 'precon:gothic-necromancer' } })
    fireEvent.change(document.querySelector('[data-precon-pick-b]')!, { target: { value: 'precon:beta-fire' } })
    fireEvent.click(screen.getByText('Start game vs Computer'))
    fireEvent.click(document.querySelector('[data-confirm="1"]')!) // the deck preview
    expect(fns.onVsBot).toHaveBeenCalledTimes(1)
    const [me, bot] = fns.onVsBot.mock.calls[0]
    expect(me.id).toBe('precon:gothic-necromancer')
    expect(me.spellbook).toEqual(byId('precon:gothic-necromancer').spellbook)
    expect(bot.id).toBe('precon:beta-fire')
  })

  it('matchmaking is disabled; Create room makes a precon room', () => {
    const fns = renderHome()
    fireEvent.click(document.querySelector('[data-precon-mode]')!) // the 🃏 button in the vs Computer panel
    expect((screen.getByText(/Find a battle/) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByText('Create room…'))
    expect((document.querySelector('[data-precon-room]') as HTMLInputElement).checked, 'precon ticked in the room options').toBe(true)
    fireEvent.click(screen.getByText(/Create private precon room/))
    fireEvent.click(document.querySelector('[data-confirm="1"]')!)
    expect(fns.onOnline).toHaveBeenCalledTimes(1)
    const args = fns.onOnline.mock.calls[0]
    expect(args[0]).toBe('create')
    expect(args[2].id).toMatch(/^precon:/)
    expect(args[7], 'precon flag').toBe(true)
  })

  it('off by default: your own decks, constructed rooms', () => {
    const fns = renderHome()
    expect(document.querySelector('[data-precon-pick]')).toBeNull()
    fireEvent.click(screen.getByText('Create room…'))
    fireEvent.click(screen.getByText(/Create private room/))
    fireEvent.click(document.querySelector('[data-confirm="1"]')!)
    expect(fns.onOnline.mock.calls[0][7]).toBeFalsy()
  })
})
