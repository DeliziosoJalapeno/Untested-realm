// The sealed deckbuild screen is laid out like the Collection page: the booster opener at
// the TOP (one booster at a time), and the deck-builder grid BELOW that fills as you reveal
// cards. "🎴 Open all" reveals everything and hides the opener. Edits push to the server and
// Ready is gated until the deck is legal.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import SealedDeckbuild from '../src/components/SealedDeckbuild'
import { generateSealedPacks, aggregatePool } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

afterEach(() => { cleanup(); localStorage.clear() })

function renderSealed(onSubmit = vi.fn(), opts: { roomKey?: string; initialDeck?: any } = {}) {
  const packs = generateSealedPacks('Beta', 6, 4242)
  const pool = aggregatePool(packs)
  render(
    <SealedDeckbuild
      pool={pool} packs={packs} edition="Beta" numPacks={6} deadline={Date.now() + 600_000}
      oppReady={false} oppPresent youReady={false} initialDeck={opts.initialDeck ?? null} spectator={false}
      roomKey={opts.roomKey ?? 'test-room'}
      onSubmit={onSubmit} onLeave={() => {}}
    />,
  )
  return { onSubmit, packs, pool }
}

const gridCount = () => document.querySelectorAll('.db-columns .db-results .db-card').length

describe('SealedDeckbuild — collection-page layout (opener on top, grid fills below)', () => {
  it('shows one booster on top and the builder grid below, which fills as you reveal', () => {
    const { packs } = renderSealed()
    // opener on top: exactly the FIRST booster, face-down
    expect(document.querySelector('.sealed-reveal')).toBeTruthy()
    expect(document.querySelectorAll('.packcard').length, 'one booster on top').toBe(packs[0].length)
    expect(document.querySelectorAll('.packcard.facedown').length).toBe(packs[0].length)
    // the builder grid is ALWAYS present below; before opening it only holds supplied cards
    expect(document.querySelector('.db-columns')).toBeTruthy()
    const suppliedOnly = gridCount()
    expect(suppliedOnly, 'supplied cards seed the grid (Spellslinger + 4 basic sites)').toBe(5)

    // revealing the booster fills the grid below
    fireEvent.click(screen.getByRole('button', { name: /Reveal booster/ }))
    expect(document.querySelectorAll('.packcard.revealed').length).toBe(packs[0].length)
    expect(gridCount(), 'grid grew with the revealed cards').toBeGreaterThan(suppliedOnly)
    // more boosters remain → a "Next booster" control appears
    expect(screen.getByRole('button', { name: /Next booster/ })).toBeTruthy()
  })

  it('"Open all" reveals everything and hides the opener; Ready gated; edits push', () => {
    const { onSubmit } = renderSealed()
    fireEvent.click(screen.getByRole('button', { name: /Open all/ }))

    // opener hidden (with a show toggle), grid now holds the whole pool
    expect(document.querySelector('.sealed-reveal'), 'opener hidden').toBeFalsy()
    expect(screen.getByRole('button', { name: /Show booster opening/ })).toBeTruthy()
    expect(gridCount()).toBeGreaterThan(5)

    // an empty deck is not legal → Ready reports it and is disabled
    const readyBtn = screen.getByText(/Not legal|Ready ▶/) as HTMLButtonElement
    expect(readyBtn.textContent).toMatch(/Not legal/)
    expect(readyBtn.disabled).toBe(true)

    // adding a (non-avatar) pool card edits the deck → onSubmit fired with ready=false
    onSubmit.mockClear()
    const cards = [...document.querySelectorAll('.db-results .db-card')] as HTMLElement[]
    const addable = cards.find((c) => c.querySelector('.badge')?.textContent !== '★' && c.querySelector('.badge')?.textContent !== '0/0')!
    fireEvent.click(addable)
    expect(onSubmit).toHaveBeenCalled()
    const [, ready] = onSubmit.mock.calls[onSubmit.mock.calls.length - 1]
    expect(ready).toBe(false)
  })

  it('a spectator sees a waiting screen, not a pool', () => {
    render(
      <SealedDeckbuild
        pool={{}} packs={[]} edition="Gothic" numPacks={6} deadline={Date.now() + 60_000}
        oppReady={false} oppPresent youReady={false} initialDeck={null} spectator
        roomKey="spectate-room"
        onSubmit={() => {}} onLeave={() => {}}
      />,
    )
    expect(document.body.textContent).toMatch(/building their sealed decks/)
    expect(document.querySelector('.db-results')).toBeFalsy()
    expect(document.querySelector('.sealed-reveal')).toBeFalsy()
  })
})

// Regression: a disconnect / page reload must NOT wipe your opened pool down to the supplied
// "standard" cards. Reveal progress is persisted per room, and a rebuilt deck is treated as
// fully-opened, so remounting restores the whole pool — not just the 5 supplied cards.
describe('SealedDeckbuild — reconnect keeps your opened pool (not just supplied cards)', () => {
  it('restores the revealed pool from persistence after a remount (reconnect/reload)', () => {
    const { pool } = renderSealed(vi.fn(), { roomKey: 'reconnect-room' })
    fireEvent.click(screen.getByRole('button', { name: /Open all/ }))
    const openedCount = gridCount()
    expect(openedCount, 'whole pool revealed').toBeGreaterThan(5)

    // simulate a reconnect / page reload: unmount and mount a FRESH component for the same room
    cleanup()
    render(
      <SealedDeckbuild
        pool={pool} packs={generateSealedPacks('Beta', 6, 4242)} edition="Beta" numPacks={6}
        deadline={Date.now() + 600_000} oppReady={false} oppPresent youReady={false}
        initialDeck={null} spectator={false} roomKey="reconnect-room"
        onSubmit={vi.fn()} onLeave={() => {}}
      />,
    )
    // the grid still holds the full pool (progress restored) — NOT collapsed to the 5 supplied
    expect(gridCount(), 'opened pool survived the remount').toBe(openedCount)
    expect(gridCount()).toBeGreaterThan(5)
  })

  it('a reconnect with an already-built deck reveals the full pool even without saved progress', () => {
    // no persisted progress (fresh localStorage), but a non-empty deck came back from the server
    const initialDeck = { name: 'Sealed', avatar: 'Spellslinger', spellbook: { Flamewave: 1 }, atlas: {} }
    renderSealed(vi.fn(), { roomKey: 'rebuilt-room', initialDeck })
    // the safety net reveals everything → grid holds the whole pool, not just the 5 supplied
    expect(gridCount(), 'built deck ⇒ pool treated as fully opened').toBeGreaterThan(5)
    expect(document.querySelector('.sealed-reveal'), 'opener auto-collapsed after full reveal').toBeFalsy()
  })
})
