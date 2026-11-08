// A face-down trap of yours: clicking the site offers its spring (the disguise is a basic site with no
// abilities of its own, so it once offered nothing), and hovering it shows the REAL card in the panel.
// A foe's trap stays its disguise.
import { describe, it, expect, afterEach } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

/** turn one of `owner`'s sites into a face-down Bouldermaw, disguised as its current (basic) face */
function makeTrap(g: any, owner: number): string {
  const site: any = Object.values(g.sites).find((s: any) => s.owner === owner && s.controller === owner)
  g.cards[site.cardId] = { ...g.cards[site.cardId], name: 'Bouldermaw' }
  site.trap = { element: 'earth', realName: 'Bouldermaw', realCardId: site.cardId }
  return site.id
}

function hoverText(h: GameHarness, el: Element): string {
  act(() => { fireEvent.mouseEnter(el) })
  h.rerender()
  return h.container.querySelector('.preview .hovertext')?.textContent ?? ''
}

describe('your face-down trap in the GUI', () => {
  it('clicking it on your turn offers the spring, with its cost', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    g.players[me].mana = 10
    const id = makeTrap(g, me)
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`.sitecard[data-site="${id}"]`)!)
    const btn = h.container.querySelector(`[data-ability="trap:spring"][data-source="${id}"]`) as HTMLButtonElement
    expect(btn, 'the spring button appears').toBeTruthy()
    expect(btn.textContent).toContain('Spring (6)')
    expect(btn.disabled, 'affordable, so enabled').toBe(false)
    expect(h.container.querySelector('.unitactions b')?.textContent).toContain('Bouldermaw')
  })

  it('hovering it shows the real card in the card panel', () => {
    const g = sweepBoardBase() as any
    const id = makeTrap(g, hotseatViewpoint(g))
    const h = new GameHarness(g).mount(); active = h
    expect(hoverText(h, h.container.querySelector(`.sitecard[data-site="${id}"]`)!)).toContain('Rolling Boulder')
  })

  it("a foe's trap hovers as its disguise", () => {
    const g = sweepBoardBase() as any
    const id = makeTrap(g, 1 - hotseatViewpoint(g))
    const h = new GameHarness(g).mount(); active = h
    expect(hoverText(h, h.container.querySelector(`.sitecard[data-site="${id}"]`)!)).not.toContain('Rolling Boulder')
  })
})
