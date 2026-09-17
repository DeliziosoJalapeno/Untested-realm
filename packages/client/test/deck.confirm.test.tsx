// Deck-choice confirmation: every "Start" opens a full-screen preview of the chosen deck;
// the game launches only after Confirm.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import DeckPreview from '../src/components/DeckPreview'

vi.mock('../src/auth', () => ({
  fetchRooms: () => Promise.resolve([]),
  register: vi.fn(), login: vi.fn(), logout: vi.fn(),
}))

afterEach(() => cleanup())

const deck: any = {
  name: 'Test Deck', avatar: 'Ironclad',
  spellbook: { 'Ice Lance': 2, 'Heat Ray': 1 },
  atlas: { 'Great Wall': 3 },
  collection: { 'Silver Bullet': 1 },
}

describe('DeckPreview overlay', () => {
  it('previews every section of the deck and reports confirm / cancel', () => {
    const onConfirm = vi.fn(); const onCancel = vi.fn()
    render(<DeckPreview deck={deck} decks={[deck]} onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByText(/Spellbook/)).toBeTruthy()
    expect(screen.getByText(/Atlas/)).toBeTruthy()
    expect(screen.getByText(/Collection/)).toBeTruthy()
    expect(document.body.textContent).toContain('×2') // Ice Lance copy count
    fireEvent.click(document.querySelector('[data-confirm="1"]')!)
    expect(onConfirm).toHaveBeenCalledWith(deck)
    fireEvent.click(document.querySelector('[data-cancel="1"]')!)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('switching decks in the preview confirms with the newly chosen deck', () => {
    const deckB: any = { id: 'deckB', name: 'Other Deck', avatar: 'Ironclad', spellbook: { 'Heat Ray': 1 }, atlas: {}, collection: {} }
    const onConfirm = vi.fn()
    render(<DeckPreview deck={{ ...deck, id: 'deckA' }} decks={[{ ...deck, id: 'deckA' }, deckB]} onConfirm={onConfirm} onCancel={vi.fn()} />)
    fireEvent.change(document.querySelector('[data-deck-pick]')!, { target: { value: 'deckB' } })
    expect(document.body.textContent, 'the preview reflects the switched deck').toContain('1 spells')
    fireEvent.click(document.querySelector('[data-confirm="1"]')!)
    expect(onConfirm).toHaveBeenCalledWith(deckB) // launches with the deck picked IN the preview
  })
})

describe('Home routes every start through the confirmation', () => {
  it('hotseat: shows the overlay, launches only on Confirm', async () => {
    const Home = (await import('../src/components/Home')).default
    const onHotseat = vi.fn()
    render(
      <Home username={null} onAuth={vi.fn()} onHotseat={onHotseat} onOnline={vi.fn()}
        onVsBot={vi.fn()} onDecks={vi.fn()} onCollection={vi.fn()} onScenarios={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('Start hotseat game'))
    expect(document.querySelector('[data-overlay="deckconfirm"]'), 'preview opened').toBeTruthy()
    expect(onHotseat, 'not launched yet').not.toHaveBeenCalled()
    fireEvent.click(document.querySelector('[data-confirm="1"]')!)
    expect(onHotseat).toHaveBeenCalledTimes(1)
  })

  it('Back dismisses the preview without starting', async () => {
    const Home = (await import('../src/components/Home')).default
    const onVsBot = vi.fn()
    render(
      <Home username={null} onAuth={vi.fn()} onHotseat={vi.fn()} onOnline={vi.fn()}
        onVsBot={onVsBot} onDecks={vi.fn()} onCollection={vi.fn()} onScenarios={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('Start game vs Computer'))
    expect(document.querySelector('[data-overlay="deckconfirm"]')).toBeTruthy()
    fireEvent.click(document.querySelector('[data-cancel="1"]')!)
    expect(document.querySelector('[data-overlay="deckconfirm"]'), 'preview closed').toBeFalsy()
    expect(onVsBot).not.toHaveBeenCalled()
  })
})
