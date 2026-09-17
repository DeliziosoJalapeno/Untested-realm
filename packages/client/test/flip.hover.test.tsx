// Hovering a FLIPPED double-faced unit (Druid → Bruin/aura side) must show its BACK face
// text + art in the detail panel, matching the board — not the front face.
import { describe, it, expect, afterEach } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function druidAvatar(g: any, flipped: boolean) {
  const me = hotseatViewpoint(g)
  const av = g.units[g.players[me].avatarUnitId]
  av.name = 'Druid'; g.cards[av.cardId].name = 'Druid'; av.flipped = flipped
  return av
}
function hoverText(h: GameHarness, chip: Element): string {
  act(() => { fireEvent.mouseEnter(chip) })
  h.rerender()
  return h.container.querySelector('.preview .hovertext')?.textContent ?? ''
}

describe('the card panel reflects a unit\'s flip state', () => {
  it('a FLIPPED Druid hovers as its back face (aura text), not the front', () => {
    const g = sweepBoardBase() as any
    druidAvatar(g, true)
    const h = new GameHarness(g).mount(); active = h
    const chip = h.container.querySelector('.unit.mine.avatar') as HTMLElement
    const text = hoverText(h, chip)
    expect(text, 'shows the BACK errata text').toContain('takes 1 damage')
    expect(text, 'not the front "Summon Bruin" text').not.toContain('Summon Bruin')
  })

  it('an UNFLIPPED Druid hovers as its front face', () => {
    const g = sweepBoardBase() as any
    druidAvatar(g, false)
    const h = new GameHarness(g).mount(); active = h
    const chip = h.container.querySelector('.unit.mine.avatar') as HTMLElement
    const text = hoverText(h, chip)
    expect(text, 'shows the FRONT text').toContain('Summon Bruin')
  })
})
