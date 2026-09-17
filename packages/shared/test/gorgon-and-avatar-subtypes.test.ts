// Two rulings:
//  • Stone-gaze Gorgons "at ADJACENT locations" includes the Gorgons' OWN square (adjacent = own + 4
//    orthogonal), so a minion sharing its square is disabled — but never the Gorgons itself or an avatar.
//  • An Avatar KEEPS its printed subtype: a Mephistopheles Avatar is still a Demon (FAQ 1953).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { getScript, avatarOf, effSubtypes, hasSubtype, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Stone-gaze Gorgons disable minions at their own location too', () => {
  it('disables an "other minion" on its own square and orthogonally adjacent, not far ones or avatars', () => {
    const g = newGame() as GameState; keepBoth(g)
    const gorgon = summonCard(g, 0, 'Stone-gaze Gorgons', 2, 2); gorgon.enteredTurn = -1
    const same = summonCard(g, 1, 'Bone Jumble', 2, 2); same.enteredTurn = -1  // co-located enemy minion
    const adj = summonCard(g, 1, 'Bone Jumble', 2, 1); adj.enteredTurn = -1     // orthogonally adjacent
    const far = summonCard(g, 1, 'Bone Jumble', 0, 0); far.enteredTurn = -1
    const f = getScript('Stone-gaze Gorgons')!.disablesOther!

    expect(f(g, gorgon.id, same), 'a minion on the Gorgons’ own square is disabled').toBe(true)
    expect(f(g, gorgon.id, adj), 'an orthogonally adjacent minion is disabled').toBe(true)
    expect(f(g, gorgon.id, far), 'a distant minion is not').toBe(false)
    expect(f(g, gorgon.id, gorgon), 'never the Gorgons itself').toBe(false)

    const foeAv = avatarOf(g, 1); foeAv.x = 2; foeAv.y = 2; foeAv.region = 'surface'
    expect(f(g, gorgon.id, foeAv), 'an avatar sharing the square is NOT a minion → not disabled').toBe(false)
  })
})

describe('an Avatar keeps its printed subtype', () => {
  it('a Mephistopheles Avatar is still a Demon (FAQ 1953)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const av = avatarOf(g, 0); av.name = 'Mephistopheles'; g.cards[av.cardId].name = 'Mephistopheles'
    expect(effSubtypes(g, av), 'the Demon Avatar keeps its subtype').toContain('Demon')
    expect(hasSubtype(g, av, 'Demon'), 'a Demon for subtype-gated effects (Fallen Angel etc.)').toBe(true)
  })

  it('a plain Avatar (no printed subtype) still has none', () => {
    const g = newGame() as GameState; keepBoth(g)
    const av = avatarOf(g, 0)
    expect(effSubtypes(g, av), 'ordinary avatars have no minion subtype').toEqual([])
  })
})
