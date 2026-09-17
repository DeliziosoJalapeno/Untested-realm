import { describe, it, expect } from 'vitest'
import { createGame, starterDecks, viewFor, applyAction, type GameState } from '../src'

// Dragonlord: "Before setup, set aside a Unique Dragon." At game creation the player is
// prompted (a card grid of every Unique Dragon) to set one aside; the pick is stored and
// is HIDDEN from the opponent.
function dragonlordGame(): GameState {
  const d0: any = { ...starterDecks[0], avatar: 'Dragonlord' }
  return createGame([d0, starterDecks[1] as any], ['Drake', 'Foe'], 42, 0)
}

describe('Dragonlord sets aside a Unique Dragon before setup', () => {
  it('game creation prompts the Dragonlord player to pick from all Unique Dragons', () => {
    const g = dragonlordGame()
    const p = g.prompts[0]
    expect(p?.kind).toBe('nameCard')
    expect(p?.player).toBe(0)
    expect(p!.data.names).toEqual(expect.arrayContaining(['Ignis Rex', 'Caelestis', 'Draco Corvus']))
    expect(p!.data.names.length).toBeGreaterThanOrEqual(9)
  })

  it('answering stores the set-aside dragon, and it is HIDDEN from the opponent', () => {
    const g = dragonlordGame()
    const p = g.prompts[0]!
    const res = applyAction(g, 0, { t: 'prompt', promptId: p.id, choice: 'Ignis Rex' })
    expect(res.ok).toBe(true)
    expect((g.flow as any)?.dragonlordPick?.[0]).toBe('Ignis Rex')

    // the owner sees their own pick; the opponent (and spectators) never do
    expect(((viewFor(g, 0).flow as any)?.dragonlordPick ?? {})[0]).toBe('Ignis Rex')
    expect(((viewFor(g, 1).flow as any)?.dragonlordPick ?? {})[0]).toBeUndefined()
    expect(((viewFor(g, null).flow as any)?.dragonlordPick ?? {})[0]).toBeUndefined()
  })

  it('only the Dragonlord player gets the prompt (not the vanilla opponent)', () => {
    const g = dragonlordGame()
    // exactly one pre-game set-aside prompt, for seat 0
    const asides = g.prompts.filter((q) => q.kind === 'nameCard' && /set aside/i.test(q.title))
    expect(asides.length).toBe(1)
    expect(asides[0].player).toBe(0)
  })
})
