// (1) A "peeked" card prompt (Seer / Rivers / Riddle Sphinx) shows the actual card
// (art + text) inside the keep/bottom prompt via data.reveal.
// (2) Log lines turn card names into coloured, clickable references (.cardref).

import { describe, it, expect, afterEach } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Seer-style peek prompt + log card links', () => {
  it('a keep/bottom prompt with data.reveal renders the peeked card', () => {
    const g = sweepBoardBase()
    ;(g as any).prompts = [{
      id: 'pk1', player: 0, kind: 'chooseOption',
      title: 'Your topmost spell — put it on the bottom?',
      data: { options: ['keep on top', 'put on bottom'], reveal: 'Fireball' },
      cont: 'noop',
    }]
    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    const box = root.querySelector('[data-promptbox="chooseOption"]')
    expect(box, 'the chooseOption prompt is shown').toBeTruthy()
    expect(box!.querySelector('.promptcard'), 'the peeked card is rendered in the prompt').toBeTruthy()
    // both keep + bottom options are still offered
    const choices = [...box!.querySelectorAll('[data-choice]')].map((b) => b.getAttribute('data-choice'))
    expect(choices).toContain('put on bottom')
  })

  it('a log line turns a card name into a coloured, clickable .cardref', () => {
    const g = sweepBoardBase()
    ;(g as any).log = [{ player: 0, msg: 'Alice casts Fireball at the front line.' }]
    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    const ref = [...root.querySelectorAll('.log .cardref')].find((s) => s.textContent === 'Fireball')
    expect(ref, 'Fireball is a clickable card reference').toBeTruthy()
    expect(ref!.className, 'coloured by element (Fireball is fire)').toContain('elem-fire')
  })

  it('HOVERING a log card name shows it in the lateral detail panel', () => {
    const g = sweepBoardBase()
    ;(g as any).log = [{ player: 0, msg: 'Alice casts Fireball at the front line.' }]
    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    const ref = [...root.querySelectorAll('.log .cardref')].find((s) => s.textContent === 'Fireball') as HTMLElement
    expect(ref).toBeTruthy()
    fireEvent.mouseEnter(ref); h.rerender()
    const panel = root.querySelector('.preview .hovercard')
    expect(panel, 'the detail panel now shows a card').toBeTruthy()
    expect(panel!.textContent).toContain('Fireball')
  })

  it('multiple opponent plays stack multiple pop-ups', () => {
    const g = sweepBoardBase()
    ;(g as any).lastPlay = { name: 'Fireball', player: 1, n: 1 }
    const h = new GameHarness(g).mount(); active = h
    h.rerender()
    ;(g as any).lastPlay = { name: 'Zap!', player: 1, n: 2 }
    h.rerender()
    const pops = h.container.querySelectorAll('.oppplay-stack .oppplay-pop')
    expect(pops.length, 'both plays are shown at once').toBe(2)
  })
})
