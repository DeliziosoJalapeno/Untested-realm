// A chooseSquare prompt flagged `area2x2` (Earthquake, Corpse Explosion) must render a
// clickable intersection marker for EVERY offered anchor — including 2x2 areas whose cells
// are mostly VOID (the engine offers any anchor covering ≥1 site).

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'
import type { GameState } from '@sorcery/shared'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

/** clear all sites so the offered anchors sit over VOID squares. */
function clearSites(g: GameState) { for (const id of Object.keys(g.sites)) delete (g.sites as any)[id] }

describe('area2x2 picker renders markers over void areas', () => {
  it('renders a clickable anchor marker for each offered 2x2 area (incl. void-covered ones)', () => {
    const g = sweepBoardBase(); clearSites(g)
    // one lone site so the areas are almost all void, then an area2x2 prompt offering
    // three anchors — two of them cover only void cells.
    const cardId = `sc${g.nextId++}`; (g.cards as any)[cardId] = { id: cardId, name: 'Spire', owner: 0 }
    ;(g.sites as any)[`s${g.nextId++}`] = { id: `s${g.nextId}`, cardId, name: 'Spire', owner: 0, controller: 0, x: 2, y: 2, tapped: false, isRubble: false }
    const anchors = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 0 }]
    g.prompts.push({ id: 'a2', player: 0, kind: 'chooseSquare', title: 'pick a 2×2 area', data: { squares: anchors, area2x2: true }, cont: '', ctx: {} } as any)

    const h = new GameHarness(g).mount(); active = h
    const markers = h.container.querySelectorAll('[data-area-anchor="1"]')
    expect(markers.length, 'one clickable marker per offered anchor (void areas included)').toBe(3)

    // the void-covered (0,0) anchor still gets its own clickable marker
    const m00 = h.container.querySelector('[data-area-anchor="1"][data-sq="0,0"]') as HTMLElement
    expect(m00, 'the void-covered (0,0) area has a marker').toBeTruthy()
    // (ENGINE acceptance of a void-covered 2x2 selection is covered by the shared test
    // corpseexplosion.void.test.ts; this DOM test only asserts the markers render — a
    // synthetic prompt with an empty `cont` can't be meaningfully "applied" here.)
  })
})
