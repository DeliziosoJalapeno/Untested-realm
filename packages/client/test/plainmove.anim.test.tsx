// Repro: a PLAIN multi-step move (into empty sites, no attack) must animate the walk just like a
// move-and-attack does. The engine records flow.moveAnim for any 2+ step move; the client must pick it up.
import { describe, it, expect, afterEach } from 'vitest'
import { board, place, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function courserBoard(): { g: GameState; fcId: string } {
  const g = board(); g.prompts = []
  for (const [x, y] of [[2, 0], [2, 1], [2, 2]] as const) place(g, 0, 'Active Volcano', x, y)
  const fcId = usummon(g, 0, 'Fine Courser', 2, 2) // Movement +1 → 2 steps
  g.units[fcId].enteredTurn = -5; g.units[fcId].tapped = false
  for (const u of Object.values(g.units)) if (u.controller === 1) delete g.units[u.id]
  return { g, fcId }
}

describe('plain move animation', () => {
  it('a straight 2-step move into empty sites records a walk and animates it', () => {
    const { g, fcId } = courserBoard()
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${fcId}"]`) as HTMLElement)
    h.click(h.container.querySelector(`.square[data-sq="2,0"]`) as HTMLElement)
    // the engine recorded the multi-step walk...
    expect((h.state.flow as any)?.moveAnim?.at(-1)?.unitId, 'engine recorded the walk').toBe(fcId)
    // ...and the client animates it as a self-contained walk GHOST at the START square (idx 0), while the
    // real chip is HIDDEN (the ghost is what walks — so it works even if the unit dies on arrival).
    expect(h.container.querySelector(`.square[data-sq="2,2"] .unit.anim-move`), 'a walk ghost renders at the START square').toBeTruthy()
    expect(h.container.querySelector(`[data-unit="${fcId}"]`), 'the real chip is hidden while the ghost walks').toBeFalsy()
  })
})
