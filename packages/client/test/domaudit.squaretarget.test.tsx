// Regression: a LOCATION/square-target effect (Sparkmage's spark, Ancient Dragon's
// breath…) must be aimable at a square even when a unit stands on it — clicking the
// unit chip should target the LOCATION beneath it, not swallow the click. clickUnit
// previously called pickTarget(unit.id) for a `what:'square'` spec, sending an
// unparseable unit id as a square target; now it redirects to `sq:x,y`.

import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase, usummon } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'
import type { GameState, UnitState } from '@sorcery/shared'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

/** put a plain site on every empty square so every location is a valid 'nearby' target. */
function fillSites(g: GameState) {
  for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) {
    if (Object.values(g.sites).some((s) => s.x === x && s.y === y)) continue
    const cardId = `sc${g.nextId++}`; ;(g.cards as any)[cardId] = { id: cardId, name: 'Spire', owner: 0 }
    const id = `s${g.nextId++}`; ;(g.sites as any)[id] = { id, cardId, name: 'Spire', owner: 0, controller: 0, x, y, tapped: false, isRubble: false }
  }
}

describe("square/location target — clicking a unit on the target square aims the location", () => {
  it("Sparkmage's spark hits an enemy by clicking the enemy standing on the target location", () => {
    const g = sweepBoardBase(); fillSites(g)
    // Sparkmage adjacent to the enemy that sweepBoardBase stands at (2,1)
    const spark = usummon(g, 0, 'Sparkmage', 2, 2)
    ;(g.units[spark] as UnitState).enteredTurn = g.turn - 3 // not summoning-sick
    const foe = (Object.values(g.units) as UnitState[]).find((u) => u.controller === 1 && u.x === 2 && u.y === 1)!
    expect(foe, 'enemy on the target square exists').toBeTruthy()
    // Air thresholds "cast this turn" so the spark actually deals damage
    ;(g.flow as any) = { ...(g.flow ?? {}), airCastSum: { 0: 3 } }

    const h = new GameHarness(g).mount(); active = h
    const root = h.container

    // select the Sparkmage, open its spark ability (→ square-target mode)
    h.click(root.querySelector(`[data-unit="${spark}"]`) as HTMLElement); h.rerender()
    const sparkBtn = root.querySelector(`[data-ability="spark"][data-source="${spark}"]`) as HTMLButtonElement
    expect(sparkBtn, 'spark ability is offered').toBeTruthy()
    expect(sparkBtn.disabled, 'spark is activatable').toBe(false)
    h.click(sparkBtn); h.rerender()

    // now click the ENEMY sitting on the target location — this must aim the square
    const drift0 = h.drifts.length
    h.click(root.querySelector(`[data-unit="${foe.id}"]`) as HTMLElement); h.rerender()

    expect(h.drifts.length, 'no engine drift — a valid square target was sent').toBe(drift0)
    const stillFull = g.units[foe.id] && g.units[foe.id].damage === 0
    expect(stillFull, 'the enemy on that location was struck (damaged or destroyed)').toBeFalsy()
    expect(root.querySelector('[data-modebanner="abilityTargets"]'), 'targeting resolved').toBeNull()
  })
})
