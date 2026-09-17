// Keyboard hotkeys (left-hand / WASD cluster): W skip a card popup, D step the computer, S
// subsurface, A collection, C your cemetery, X opponent's cemetery, Enter confirm. Zone/sub
// keys toggle (same key on/off). Ignored while typing in a field.
import { describe, it, expect, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function press(key: string, target?: Element) {
  act(() => {
    (target ?? window).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('game keyboard hotkeys', () => {
  it('S toggles subsurface view (same key on/off)', () => {
    const g = sweepBoardBase() as any
    const h = new GameHarness(g).mount(); active = h
    const board = () => h.container.querySelector('.board') as HTMLElement
    expect(board().classList.contains('subview')).toBe(false)
    press('s'); h.rerender()
    expect(board().classList.contains('subview'), 'S turned subsurface on').toBe(true)
    press('S'); h.rerender() // case-insensitive
    expect(board().classList.contains('subview'), 'S again turned it off').toBe(false)
  })

  it('A / C / X open the right zone panels', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const myName = g.players[me].name
    const oppName = g.players[1 - me].name
    const h = new GameHarness(g).mount(); active = h
    const modalText = () => [...h.container.querySelectorAll('.modal h3')].map((e) => e.textContent).join(' | ')

    press('c'); h.rerender()
    expect(modalText(), 'C opened MY cemetery').toContain(`${myName}'s cemetery`)
    press('c'); h.rerender()
    expect(h.container.querySelector('.modal'), 'C again closed it').toBeFalsy()

    press('x'); h.rerender()
    expect(modalText(), "X opened the OPPONENT's cemetery").toContain(`${oppName}'s cemetery`)

    press('a'); h.rerender() // switches straight to my collection
    expect(modalText().toLowerCase(), 'A opened my collection').toContain('collection')
  })

  it('W dismisses a card popup (opponent reveal)', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    g.flow = { ...(g.flow ?? {}), reveals: [{ by: (1 - me) as 0 | 1, names: ['Fireball'], n: 1 }] }
    const h = new GameHarness(g).mount(); active = h
    h.rerender()
    expect(h.container.querySelector('[data-reveal-pop]'), 'the reveal popup is up').toBeTruthy()
    press('w'); h.rerender()
    expect(h.container.querySelector('[data-reveal-pop]'), 'W dismissed it').toBeFalsy()
  })

  it('Enter clicks the on-screen confirm button', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    g.prompts = [{ id: 'cc1', player: me, kind: 'chooseCards', title: 'Pick a card',
      data: { cards: ['Fireball'], pick: 1, upTo: true }, cont: 'noop', ctx: {} }]
    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('[data-promptbox="chooseCards"] [data-confirm]'), 'a confirm button is shown').toBeTruthy()
    press('Enter'); h.rerender()
    expect(h.container.querySelector('[data-promptbox="chooseCards"]'), 'Enter confirmed and closed the prompt').toBeFalsy()
  })

  it('Enter confirms the concede dialog — the open modal wins over a background prompt confirm', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    // a background prompt whose banner ALSO carries a [data-confirm] button
    g.prompts = [{ id: 'bg1', player: me, kind: 'chooseCards', title: 'Pick a card',
      data: { cards: ['Fireball'], pick: 1, upTo: true }, cont: 'noop', ctx: {} }]
    const h = new GameHarness(g); h.mobile = true; h.mount(); active = h
    h.rerender()
    // open the concede dialog (mobile left-menu flag)
    h.click(h.container.querySelector('.m-leftmenu button.flag') as HTMLElement)
    expect(h.container.querySelector('.confirm-concede'), 'concede dialog shown').toBeTruthy()
    expect(g.phase, 'not conceded yet').not.toBe('over')
    // Enter → the modal's affirmative (🏳 Concede) fires, NOT the background prompt's confirm
    press('Enter'); h.rerender()
    expect(g.phase, 'Enter confirmed the concede').toBe('over')
    expect(h.container.querySelector('[data-promptbox="chooseCards"]'), 'the background prompt was left untouched').toBeTruthy()
    expect(h.drifts, 'concede accepted, no drift').toHaveLength(0)
  })

  it('ignores hotkeys while typing in an input field', () => {
    const g = sweepBoardBase() as any
    const h = new GameHarness(g).mount(); active = h
    const input = document.createElement('input')
    document.body.appendChild(input); input.focus()
    press('s', input) // bubbles to window with target=input → must be ignored
    h.rerender()
    expect(h.container.querySelector('.board')!.classList.contains('subview'), 'typing S did not toggle subsurface').toBe(false)
    input.remove()
  })
})
