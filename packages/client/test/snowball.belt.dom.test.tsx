// The direction picker draws a conveyor chevron on each reachable lane cell (the engine hands the
// prompt `data.dirs` = per-direction site-lanes). Chevrons start one square past the source, point
// the way the effect travels, and the hovered direction's lane lights up (.active).
import { describe, it, expect, afterEach } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { board, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function snowballPromptBoard(): GameState {
  const g = board() as any
  g.prompts = [{
    id: 'snow1', kind: 'chooseOption', player: 0, title: 'Snowball rolls in which direction?',
    data: {
      options: ['n', 's', 'e', 'w'],
      from: { x: 1, y: 1 },
      dirs: { e: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }], w: [{ x: 1, y: 1 }], n: [{ x: 1, y: 1 }], s: [{ x: 1, y: 1 }] },
    },
  }]
  return g
}

const belt = (h: GameHarness, x: number, y: number) => h.container.querySelector(`.square[data-sq="${x},${y}"] .belt`)

describe('direction-picker conveyor preview', () => {
  it('draws chevrons along the reachable lane (past the source), pointing the right way', () => {
    const h = new GameHarness(snowballPromptBoard()).mount(); active = h
    expect(belt(h, 2, 1), 'east lane cell has a chevron').toBeTruthy()
    expect(belt(h, 3, 1), 'the farthest east cell too').toBeTruthy()
    expect(h.container.querySelector('.square[data-sq="2,1"] .belt:not(.belt-origin)')?.className, 'points right (east, unflipped board)').toContain('belt-right')
    expect(h.container.querySelector('.square[data-sq="1,1"] .belt:not(.belt-origin)'), 'no LANE chevron on the source').toBeFalsy()
    expect(h.container.querySelectorAll('.square[data-sq="1,1"] .belt.belt-origin').length, '4 arrows radiate from the starting site').toBe(4)
    expect(belt(h, 2, 2), 'a square off the lanes has no chevron').toBeFalsy()
  })

  it('hovering a direction option lights up that lane', () => {
    const h = new GameHarness(snowballPromptBoard()).mount(); active = h
    const eBtn = h.container.querySelector('[data-promptbox="chooseOption"] [data-choice="e"]') as HTMLElement
    expect(eBtn, 'the east compass button is shown').toBeTruthy()
    expect(h.container.querySelector('.square[data-sq="2,1"] .belt.active'), 'inactive before hover').toBeFalsy()
    act(() => { fireEvent.mouseEnter(eBtn) })
    expect(h.container.querySelector('.square[data-sq="2,1"] .belt.active'), 'east lane active on hover').toBeTruthy()
    act(() => { fireEvent.mouseLeave(eBtn) })
    expect(h.container.querySelector('.square[data-sq="2,1"] .belt.active'), 'inactive again on mouse-leave').toBeFalsy()
  })

  it('shoot mode: a Ranged unit shows an element-coloured belt out to its range', () => {
    const g = board() as any
    const id = usummon(g, 0, 'Stygian Archers', 2, 1) // an Air unit
    g.units[id].enteredTurn = -5; g.units[id].tapped = false
    g.units[id].modifiers = [{ kind: 'keyword', keyword: 'ranged 2' }]
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)              // select the unit
    h.click(h.container.querySelector(`[data-ability="ranged"][data-source="${id}"]`) as HTMLElement) // Shoot → shoot mode

    const east = belt(h, 3, 1) as HTMLElement
    expect(east, 'east lane cell (range 1)').toBeTruthy()
    expect(belt(h, 1, 1), 'west lane cell too').toBeTruthy()
    expect(h.container.querySelectorAll('.square[data-sq="2,1"] .belt.belt-origin').length, '4 arrows on the shooter’s square').toBe(4)
    expect(east.getAttribute('style') || '', 'coloured by the Air element (#ffe04a)').toContain('ffe04a')
  })
})
