// Fringe-but-vital interaction. Flipping an Imposter masked as Druid (Druid's "Summon Bruin, flip
// this card") leaves the Imposter's owner with no Avatar → they lose (FAQ). We deliberately DON'T
// offer that self-defeat for your own Imposter. BUT via Courtesan Thaïs ("during their next turn,
// each player is controlled by the previous one") you pilot the opponent's Imposter: masking it as
// Druid (from their collection) and flipping it makes THEM lose — a real win. So the flip must be
// offered while piloted, and a blanked avatar must actually lose the game.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { getScript, makeCtx, checkStateBased, avatarOf, isBlanked, type GameState } from '../src'
import '../src/cards/scripts/index'

function maskImposterAsDruid(g: GameState, seat: 0 | 1) {
  const av = avatarOf(g, seat); av.name = 'Imposter'
  g.flow = g.flow ?? {}
  ;(g.flow as any).imposterMask = { ...((g.flow as any).imposterMask ?? {}), [seat]: 'Druid' }
  return av
}
const grantedFlip = (g: GameState, av: any) =>
  getScript('Imposter')!.grantsAbilities!(g, av.id, av).some((a) => a.flipsSelf)

describe('Imposter-as-Druid self-flip: suppressed for yourself, offered when piloted (Thaïs)', () => {
  it('is NOT offered on your own turn (flipping would just make you lose)', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const av = maskImposterAsDruid(g, 0) // your own avatar, your own turn
    expect(grantedFlip(g, av), 'no self-defeat button for your own Imposter').toBe(false)
  })

  it('IS offered while the opponent pilots this seat via Courtesan Thaïs', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const av = maskImposterAsDruid(g, 1)          // player 1's Imposter…
    ;(g.flow as any).thaisActive = 1; g.activePlayer = 1 // …player 1's turn, piloted by player 0
    expect(grantedFlip(g, av), 'the pilot may flip the enemy Imposter').toBe(true)
  })
})

describe('a blanked avatar loses the game', () => {
  it('checkStateBased ends the game when an Imposter avatar is flipped to a faceless husk', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const av = avatarOf(g, 1); av.name = 'Imposter'; av.flipped = true
    expect(isBlanked(av), 'a flipped Imposter has no back → blanked').toBe(true)
    checkStateBased(g)
    expect(g.winner, 'the player with no Avatar loses').toBe(0)
    expect(g.phase).toBe('over')
  })

  it('the full Thaïs win: the pilot flips the enemy masked Imposter and wins the duel', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const av = maskImposterAsDruid(g, 1)
    ;(g.flow as any).thaisActive = 1; g.activePlayer = 1
    const flip = getScript('Imposter')!.grantsAbilities!(g, av.id, av).find((a) => a.flipsSelf)!
    // the pilot activates it; Thaïs attributes the action to the controlled owner (seat 1)
    flip.effect(makeCtx(g, av.id, 1, []))
    checkStateBased(g)
    expect(av.flipped, 'the enemy Imposter flipped').toBe(true)
    expect(g.winner, 'seat 1 has no Avatar → the Thaïs pilot (seat 0) wins').toBe(0)
    expect(g.phase).toBe('over')
  })
})
