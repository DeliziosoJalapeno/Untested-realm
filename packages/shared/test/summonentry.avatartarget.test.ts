import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { validateSummonAt, validateTarget } from '../src/engine/casting'
import { getScript } from '../src/cards/scripts/registry'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

// Gnome Hollows: "Units with 3 or more power can't enter this site" — this must block SUMMONING there
// too, not only movement.
describe('Gnome Hollows blocks summoning 3+ power minions', () => {
  it('a 3-power minion cannot be summoned onto Gnome Hollows; a weaker one can', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Gnome Hollows', 2, 2)
    expect(validateSummonAt(g, 0, 'Stygian Archers', { x: 2, y: 2 }), '3/3 is refused').toMatch(/can't be summoned/i)
    expect(validateSummonAt(g, 0, 'Bone Jumble', { x: 2, y: 2 }), '1/1 is fine').toBeNull()
  })
})

// A card that says "an ally" (not "an allied minion") may target the Avatar.
describe("Leap Attack targets an ally including the Avatar", () => {
  it('the Avatar is a legal Leap Attack target', () => {
    const g: GameState = newGame(); keepBoth(g)
    const av = avatarOf(g, 0)
    const spec = getScript('Leap Attack')!.targets![0]
    expect(validateTarget(g, spec, { unit: av.id }, av, 0), 'the Avatar is an "ally"').toBeNull()
  })
})
