// Waveshaper: minions without submerge tapped by the flood "don't untap the next time they would."
// Repro for the reported bug: such minions untap at the start of their turn when they should not.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act } from './helpers'
import { makeCtx, getScript } from '../src'

function flood(g: any, player: 0 | 1, sx: number, sy: number) {
  const ctx = makeCtx(g, g.players[player].avatarUnitId, player, [])
  getScript('Waveshaper')!.conts!.wave(ctx, {}, { x: sx, y: sy })
}

describe('Waveshaper untap skip', () => {
  it('an UNTAPPED enemy minion flooded stays tapped through its next untap step', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Pond', 2, 1)      // my body of water
    placeSite(g, 0, 'Hamlet', 2, 2)    // site to flood (adjacent)
    const m = summonCard(g, 1, 'Foot Soldier', 2, 2); m.enteredTurn = -1; m.tapped = false

    flood(g, 0, 2, 2)
    expect(m.tapped, 'flood taps it').toBe(true)
    expect(m.counters?.skipUntap, 'marked to skip its next untap').toBe(1)

    act(g, 0, { t: 'endTurn' })         // -> player 1's turn begins, untap step runs
    expect(m.tapped, "it did NOT untap (it's player 1's minion, their untap step just ran)").toBe(true)
  })

  it('an ALREADY-TAPPED enemy minion flooded also does not untap next turn', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Pond', 2, 1)
    placeSite(g, 0, 'Hamlet', 2, 2)
    const m = summonCard(g, 1, 'Foot Soldier', 2, 2); m.enteredTurn = -1; m.tapped = true // e.g. it already attacked

    flood(g, 0, 2, 2)
    expect(m.counters?.skipUntap, 'still marked to skip its next untap even though already tapped').toBe(1)

    act(g, 0, { t: 'endTurn' })
    expect(m.tapped, 'stays tapped through its owner untap step').toBe(true)
  })
})
