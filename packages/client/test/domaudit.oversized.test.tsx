// Oversized (2x2) units must be able to ATTACK any enemy in a square their FOOTPRINT
// covers — not just the bottom-left anchor. Previously the client anchored attack/move
// detection on (x,y), so enemies in the other three squares were unreachable.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase, usummon } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'
import type { GameState, UnitState } from '@sorcery/shared'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

/** put a plain site on every empty square so a 2x2 body can shift in any direction. */
function fillSites(g: GameState) {
  for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) {
    if (Object.values(g.sites).some((s) => s.x === x && s.y === y)) continue
    const cardId = `sc${g.nextId++}`; ;(g.cards as any)[cardId] = { id: cardId, name: 'Spire', owner: 0 }
    const id = `s${g.nextId++}`; ;(g.sites as any)[id] = { id, cardId, name: 'Spire', owner: 0, controller: 0, x, y, tapped: false, isRubble: false }
  }
}

describe('oversized (2x2) unit attacks across its whole footprint', () => {
  it('offers ⚔ Attack on an enemy standing in a non-anchor square of the 2x2', () => {
    const g = sweepBoardBase()
    // a p0 2x2 body anchored at (1,1) → occupies (1,1),(2,1),(1,2),(2,2). sweepBoardBase
    // already stands a p1 Foot Soldier on (2,1) and (1,2) — both INSIDE the footprint.
    const aid = usummon(g, 0, 'Foot Soldier', 1, 1)
    ;(g.units[aid] as UnitState).size = '2x2'
    g.units[aid].enteredTurn = g.turn - 2 // not summoning-sick
    const foe = (Object.values(g.units) as UnitState[]).find((u) => u.controller === 1 && u.x === 2 && u.y === 1)!
    expect(foe, 'enemy in the footprint exists').toBeTruthy()

    const h = new GameHarness(g).mount(); active = h
    const root = h.container

    // select the 2x2 unit (it renders as a single overlay chip), then click the enemy
    h.click(root.querySelector(`[data-unit="${aid}"]`) as HTMLElement); h.rerender()
    h.click(root.querySelector(`[data-unit="${foe.id}"]`) as HTMLElement); h.rerender()

    const banner = root.querySelector('[data-modebanner="moveChoice"]')
    expect(banner, 'move/attack chooser shown for the footprint enemy').toBeTruthy()
    const attackBtn = [...banner!.querySelectorAll('[data-choice]')].find((b) => /Attack/i.test(b.textContent ?? '')) as HTMLElement
    expect(attackBtn, 'an ⚔ Attack option is offered').toBeTruthy()

    // resolving it strikes the enemy (engine accepts — no drift)
    const drift0 = h.drifts.length
    h.click(attackBtn); h.rerender()
    expect(h.drifts.length, 'no engine drift on the footprint attack').toBe(drift0)
  })

  it('renders a move marker for EVERY reachable 2x2 shift (incl. anchors inside the current body)', () => {
    const g = sweepBoardBase(); fillSites(g)
    const aid = usummon(g, 0, 'Foot Soldier', 1, 1)
    ;(g.units[aid] as UnitState).size = '2x2'
    g.units[aid].enteredTurn = g.turn - 2
    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    h.click(root.querySelector(`[data-unit="${aid}"]`) as HTMLElement); h.rerender()
    // more than one anchor marker (the old `!here` filter hid east/north shifts,
    // leaving essentially one) — clicking any is a valid whole-block shift.
    const markers = root.querySelectorAll('[data-area-anchor="1"]')
    expect(markers.length, 'multiple 2x2 shift markers render').toBeGreaterThan(1)
  })
})
