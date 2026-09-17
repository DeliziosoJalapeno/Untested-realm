// "Apply text to deck" must parse what the textarea SHOWS. With nothing typed,
// the box displays the current deck's text — clicking Apply must NOT wipe the
// deck to empty (the old "Parse text into current deck" bug), and must keep the
// same deck id (not detach into a fresh one).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'

const deck: any = {
  id: 'deck-1',
  name: 'Loaded Deck',
  avatar: 'Ironclad',
  spellbook: { 'Ice Lance': 2, 'Heat Ray': 1 },
  atlas: { 'Great Wall': 3 },
}

let saved: any = null
vi.mock('../src/App', () => ({
  loadDecks: () => [structuredClone(deck)],
  saveDeck: (d: any) => { saved = d; return d },
  deleteDeckById: vi.fn(),
  newDeckId: () => 'new-id',
}))

afterEach(() => { cleanup(); saved = null })

describe('DeckBuilder "Apply text to deck"', () => {
  it('applying with an untouched box preserves the deck and its id', async () => {
    const DeckBuilder = (await import('../src/components/DeckBuilder')).default
    render(<DeckBuilder onBack={vi.fn()} />)

    fireEvent.click(screen.getByText('Import / Export'))
    fireEvent.click(screen.getByText('Apply text to deck'))

    // Deck is still intact — spellbook counts render in the right panel.
    expect(document.body.textContent).toContain('Ice Lance')
    expect(document.body.textContent).toContain('Great Wall')
    // Save persists under the ORIGINAL id (not a detached fresh deck).
    fireEvent.click(screen.getByText('Save'))
    expect(saved?.id).toBe('deck-1')
    expect(saved?.spellbook?.['Ice Lance']).toBe(2)
  })

  it('applying edited text replaces the deck contents', async () => {
    const DeckBuilder = (await import('../src/components/DeckBuilder')).default
    render(<DeckBuilder onBack={vi.fn()} />)

    fireEvent.click(screen.getByText('Import / Export'))
    fireEvent.change(document.querySelector('textarea')!, {
      target: { value: '# Avatar\n1 Ironclad\n# Spellbook\n3 Heat Ray\n# Atlas\n2 Great Wall' },
    })
    fireEvent.click(screen.getByText('Apply text to deck'))

    expect(document.body.textContent).toContain('3× Heat Ray')
    expect(document.body.textContent).not.toContain('Ice Lance')
  })
})
