// The view exposes, for the viewing player's OWN hand, the unconditional casting-cost change of each
// spell vs its printed cost (effective − printed, no cast location). The client badges it "+2 ◆" etc.
// Court of Equity: "Elite spells cost an additional (1), Uniques (2)."
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { viewFor, type GameState } from '../src'
import '../src/cards/scripts/index'

function inHand(g: any, player: number, name: string): string {
  const id = `h${g.nextId++}`; g.cards[id] = { id, name, owner: player }; g.players[player].hand.push(id); return id
}

describe('hand cost-delta (Court of Equity)', () => {
  it('reports +2 for a Unique, +1 for an Elite, nothing for an Ordinary spell', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Court of Equity', 2, 2)
    const uni = inHand(g, 0, 'Armageddon')       // Unique
    const elite = inHand(g, 0, 'Ball Lightning')  // Elite
    const ord = inHand(g, 0, 'Arc Lightning')     // Ordinary
    const hcd = viewFor(g as GameState, 0).players[0].handCostDelta
    expect(hcd[uni], 'Unique costs +2').toBe(2)
    expect(hcd[elite], 'Elite costs +1').toBe(1)
    expect(hcd[ord], 'Ordinary is unaffected → no entry').toBeUndefined()
  })

  it('with no cost-changing effect in play, there are no deltas', () => {
    const g: any = newGame(); keepBoth(g)
    inHand(g, 0, 'Armageddon')
    const hcd = viewFor(g as GameState, 0).players[0].handCostDelta
    expect(Object.keys(hcd).length).toBe(0)
  })

  it('the opponent never sees your hand cost deltas', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Court of Equity', 2, 2)
    inHand(g, 0, 'Armageddon')
    const asOpp = viewFor(g as GameState, 1).players[0].handCostDelta
    expect(Object.keys(asOpp).length, 'redacted for the opponent').toBe(0)
  })
})
