import { describe, it, expect } from 'vitest'
import { newGame, placeSite } from './helpers'
import { validateSummonAt } from '../src'

// Hellmouth: "Evil minions nearby or being summoned nearby have Burrowing."
// The "being summoned nearby" clause must make an UNDERGROUND summon legal for an
// Evil minion (e.g. Vile Imp, a Demon) on a land site near Hellmouth — even though
// the printed card has no Burrowing of its own.
describe('Hellmouth grants Burrowing to Evil minions being summoned nearby', () => {
  it('Vile Imp (Demon) can be summoned UNDERGROUND on a land site nearby Hellmouth', () => {
    const g = newGame()
    placeSite(g, 0, 'Hellmouth', 2, 2)
    placeSite(g, 0, 'Spire', 2, 1) // land site, adjacent (nearby) to Hellmouth
    expect(validateSummonAt(g, 0, 'Vile Imp', { x: 2, y: 1, region: 'underground' })).toBeNull()
    expect(validateSummonAt(g, 0, 'Vile Imp', { x: 2, y: 1, region: 'surface' })).toBeNull()
  })

  it('a NON-Evil minion nearby Hellmouth is still blocked underground (no grant)', () => {
    const g = newGame()
    placeSite(g, 0, 'Hellmouth', 2, 2)
    placeSite(g, 0, 'Spire', 2, 1)
    expect(validateSummonAt(g, 0, 'Foot Soldier', { x: 2, y: 1, region: 'underground' })).not.toBeNull()
  })

  it('an Evil minion NOT nearby Hellmouth is still blocked underground', () => {
    const g = newGame()
    placeSite(g, 0, 'Hellmouth', 2, 2)
    placeSite(g, 0, 'Spire', 0, 3) // far from Hellmouth — not nearby
    expect(validateSummonAt(g, 0, 'Vile Imp', { x: 0, y: 3, region: 'underground' })).not.toBeNull()
  })
})
