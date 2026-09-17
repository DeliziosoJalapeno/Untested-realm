import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer, injectToHand } from './helpers'
import { getCard } from '../src'
import type { GameState } from '../src'

function injectFallingStar(g: GameState, controller: 0 | 1, squares: { x: number; y: number }[]): string {
  const cardId = `fsc${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name: 'Falling Star', owner: controller }
  const id = `fsa${g.nextId++}`
  ;(g.auras as any)[id] = { id, cardId, name: 'Falling Star', controller, squares, counters: { turns: 0 } }
  return id
}

/** Remove all minion cards from a player's hand (leave sites/spells to avoid breaking game) */
function clearMinionsFromHand(g: GameState, player: 0 | 1): void {
  const p = g.players[player]
  p.hand = p.hand.filter((id) => getCard(g.cards[id]?.name ?? '')?.type !== 'Minion')
}

// FAQ1: counter added at END phase; 3rd counter fires summon immediately, then dispels
describe('Falling Star — FAQ1: counters tick on endOfTurn, not startOfTurn', () => {
  it('counter is 0 before any end-of-turn and 1 after player 0 ends first turn', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    const auraId = injectFallingStar(g, 0, [{ x: 2, y: 2 }])

    expect((g.auras as any)[auraId].counters.turns, 'starts at 0').toBe(0)

    // clear minions so the fall prompt doesn't fire prematurely
    clearMinionsFromHand(g, 0)

    // end player 0's turn — endOfTurn hook should fire, counter → 1
    act(g, 0, { t: 'endTurn' })

    // player 1 now has a draw prompt; answer it so the state is clean
    if (g.prompts[0]?.kind === 'drawDeck') answer(g, 'spellbook')

    expect((g.auras as any)[auraId]?.counters?.turns, 'counter = 1 after player 0 end-of-turn').toBe(1)
  })

  it('counter does NOT increment during player 1 end-of-turn (aura belongs to player 0)', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    const auraId = injectFallingStar(g, 0, [{ x: 2, y: 2 }])

    clearMinionsFromHand(g, 0)

    act(g, 0, { t: 'endTurn' })
    if (g.prompts[0]?.kind === 'drawDeck') answer(g, 'spellbook')

    // counter is now 1; player 1 ends their turn — Falling Star belongs to p0, no tick
    clearMinionsFromHand(g, 1)
    act(g, 1, { t: 'endTurn' })
    if (g.prompts[0]?.kind === 'drawDeck') answer(g, 'spellbook')

    expect((g.auras as any)[auraId]?.counters?.turns, 'still 1 — player 1 end-of-turn does not tick').toBe(1)
  })

  it('star falls immediately on the 3rd end-of-turn counter (dispels when hand has no minions)', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    const auraId = injectFallingStar(g, 0, [{ x: 2, y: 2 }])
    ;(g.auras as any)[auraId].counters.turns = 2

    // ensure no minions in hand so the fall prompt does not fire
    clearMinionsFromHand(g, 0)

    act(g, 0, { t: 'endTurn' })

    // aura should be dispelled immediately (no minion available to summon)
    expect((g.auras as any)[auraId], 'aura dispelled when no minion available').toBeUndefined()
  })

  it('star does NOT fall after the 2nd counter', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    const auraId = injectFallingStar(g, 0, [{ x: 2, y: 2 }])
    ;(g.auras as any)[auraId].counters.turns = 1

    clearMinionsFromHand(g, 0)

    act(g, 0, { t: 'endTurn' })

    // counter now = 2, aura still alive
    expect((g.auras as any)[auraId], 'aura survives after 2nd counter').toBeDefined()
    expect((g.auras as any)[auraId].counters.turns, 'counter = 2').toBe(2)
  })
})

// FAQ2: genesis resolves before the strikes
// FAQ3: strikes are simultaneous (both 1/1 foes die even though the star is also 1/1)
describe('Falling Star — FAQ3: strikes are simultaneous', () => {
  it('a 1/1 star striking two 1/1 foes kills both simultaneously', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    const auraId = injectFallingStar(g, 0, [{ x: 2, y: 2 }])
    ;(g.auras as any)[auraId].counters.turns = 2

    // place two enemy 1/1 minions at the impact site
    const foe1 = summonCard(g, 1, 'Bone Jumble', 2, 2)  // 1/1
    const foe2 = summonCard(g, 1, 'Bone Jumble', 2, 2)  // 1/1

    // clear minions from player 0's hand, then inject exactly one Bone Jumble
    clearMinionsFromHand(g, 0)
    injectToHand(g, 0, 'Bone Jumble')  // 1/1 will be the falling star

    // trigger the fall (3rd counter)
    act(g, 0, { t: 'endTurn' })

    // prompt: choose which minion to summon
    expect(g.prompts[0]?.kind, 'summon-choice prompt').toBe('chooseOption')
    answer(g, 'Bone Jumble')

    // both foes killed simultaneously (not sequentially — star survives to strike both)
    expect(g.units[foe1.id], 'foe1 killed by simultaneous strike').toBeUndefined()
    expect(g.units[foe2.id], 'foe2 killed by simultaneous strike').toBeUndefined()
    // aura dispelled after the fall
    expect((g.auras as any)[auraId], 'aura dispelled after fall').toBeUndefined()
  })
})

// FAQ4: oversized summon — site-choice prompt for which affected site to strike on
describe('Falling Star — FAQ4: oversized minion gets a site-choice prompt', () => {
  it('with two affected sites, a chooseSquare prompt fires before the strike', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    placeSite(g, 0, 'Active Volcano', 3, 2)
    const auraId = injectFallingStar(g, 0, [{ x: 2, y: 2 }, { x: 3, y: 2 }])
    ;(g.auras as any)[auraId].counters.turns = 2

    clearMinionsFromHand(g, 0)
    injectToHand(g, 0, 'Bone Jumble')

    act(g, 0, { t: 'endTurn' })

    // first prompt: choose minion
    expect(g.prompts[0]?.kind, 'minion-choice prompt').toBe('chooseOption')
    answer(g, 'Bone Jumble')

    // second prompt: choose which affected site to strike on
    expect(g.prompts[0]?.kind, 'site-choice prompt for oversized fall').toBe('chooseSquare')
    answer(g, { x: 2, y: 2 })

    expect((g.auras as any)[auraId], 'aura dispelled after oversized fall').toBeUndefined()
  })
})
