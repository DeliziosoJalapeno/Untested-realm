// Corruptor: "Your Beasts are Monsters, your Mortals are Undead, your Angels are Demons." Card-name "Evil"
// checks (Den of Evil's discount, Eclipse, Mephistopheles, Doomsday Cult, Black Mass…) must honor that —
// they used printed subtypes only, so a Beast made Evil by a Corruptor wasn't recognised.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { avatarOf, isEvilCardName, isEvilCardNameFor, spellDiscountMatches, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

function makeCorruptor(g: GameState, player: PlayerId) {
  const av = avatarOf(g, player)
  av.name = 'Corruptor'
  g.cards[av.cardId].name = 'Corruptor'
}

describe('dynamic Evil (Corruptor) in card-name checks', () => {
  it('a Beast counts as Evil for a Corruptor player, but not by printed subtypes', () => {
    const g = newGame() as GameState; keepBoth(g)
    expect(isEvilCardName(g, 'Beast of Burden'), 'printed: a Beast is not Evil').toBe(false)
    expect(isEvilCardNameFor(g, 0, 'Beast of Burden'), 'no Corruptor → still not Evil').toBe(false)

    makeCorruptor(g, 0)
    expect(isEvilCardNameFor(g, 0, 'Beast of Burden'), 'your Corruptor makes your Beast Evil').toBe(true)
    expect(isEvilCardNameFor(g, 1, 'Beast of Burden'), 'only the Corruptor player’s own cards').toBe(false)
  })

  it('Den of Evil’s Evil discount matches a Corruptor-made-Evil cast', () => {
    const den = (g: GameState) => ({ player: 0 as PlayerId, turn: g.turn, amount: 1, noThreshold: true, evil: true, at: { x: 2, y: 2 } })

    const g = newGame() as GameState; keepBoth(g); makeCorruptor(g, 0)
    expect(spellDiscountMatches(g, den(g), 0, 'Beast of Burden', { x: 2, y: 2 }), 'Corruptor → the Beast is Evil, discount applies').toBe(true)

    const g2 = newGame() as GameState; keepBoth(g2) // no Corruptor
    expect(spellDiscountMatches(g2, den(g2), 0, 'Beast of Burden', { x: 2, y: 2 }), 'plain Beast is not Evil → no discount').toBe(false)
  })
})
