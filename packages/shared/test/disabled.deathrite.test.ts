import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { killUnit } from '../src/engine/effects'

// Rulebook glossary: "While disabled, a minion loses all abilities." So a DISABLED minion's
// Deathrite must NOT trigger. Kettletop Leprechaun = "Deathrite → Draw a site."

describe('a disabled minion\'s Deathrite does not fire', () => {
  it('a disabled Kettletop Leprechaun draws no site when it dies', () => {
    const g = newGame(42, 0); keepBoth(g)
    const lep = summonCard(g, 0, 'Kettletop Leprechaun', 2, 2); lep.enteredTurn = 0
    lep.disabled = true
    const handBefore = g.players[0].hand.length
    killUnit(g, lep.id)
    expect(g.players[0].hand.length, 'disabled → Deathrite suppressed, no draw').toBe(handBefore)
  })

  it('an active Kettletop Leprechaun still draws a site (control)', () => {
    const g = newGame(42, 0); keepBoth(g)
    const lep = summonCard(g, 0, 'Kettletop Leprechaun', 2, 2); lep.enteredTurn = 0
    const handBefore = g.players[0].hand.length
    killUnit(g, lep.id)
    expect(g.players[0].hand.length, 'active → Deathrite drew a site').toBe(handBefore + 1)
  })
})
