// A card returned to a DECK always goes to its OWNER's deck — never the deck of whoever's cemetery
// held it (Mismanaged Mortuary swap) or whoever CONTROLS it. Cards can never be shuffled into the
// opponent's deck (rulebook). Covers cemetery→deck (Return to Nature) and field→deck (Cast into
// Exile) via the shared returnToDeck helper.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, castMagic, summonCard, placeSite, answer, giveMana, waiveThreshold } from './helpers'

describe('cards returned to a deck go to their OWNER, never the opponent', () => {
  it('Return to Nature: a P0 card sitting in P1s cemetery (Mortuary swap) returns to P0s deck', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    // a minion OWNED by P0 but resting in P1's cemetery — as Mismanaged Mortuary leaves it
    const cardId = `x${g.nextId++}`
    g.cards[cardId] = { id: cardId, name: 'Escyllion Cyclops', owner: 0 }
    g.players[1].cemetery.push(cardId)

    castMagic(g, 0, 'Return to Nature', {})
    answer(g, "your opponent's") // return from P1's cemetery
    answer(g, [0])              // pick the card

    expect(g.players[0].spellbook, 'goes to the OWNER (P0) deck').toContain(cardId)
    expect(g.players[1].spellbook, 'never the opponent (P1) deck').not.toContain(cardId)
    expect(g.players[1].cemetery, 'and it left the cemetery').not.toContain(cardId)
  })

  it('Cast into Exile: a minion OWNED by P0 but CONTROLLED by P1 shuffles into P0s deck', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 1, 20); waiveThreshold(g, 1)
    g.activePlayer = 1; g.phase = 'main'
    placeSite(g, 1, 'Active Volcano', 2, 2) // a site P1 controls
    const u = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); u.enteredTurn = 0
    u.owner = 0; g.cards[u.cardId].owner = 0 // owned by P0, controlled by P1 (as if stolen)

    castMagic(g, 1, 'Cast into Exile', { targets: [u.id] })

    expect(g.units[u.id], 'the minion leaves the realm').toBeUndefined()
    expect(g.players[0].spellbook, 'shuffled into the OWNER (P0) deck').toContain(u.cardId)
    expect(g.players[1].spellbook, 'never the controller (P1) deck').not.toContain(u.cardId)
  })
})
