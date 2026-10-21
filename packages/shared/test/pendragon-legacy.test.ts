// Pendragon Legacy: 'Shuffle any number of Unique cards from your cemetery into your decks. Draw a card.'
// "any number" is the caster's choice — it used to shuffle back every Unique automatically.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, castMagic, waiveThreshold, answer, placeSite } from './helpers'
import { type GameState } from '../src'
import '../src/cards/scripts/index'

function deadCard(g: GameState, name: string): string {
  const id = `cdead${g.nextId++}`
  g.cards[id] = { id, name, owner: 0 } as any
  g.players[0].cemetery.push(id)
  return id
}

describe('Pendragon Legacy', () => {
  it('shuffles back only the chosen Unique cards, then draws', () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    const a = deadCard(g, 'King Arthur')
    const b = deadCard(g, 'Excalibur')
    const plain = deadCard(g, 'Bone Jumble') // not Unique → never offered
    castMagic(g, 0, 'Pendragon Legacy')
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    expect(g.prompts[0].data.cards).toEqual(['King Arthur', 'Excalibur'])
    answer(g, [1])
    const p = g.players[0]
    expect(p.cemetery).toContain(a)
    expect(p.cemetery).toContain(plain)
    expect(p.cemetery).not.toContain(b)
    expect(p.spellbook.includes(b) || p.hand.includes(b), 'Excalibur went back to the spellbook').toBe(true)
  })

  it('choosing none keeps the cemetery and still draws', () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    const a = deadCard(g, 'King Arthur')
    castMagic(g, 0, 'Pendragon Legacy')
    const hand = g.players[0].hand.length
    answer(g, [])
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'chooseOption' ? g.prompts[0].data.options[0] : 'spellbook')
    expect(g.players[0].cemetery).toContain(a)
    expect(g.players[0].hand.length, 'the draw still happens').toBe(hand + 1)
  })

  it('with a Bureau in play, picking nothing costs nothing', () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Bureau of Occult Control', 0, 0)
    deadCard(g, 'King Arthur')
    castMagic(g, 0, 'Pendragon Legacy')
    const mana = g.players[0].mana
    answer(g, [])
    expect(g.players[0].mana).toBe(mana)
  })
})
