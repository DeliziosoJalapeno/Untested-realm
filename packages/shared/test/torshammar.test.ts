import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, giveArtifact, act } from './helpers'
import { checkStateBased, effDefence } from '../src'

// Torshammar FAQ: "a 1 power minion with 1 damage + the Trinket would survive the turn."
// The +1 power raises effective DEFENCE (a minion's power is its life), so it survives the
// damage while carrying it; and the end-of-turn return must happen AFTER damage is healed,
// so it doesn't die the instant the trinket flies back.
describe('Torshammar Trinket keeps a damaged bearer alive through the end phase', () => {
  it('+1 power raises the bearer’s effective defence (1/1 → survives 1 damage)', () => {
    const g = newGame(); keepBoth(g)
    const minion = summonCard(g, 0, 'Bone Jumble', 2, 2) // a 1/1
    giveArtifact(g, minion, 'Torshammar Trinket')
    expect(effDefence(g, minion)).toBe(2)
    minion.damage = 1
    checkStateBased(g)
    expect(g.units[minion.id], 'survives 1 damage while carrying the Trinket').toBeTruthy()
  })

  it('survives its controller’s end phase — damage heals BEFORE the Trinket returns', () => {
    const g = newGame(); keepBoth(g) // player 0 active
    const minion = summonCard(g, 0, 'Bone Jumble', 2, 2)
    const owner = g.players[0]
    giveArtifact(g, minion, 'Torshammar Trinket')
    minion.damage = 1
    checkStateBased(g)

    act(g, 0, { t: 'endTurn' })

    expect(g.units[minion.id], 'the bearer survived the turn').toBeTruthy()
    expect(g.units[minion.id].damage, 'damage healed').toBe(0)
    // the Trinket flew back to its owner's hand and is no longer in play
    expect(Object.values(g.artifacts).some((a) => a.name === 'Torshammar Trinket'), 'trinket left play').toBe(false)
    expect(owner.hand.some((id) => g.cards[id].name === 'Torshammar Trinket'), 'trinket returned to hand').toBe(true)
  })

  it('CONTROL: the same 1/1 with 1 damage and NO Trinket dies immediately', () => {
    const g = newGame(); keepBoth(g)
    const minion = summonCard(g, 0, 'Bone Jumble', 2, 2)
    minion.damage = 1
    checkStateBased(g)
    expect(g.units[minion.id], 'no Trinket → 1 damage kills the 1/1').toBeFalsy()
  })
})

// The same end-phase ordering means a TEMPORARY power-up magic (Overpower / Gift of the
// Wolf / Gigantism — all `+power, endOfTurn`, which raises effective defence) also keeps a
// damaged minion alive through the end of turn: damage heals BEFORE the buff expires.
describe('a single-turn +power buff keeps a damaged minion alive through end of turn', () => {
  it('a 1/1 pumped +2 with 2 damage survives its end phase; the buff then wears off', () => {
    const g = newGame(); keepBoth(g) // player 0 active
    const minion = summonCard(g, 0, 'Bone Jumble', 2, 2)
    minion.modifiers.push({ kind: 'power', amount: 2, duration: 'endOfTurn', turn: 0, sourcePlayer: 0 }) // e.g. Overpower/Gigantism
    minion.damage = 2
    checkStateBased(g)
    expect(g.units[minion.id], 'survives 2 damage at effDefence 3').toBeTruthy()

    act(g, 0, { t: 'endTurn' })

    expect(g.units[minion.id], 'survived the end phase (healed before the buff expired)').toBeTruthy()
    expect(g.units[minion.id].damage).toBe(0)
    expect(g.units[minion.id].modifiers.some((m) => m.duration === 'endOfTurn'), 'the +power buff wore off').toBe(false)
  })
})
