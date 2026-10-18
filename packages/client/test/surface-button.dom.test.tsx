// The unit panel's "🏔 Surface" button is offered only to a minion that can actually take that step.
// Awakened Mummies are summoned "burrowed safely" — they lack Burrowing, so they never get the button
// (they surface only through their own ambush); a real burrower (Entombed) does.
import { describe, it, expect, afterEach } from 'vitest'
import { board, usummon } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function surfaceButtonFor(name: string): Element | null {
  const g = board() // p0 sites at (2,0),(2,1),(3,1),(1,1); p0's turn
  const id = usummon(g, 0, name, 2, 1)
  const u = g.units[id]; u.region = 'underground'; u.enteredTurn = -5; u.tapped = false
  const h = new GameHarness(g).mount(); active = h
  if (!h.container.querySelector(`[data-unit="${id}"]`)) h.click(h.container.querySelector('[title="Toggle subsurface view (S)"]') as HTMLElement)
  h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)
  return h.container.querySelector(`[data-vmove="surface"][data-source="${id}"]`)
}

describe('Surface button', () => {
  it('a Burrowing minion underground gets it', () => {
    expect(surfaceButtonFor('Entombed')).not.toBeNull()
  })
  it('Awakened Mummies (burrowed safely, no Burrowing) do not', () => {
    expect(surfaceButtonFor('Awakened Mummies')).toBeNull()
  })
})
