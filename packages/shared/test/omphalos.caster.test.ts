// The Omphaloi are spellcaster ARTIFACTS ("Air and Fire Spellcaster"). Each casts its OWN
// drawn spell itself (only it — not the avatar), and may also cast any hand spell of its
// element. Element restriction comes from the multi-element spellcaster keyword.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveMana, waiveThreshold, injectToHand } from './helpers'
import { canCast, avatarOf } from '../src'

function omphalos(g: any, name = 'Char Omphalos', x = 2, y = 0) {
  const artCard = `co${g.nextId++}`
  g.cards[artCard] = { id: artCard, name, owner: 0 }
  const artId = `ao${g.nextId++}`
  g.artifacts[artId] = { id: artId, cardId: artCard, name, conjuredBy: 0, x, y, region: 'surface', tapped: false }
  return artId
}

describe('Omphalos — a spellcaster artifact', () => {
  it('its OWN drawn spell can be cast only by IT, not the avatar', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const artId = omphalos(g) // Char Omphalos = Air and Fire
    // its own drawn spell must match one of its elements (FAQ) — use a Fire spell so this stays a
    // pure caster-IDENTITY test (Necropotence is Earth, which the Omphalos may not cast).
    const cardId = injectToHand(g, 0, 'Fireball')
    g.flow = g.flow ?? {}
    g.flow.lockedCards = [{ cardId, casterId: artId, grantsCasting: false }]
    expect(canCast(g, 0, cardId, artId).ok, 'the Omphalos casts its own spell').toBe(true)
    expect(canCast(g, 0, cardId, avatarOf(g, 0).id).ok, 'the avatar may NOT — only it can cast').toBe(false)
  })

  it('may NOT cast its own drawn spell if it is off-element (Algor FAQ: must match an element)', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const artId = omphalos(g) // Char Omphalos = Air and Fire
    const cardId = injectToHand(g, 0, 'Necropotence') // Earth — off-element
    g.flow = g.flow ?? {}
    g.flow.lockedCards = [{ cardId, casterId: artId, grantsCasting: false }]
    expect(canCast(g, 0, cardId, artId).ok, 'an off-element locked spell is illegal for the Omphalos').toBe(false)
  })

  it('may cast a hand spell of its element (Fire), but not an off-element one (Water)', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const artId = omphalos(g) // Char Omphalos = Air and Fire
    const fire = injectToHand(g, 0, 'Fireball') // Fire
    const water = injectToHand(g, 0, 'Drown') // Water
    expect(canCast(g, 0, fire, artId).ok, 'Fire spell — within its elements').toBe(true)
    expect(canCast(g, 0, water, artId).ok, 'Water spell — off-element, rejected').toBe(false)
  })

  it('a non-spellcaster artifact is not a legal caster', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const artId = omphalos(g, 'Lance', 3, 0) // Lance has no Spellcaster keyword
    const fire = injectToHand(g, 0, 'Fireball')
    expect(canCast(g, 0, fire, artId).ok).toBe(false)
  })
})
