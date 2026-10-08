// A SILENCED artifact loses its text — a Magellan Globe silenced by Acid Rain no longer connects the
// opposite edges of the realm.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { edgesConnected, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('a silenced Magellan Globe stops connecting the edges', () => {
  it('edgesConnected is true in play, false once Acid Rain silences it', () => {
    const g = newGame() as GameState; keepBoth(g)
    g.cards['cg'] = { id: 'cg', name: 'Magellan Globe', owner: 0 } as any
    g.artifacts['aglobe'] = { id: 'aglobe', cardId: 'cg', name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
    expect(edgesConnected(g), 'a live Globe connects the edges').toBe(true)

    // Acid Rain covers the Globe's square → the artifact is silenced
    g.cards['ca'] = { id: 'ca', name: 'Acid Rain', owner: 1 } as any
    g.auras['racid'] = { id: 'racid', cardId: 'ca', name: 'Acid Rain', controller: 1, squares: [{ x: 2, y: 2 }] } as any
    expect(edgesConnected(g), 'a silenced Globe connects nothing').toBe(false)
  })
})
