// A card in your cemetery that offers a "from the cemetery" ability (here: Vivien copying a realm
// Savior-Spellcaster's ward) glows slimy green in the cemetery viewer and gets a ⚗ activate button.
import { describe, it, expect, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })
const press = (key: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) })

describe('cemetery from-cemetery abilities in the viewer', () => {
  it('glows the card slimy green and offers a ⚗ activate button', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    g.players[me].mana = 20
    // a realm Savior made a Spellcaster — a source Vivien copies
    const sc = `cs${g.nextId++}`; g.cards[sc] = { id: sc, name: 'Savior', owner: me }
    const su = `us${g.nextId++}`
    g.units[su] = {
      id: su, cardId: sc, name: 'Savior', owner: me, controller: me, isAvatar: false, x: 0, y: 0, region: 'surface',
      tapped: false, damage: 0, enteredTurn: 0, usedThisTurn: {}, carrying: [], carryingUnits: [],
      modifiers: [{ kind: 'keyword', keyword: 'spellcaster', duration: 'permanent', turn: g.turn, sourcePlayer: me }],
    }
    // Vivien lies in my cemetery — she inherits the Savior's location-independent ward
    const vc = `cv${g.nextId++}`; g.cards[vc] = { id: vc, name: 'Vivien the Enchantress', owner: me }
    g.players[me].cemetery.push(vc)

    const h = new GameHarness(g).mount(); active = h
    press('c'); h.rerender() // open my cemetery

    expect(h.container.querySelector('.modal h3')?.textContent, 'my cemetery opened').toContain('cemetery')
    expect(h.container.querySelector('[data-cem-glow="1"]'), 'the card with a from-cemetery effect glows').toBeTruthy()
    const btn = h.container.querySelector('[data-cem-activate]') as HTMLElement
    expect(btn, 'a ⚗ activate button is offered').toBeTruthy()
    expect(btn.textContent, 'labelled with the copied ability + its source').toMatch(/Savior/)
  })
})
