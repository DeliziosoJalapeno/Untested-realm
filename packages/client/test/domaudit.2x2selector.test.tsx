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

/** ensure a controlled site sits at (x,y) (engine-valid s-prefix id) */
function ensureSite(g: any, x: number, y: number) {
  if (Object.values(g.sites).some((s: any) => s.x === x && s.y === y)) return
  const cardId = `ceq${g.nextId++}`
  const id = `s${g.nextId++}`
  g.cards[cardId] = { id: cardId, name: 'Rustic Village', owner: 0 }
  g.sites[id] = { id, cardId, name: 'Rustic Village', owner: 0, controller: 0, x, y, tapped: false, isRubble: false }
}
const hasSite = (g: any, x: number, y: number) => Object.values(g.sites).some((s: any) => s.x === x && s.y === y && !s.isRubble)
const fullBlock = (g: any, ax: number, ay: number) => hasSite(g, ax, ay) && hasSite(g, ax + 1, ay) && hasSite(g, ax, ay + 1) && hasSite(g, ax + 1, ay + 1)

describe('2x2 intersection selector', () => {
  it('Earthquake: the AREA pick renders intersection markers; clicking one selects the area', () => {
    const g = sweepBoardBase()
    ready(g)
    // Earthquake can only REARRANGE a 2x2 with no voids (arranging voids was removed), so guarantee a
    // fully-sited block to pick — picking a block that straddles a void burrows but opens no rearrange panel.
    for (const [x, y] of [[3, 2], [4, 2], [3, 3], [4, 3]] as const) ensureSite(g, x, y)
    cinject(g, 0, 'Earthquake')
    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    h.click(root.querySelector('[data-hand][data-card="Earthquake"]') as HTMLElement); h.rerender()
    // the engine is now asking for the 2x2 area — rendered as markers, not hl-place squares
    const markers = root.querySelectorAll('[data-area-anchor="1"]')
    expect(markers.length, 'area markers rendered').toBeGreaterThan(0)
    expect(root.querySelectorAll('.square.hl-place').length, 'no square highlights for the area pick').toBe(0)
    // pick an anchor whose whole 2x2 is sited — only a void-free block can be rearranged
    const marker = Array.from(markers).find((m) => {
      const [x, y] = (m as HTMLElement).getAttribute('data-sq')!.split(',').map(Number)
      return fullBlock(g, x, y)
    }) as HTMLElement
    expect(marker, 'a fully-sited 2x2 anchor is offered').toBeTruthy()
    const drift0 = h.drifts.length
    h.click(marker); h.rerender()
    expect(h.drifts.length, 'no drift on area pick').toBe(drift0)
    // a void-free area chosen → the rearrange panel appears (client authors a permutation, engine applies it)
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
