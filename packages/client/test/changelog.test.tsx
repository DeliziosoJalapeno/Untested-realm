// The home page has a "What's new" button that opens an expandable changelog.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import Home from '../src/components/Home'
import { CHANGELOG } from '../src/changelog'

vi.mock('../src/auth', () => ({
  fetchRooms: () => Promise.resolve([]),
  register: vi.fn(), login: vi.fn(), logout: vi.fn(),
}))

afterEach(() => cleanup())

function renderHome() {
  render(
    <Home username={null} onAuth={vi.fn()} onHotseat={vi.fn()} onOnline={vi.fn()}
      onVsBot={vi.fn()} onDecks={vi.fn()} onCollection={vi.fn()} onScenarios={vi.fn()} />,
  )
}

describe('changelog button', () => {
  it('opens the changelog overlay showing every version, then closes', () => {
    renderHome()
    expect(document.querySelector('[data-overlay="changelog"]'), 'closed initially').toBeFalsy()

    fireEvent.click(screen.getByText(/What’s new/))
    expect(document.querySelector('[data-overlay="changelog"]'), 'overlay opened').toBeTruthy()
    for (const entry of CHANGELOG) expect(document.body.textContent).toContain(`v${entry.version}`)
    // newest version is expanded by default → its first change is visible (inline markdown is
    // rendered, so compare against the marker-free text the modal actually shows)
    const plain = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|__|\*|`/g, '')
    expect(document.body.textContent).toContain(plain(CHANGELOG[0].changes[0]))

    fireEvent.click(document.querySelector('[data-close="1"]')!)
    expect(document.querySelector('[data-overlay="changelog"]'), 'overlay closed').toBeFalsy()
  })

  it('renders markdown subsection headings (####Title####) as section titles', () => {
    // the latest entry uses subsections — parse them and show them as headings
    const latest = CHANGELOG[0]
    const titles = latest.sections.map((s) => s.title).filter(Boolean)
    expect(titles.length, 'the newest version defines subsections').toBeGreaterThan(0)
    // flat `changes` still holds every bullet across all sections (label/count rely on it)
    expect(latest.changes.length).toBe(latest.sections.reduce((n, s) => n + s.changes.length, 0))

    renderHome()
    fireEvent.click(screen.getByText(/What’s new/))
    for (const title of titles) {
      expect(document.querySelector('.cl-section-title')).toBeTruthy()
      expect(document.body.textContent, `subsection "${title}" is shown`).toContain(title!)
    }
  })

  it('renders inline markdown (bold/italic) instead of showing the raw markers', () => {
    renderHome()
    fireEvent.click(screen.getByText(/What’s new/))
    const body = document.querySelector('.changelog-body') as HTMLElement
    // the displayed text must not leak raw **bold** / `code` markers — they are rendered as elements
    expect(body.textContent, 'no raw ** markers in the shown text').not.toContain('**')
    expect(body.textContent, 'no raw code ticks in the shown text').not.toContain('`')
    // any entry that used **bold** in source must produce a <strong> element
    const hasBoldSource = CHANGELOG.some((e) => e.changes.some((c) => /\*\*[^*]+\*\*/.test(c)))
    if (hasBoldSource) expect(body.querySelector('strong'), '**bold** renders as <strong>').toBeTruthy()
  })

  it('the button label advertises the latest version', () => {
    renderHome()
    expect(screen.getByText(new RegExp(`v${CHANGELOG[0].version.replace(/\./g, '\\.')}`))).toBeTruthy()
  })
})
