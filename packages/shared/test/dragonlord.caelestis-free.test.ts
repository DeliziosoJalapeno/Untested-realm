// Dragonlord gaining Caelestis's abilities (reported: "my dragon avatar's ability to copy the ability
// to summon a dragon for free here isn't working"). Caelestis: "Tap → the next Dragon cast to this
// location costs (0) this turn." The (0) discount lives in Caelestis's costModifier — a PASSIVE hook —
// so the Dragonlord (which gains the Dragon's abilities) must forward it, since only in-play cards
// contribute cost modifiers.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, act } from './helpers'
import { avatarOf, effectiveCost, getCard, emitUnitEnters, type GameState } from '../src'

describe('Dragonlord as Caelestis — "next Dragon here is free"', () => {
  function setup() {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const av = avatarOf(g, 0); av.name = 'Dragonlord'; av.x = 2; av.y = 2; av.region = 'surface'
    av.tapped = false; av.enteredTurn = -1
    g.flow = { ...(g.flow ?? {}), dragonForm: { player: 0, turn: g.turn, name: 'Caelestis' } } as any
    return { g, av }
  }

  it('makes a Dragon cast to the avatar’s location cost 0 (but not one cast elsewhere)', () => {
    const { g, av } = setup()
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'roost' }) // Caelestis's granted ability

    const dragon = 'East-West Dragon'
    expect(effectiveCost(g, 0, dragon, av, { x: 2, y: 2 }), 'free at the roost location').toBe(0)
    expect(effectiveCost(g, 0, dragon, av, { x: 4, y: 4 }), 'full price elsewhere').toBe(getCard(dragon).cost ?? 0)
  })

  it('only the NEXT Dragon is free — the bookkeeping (onUnitEnters) is forwarded too', () => {
    const { g, av } = setup()
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'roost' })

    // a first Dragon arrives at the roost location → consumes the free-cast
    const first = summonCard(g, 0, 'East-West Dragon', 2, 2); first.enteredTurn = g.turn
    emitUnitEnters(g, first)

    expect(effectiveCost(g, 0, 'East-West Dragon', av, { x: 2, y: 2 }), 'the second Dragon pays full price')
      .toBe(getCard('East-West Dragon').cost ?? 0)
  })
})
