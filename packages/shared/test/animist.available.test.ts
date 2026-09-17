// Animist's "Cast a magic as a Spirit" is only offered when there's actually a magic to cast — so
// activating it can never be a recorded no-op (the engine rejects it; the GUI hides the button; the
// search bot won't enumerate it).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { canActivate, isTentativeActivate, applyJudge, type GameState } from '../src'

describe('Animist ability availability', () => {
  it('is unavailable with no magic in hand, available with one', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'summonUnit', name: 'Animist', player: 0, x: 2, y: 2, region: 'surface', noGenesis: true })
    const animist = Object.values(g.units).find((u) => u.name === 'Animist')!
    applyJudge(g, 0, { k: 'summonSick', unitId: animist.id, on: false }) // free (no-tap) ability, but clear sickness anyway

    g.players[0].hand = [] // no magics
    expect(canActivate(g as GameState, 0, animist.id, 'animate')).not.toBeNull() // rejected — nothing to cast

    applyJudge(g, 0, { k: 'addToHand', name: 'Immolation', player: 0 })
    expect(canActivate(g as GameState, 0, animist.id, 'animate')).toBeNull() // now usable
  })

  it('the animate ability is flagged tentativePlay (server holds it until it casts)', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'summonUnit', name: 'Animist', player: 0, x: 2, y: 2, region: 'surface', noGenesis: true })
    const animist = Object.values(g.units).find((u) => u.name === 'Animist')!
    expect(isTentativeActivate(g as GameState, { t: 'activate', sourceId: animist.id, ability: 'animate' })).toBe(true)
    // a plain ability (or a non-activate action) is not tentative
    expect(isTentativeActivate(g as GameState, { t: 'endTurn' })).toBe(false)
  })
})
