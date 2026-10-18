// Town Priest under a Corruptor may target ITSELF with its Genesis (it's Evil, and adjacent to its own
// square). Genesis targets are picked before the minion exists, so it can't be clicked — the genesis banner
// offers an "itself" button instead, only when that pick is legal.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { board, inject } from './domaudit'
import type { GameState } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function priestBoard(corruptor: boolean): GameState {
  const g = board()
  if (corruptor) {
    const av = g.units[g.players[0].avatarUnitId]
    av.name = 'Corruptor'; g.cards[av.cardId].name = 'Corruptor'
  }
  inject(g, 0, 'Town Priest')
  return g
}
function openGenesisBanner(h: GameHarness): Element | null {
  h.click(h.container.querySelector('[data-card="Town Priest"]')!)
  h.rerender()
  h.click(h.container.querySelector('[data-clickable="1"][data-sq]')!)
  h.rerender()
  return h.container.querySelector('[data-modebanner="genesisTargets"]')
}

describe('Town Priest: "itself" as its Genesis target', () => {
  it('under a Corruptor the banner offers "itself", and picking it returns the Priest to hand', () => {
    const h = new GameHarness(priestBoard(true)).mount(); active = h
    const banner = openGenesisBanner(h)
    const self = banner?.querySelector('[data-self="1"]') as HTMLButtonElement | null
    expect(self, 'an "itself" button').not.toBeNull()
    h.click(self!)
    h.rerender()
    expect(Object.values(h.state.units).some((u) => u.name === 'Town Priest'), 'the Priest left the realm').toBe(false)
    expect(h.state.players[0].hand.some((id) => h.state.cards[id]?.name === 'Town Priest'), 'back in hand').toBe(true)
  })

  it('without a Corruptor there is no "itself" button (it is not Evil)', () => {
    const h = new GameHarness(priestBoard(false)).mount(); active = h
    const banner = openGenesisBanner(h)
    expect(banner, 'the genesis banner still opens').not.toBeNull()
    expect(banner!.querySelector('[data-self="1"]')).toBeNull()
  })
})
