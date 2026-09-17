// Opening a booster must NOT drop the cards into your collection grid until they are
// actually revealed; once revealed they stay in the collection.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import CollectionPage from '../src/components/CollectionPage'
import '../../../packages/shared/src/cards/scripts/index'

vi.mock('../src/auth', () => ({ isSignedIn: () => false, pushCollection: vi.fn(), fetchCollection: vi.fn() }))

afterEach(() => { cleanup(); localStorage.clear() })

describe('collection: cards only enter the grid once revealed', () => {
  it('opening a pack does not populate the owned grid until reveal', () => {
    render(<CollectionPage onBack={() => {}} />)
    // nothing owned yet
    expect(document.body.textContent).toContain('No cards yet')

    // open a booster — the pack panel appears, but the owned grid is still empty
    fireEvent.click(screen.getByText(/Open a .* booster/))
    expect(document.querySelector('.mullhand'), 'booster panel shown').toBeTruthy()
    expect(document.querySelectorAll('.db-results .db-card').length, 'not committed until revealed').toBe(0)
    expect(document.body.textContent).toContain('No cards yet')

    // reveal them all → now they’re in the collection grid and persist
    fireEvent.click(screen.getByText('Reveal all'))
    expect(document.querySelectorAll('.db-results .db-card').length, 'revealed cards are now owned').toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('No cards yet')
  })
})
