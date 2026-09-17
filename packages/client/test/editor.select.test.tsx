// The Editor (internal "judge") is a tabletop escape hatch for resolving card text by
// hand. It must let you SELECT any unit — either player's, on any turn — so its tools can
// operate on it. Normal play only ever selects your OWN unit on YOUR turn, so enemy-unit
// selection is reachable ONLY through the editor branch (which carries no owner/turn gate).
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function editorToggle(root: HTMLElement): HTMLButtonElement {
  const btn = [...root.querySelectorAll('button')].find(
    (b) => /Editor/.test(b.textContent || '') && !/asked|🔒/.test(b.textContent || ''),
  )
  if (!btn) throw new Error('Editor toggle button not found')
  return btn as HTMLButtonElement
}

describe('Editor lets you select any unit (either player, any turn)', () => {
  it('with the Editor open, clicking an ENEMY unit selects it; with it closed, it does not', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const enemy = Object.values(g.units as any).find(
      (u: any) => u.controller !== me && !u.isAvatar,
    ) as any
    expect(enemy, 'need an enemy unit').toBeTruthy()

    const h = new GameHarness(g).mount(); active = h
    const chip = () => h.container.querySelector(`.unit[data-unit="${enemy.id}"]`) as HTMLElement
    expect(chip(), 'the enemy chip rendered').toBeTruthy()
    expect(chip().classList.contains('theirs'), 'it is an enemy unit').toBe(true)

    // CONTROL: editor closed → clicking an enemy unit does NOT select it (normal play never
    // selects a unit you do not control — you can only target it as an attack).
    h.click(chip()); h.rerender()
    expect(chip().classList.contains('selected'), 'enemy not selectable in normal play').toBe(false)

    // open the Editor, then click the same enemy unit → now it selects for editing
    h.click(editorToggle(h.container)); h.rerender()
    h.click(chip()); h.rerender()
    expect(chip().classList.contains('selected'), 'enemy selectable with the Editor open').toBe(true)

    // the Editor panel now targets that unit (its per-unit tools render)
    expect(h.container.querySelector('.judgepanel'), 'the editor panel is open').toBeTruthy()

    // clicking it again toggles the selection back off
    h.click(chip()); h.rerender()
    expect(chip().classList.contains('selected'), 'clicking again deselects').toBe(false)
  })
})
