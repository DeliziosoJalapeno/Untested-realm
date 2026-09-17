// The 2x2 intersection selector (the same markers auras use) drives TWO placements:
//   • Earthquake's two-by-two AREA pick (a chooseSquare prompt flagged area2x2), and
//   • oversized (2x2) minion summoning (Mountain Giant occupies four squares).
// Both render an intersection marker per legal anchor (data-area-anchor) instead of
// single-square highlights.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { inject as cinject, sweepBoardBase } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'
import type { GameState } from '@sorcery/shared'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function ready(g: GameState) {
  g.players[0].mana += 20
  g.flow = g.flow ?? {}
  ;(g.flow as any).noThreshold = { 0: g.turn }
}

describe('2x2 intersection selector', () => {
  it('Earthquake: the AREA pick renders intersection markers; clicking one selects the area', () => {
    const g = sweepBoardBase()
    ready(g)
    cinject(g, 0, 'Earthquake')
    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    h.click(root.querySelector('[data-hand][data-card="Earthquake"]') as HTMLElement); h.rerender()
    // the engine is now asking for the 2x2 area — rendered as markers, not hl-place squares
    const markers = root.querySelectorAll('[data-area-anchor="1"]')
    expect(markers.length, 'area markers rendered').toBeGreaterThan(0)
    expect(root.querySelectorAll('.square.hl-place').length, 'no square highlights for the area pick').toBe(0)
    const drift0 = h.drifts.length
    h.click(markers[0] as HTMLElement); h.rerender()
    expect(h.drifts.length, 'no drift on area pick').toBe(drift0)
    // area chosen → the rearrange panel appears (client authors a permutation, engine applies it)
    expect(root.querySelector('[data-promptbox="sitePermutation"]'), 'rearrange panel shown').toBeTruthy()
    // confirm without rearranging → the cast resolves (burrow step) with no leftover prompt
    const confirm = root.querySelector('[data-promptbox="sitePermutation"] [data-confirm="1"]') as HTMLElement
    h.click(confirm); h.rerender()
    expect(h.state.prompts.length, 'cast fully resolved').toBe(0)
  })

  it('Mountain Giant: oversized minion is placed via intersection markers', () => {
    const g = sweepBoardBase()
    ready(g)
    cinject(g, 0, 'Mountain Giant')
    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    h.click(root.querySelector('[data-hand][data-card="Mountain Giant"]') as HTMLElement); h.rerender()
    const markers = root.querySelectorAll('[data-area-anchor="1"]')
    expect(markers.length, 'oversized placement markers rendered').toBeGreaterThan(0)
    const drift0 = h.drifts.length
    h.click(markers[0] as HTMLElement); h.rerender()
    expect(h.drifts.length, 'no drift placing the oversized minion').toBe(drift0)
    const giant = Object.values(g.units).find((u) => u.name === 'Mountain Giant')
    expect(giant, 'Mountain Giant entered the realm').toBeTruthy()
    expect(giant!.size, 'occupies a 2x2').toBe('2x2')
  })
})
