// ⚙ "Opponent's cards upside-down": with the setting on, the board gets `.opp-flip` and the opponent's
// card art (units, sites, ground artifacts) is tagged so CSS turns it 180°; your own cards are untouched.
import { describe, it, expect, afterEach } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { board, usummon } from '@sorcery/shared'
import { GameHarness } from './harness'
import { setSetting } from '../src/settings'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null; setSetting('flipOpponentCards', false) })

function mount(flip: boolean) {
  setSetting('flipOpponentCards', flip)
  const g = board() // p0's turn, p0 sites at (2,0),(2,1),(3,1),(1,1)
  const mine = usummon(g, 0, 'Bone Jumble', 2, 1)
  const theirs = usummon(g, 1, 'Bone Jumble', 3, 1)
  const h = new GameHarness(g).mount(); active = h
  return { h, mine, theirs }
}

describe("opponent's cards upside-down", () => {
  it('off by default: the board has no opp-flip class', () => {
    const { h } = mount(false)
    expect(h.container.querySelector('.board')!.classList.contains('opp-flip')).toBe(false)
  })

  it("on: the board is marked and only the opponent's unit sits in the flipped set", () => {
    const { h, mine, theirs } = mount(true)
    expect(h.container.querySelector('.board')!.classList.contains('opp-flip')).toBe(true)
    const flipped = (id: string) => !!h.container.querySelector(`.board.opp-flip .unit.theirs[data-unit="${id}"] .unitimg`)
    expect(flipped(theirs), "the opponent's unit art flips").toBe(true)
    expect(flipped(mine), 'your own unit does not').toBe(false)
  })

  it("the card preview panel is never flipped: it sits outside the board and uses its own image class", () => {
    const { h, theirs } = mount(true)
    fireEvent.mouseEnter(h.container.querySelector(`[data-unit="${theirs}"]`)!)
    h.rerender()
    const img = h.container.querySelector('.preview .hoverimg')
    expect(img, 'the hovered card shows in the preview').not.toBeNull()
    expect(img!.closest('.board'), 'preview is outside the board').toBeNull()
    // none of the flip rules' image classes is on the preview image
    for (const cls of ['unitimg', 'siteimg', 'groundimg', 'auraimg']) expect(img!.classList.contains(cls)).toBe(false)
  })

  it('turning it on mid-game updates the board live', () => {
    const { h } = mount(false)
    setSetting('flipOpponentCards', true)
    h.rerender()
    expect(h.container.querySelector('.board')!.classList.contains('opp-flip')).toBe(true)
  })
})
