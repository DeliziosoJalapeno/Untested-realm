// Deck builder "Tokens" art: a custom token art is offered ONLY to an account the admin granted it to.
// Anyone else never sees it in the builder — not in the picker, and not even if their deck still names it.
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'

const deck: any = {
  id: 'deck-1', name: 'Frogs', avatar: 'Sorcerer',
  spellbook: { 'Pollimorph': 2 }, atlas: { 'Pond': 3 },
  art: { Frog: 'custom:art-frog' }, // e.g. granted once, since revoked
}
let granted: { id: string; token: string; label: string }[] = []

vi.mock('../src/App', () => ({
  loadDecks: () => [structuredClone(deck)],
  saveDeck: (d: any) => d,
  deleteDeckById: vi.fn(),
  newDeckId: () => 'new-id',
}))
vi.mock('../src/auth', () => ({
  myTokenArtsCached: () => granted,
  fetchMyTokenArts: async () => granted,
}))

afterEach(() => { cleanup(); granted = [] })

let DeckBuilder: typeof import('../src/components/DeckBuilder').default
beforeAll(async () => { DeckBuilder = (await import('../src/components/DeckBuilder')).default }, 60_000) // the card DB is a slow first import

async function mount() {
  const r = render(<DeckBuilder onBack={vi.fn()} />)
  await act(async () => {}) // let the grants fetch settle
  return r
}
const customImgs = (c: HTMLElement) => [...c.querySelectorAll('img')].filter((i) => i.getAttribute('src')?.startsWith('/api/token-art/'))

describe('deck builder custom token art', () => {
  it('a granted player gets a Frog row whose picker offers the custom art', async () => {
    granted = [{ id: 'art-frog', token: 'Frog', label: 'Golden Frog' }]
    const { container } = await mount()
    const row = container.querySelector('[data-token-art="Frog"]') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row.querySelector('button')!)
    const opts = [...container.querySelectorAll('.art-opt')].map((b) => b.textContent)
    expect(opts.some((t) => t?.includes('Golden Frog'))).toBe(true)
    expect(customImgs(container).map((i) => i.getAttribute('src'))).toContain('/api/token-art/art-frog')
    expect(container.querySelector('.art-opt.sel')?.textContent, 'the deck\'s pick is selected').toContain('Golden Frog')
  })

  it('a player without the grant is never shown it — no Frog row, no custom image', async () => {
    granted = []
    const { container } = await mount()
    expect(container.querySelector('[data-token-art="Frog"]')).toBeNull()
    // Skeleton still has its printed alternative arts, but no custom option
    const skel = container.querySelector('[data-token-art="Skeleton"]') as HTMLElement
    expect(skel).toBeTruthy()
    fireEvent.click(skel.querySelector('button')!)
    expect(customImgs(container)).toEqual([])
  })

  it('a grant for another token does not leak onto this one', async () => {
    granted = [{ id: 'art-skel', token: 'Skeleton', label: 'Bone Lord' }]
    const { container } = await mount()
    expect(container.querySelector('[data-token-art="Frog"]')).toBeNull()
    fireEvent.click((container.querySelector('[data-token-art="Skeleton"]') as HTMLElement).querySelector('button')!)
    expect(customImgs(container).map((i) => i.getAttribute('src'))).toEqual(['/api/token-art/art-skel'])
  })
})
