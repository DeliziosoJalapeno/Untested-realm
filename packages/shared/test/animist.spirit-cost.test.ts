// Animist "may cast magics in your hand as Spirits": casting a Spirit IS casting a spell — a MINION spell
// while it's cast. Cost modifiers apply (Maddening Bells near the Animist, Court of Equity, minion
// discounts like Donnybrook Inn), "when … cast" triggers fire (Mobbed Court), the magic's threshold is
// needed. The Spirit's power is still the magic's printed cost.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, answer, giveMana, injectToHand, placeSite, waiveThreshold } from './helpers'
import { avatarOf, effAttack, getCard, type GameState } from '../src'
import '../src/cards/scripts/index'

function setup(magic: string, threshold = true) {
  const g = newGame() as GameState; keepBoth(g)
  placeSite(g, 0, 'Rustic Village', 2, 2)
  const animist = avatarOf(g, 0) // the Animist is an avatar (Maddening Bells: avatars are Spellcasters)
  animist.name = 'Animist'; animist.x = 2; animist.y = 2
  g.players[0].hand = []
  const cardId = injectToHand(g, 0, magic)
  giveMana(g, 0, 10)
  if (threshold) waiveThreshold(g, 0)
  return { g, animist, cardId, printed: getCard(magic).cost ?? 0 }
}
function animate(g: GameState, animistId: string, cardId: string, at = { x: 2, y: 2 }) {
  act(g, 0, { t: 'activate', sourceId: animistId, ability: 'animate', extra: { cardId } } as any)
  if (g.prompts.length) answer(g, at)
  return Object.values(g.units).find((u) => u.cardId === cardId)
}
function artifact(g: GameState, name: string, x: number, y: number) {
  const id = `a${g.nextId++}`
  g.cards[`c${id}`] = { id: `c${id}`, name, owner: 1 } as any
  g.artifacts[id] = { id, cardId: `c${id}`, name, conjuredBy: 1, x, y, region: 'surface', tapped: false, carriedBy: null } as any
}

describe('Animist Spirits are cast', () => {
  it('Maddening Bells near the Animist makes the Spirit cost (2) more; power stays the printed cost', () => {
    const { g, animist, cardId, printed } = setup('Fireball')
    artifact(g, 'Maddening Bells', 2, 3)
    const spirit = animate(g, animist.id, cardId)
    expect(spirit).toBeTruthy()
    expect(g.players[0].mana).toBe(10 - printed - 2)
    expect(effAttack(g, spirit!)).toBe(printed)
  })

  it('Court of Equity taxes an Elite magic cast as a Spirit, and Mobbed Court costs life', () => {
    const { g, animist, cardId, printed } = setup('Ball Lightning') // Elite
    placeSite(g, 1, 'Court of Equity', 0, 3)
    placeSite(g, 1, 'Mobbed Court', 1, 3)
    const life = animist.life!
    const spirit = animate(g, animist.id, cardId)
    expect(spirit).toBeTruthy()
    expect(g.players[0].mana).toBe(10 - printed - 1)
    expect(animist.life).toBe(life - 1)
  })

  it('is a MINION spell while cast: an enemy Donnybrook Inn lets it be summoned there for (1) less', () => {
    const { g, animist, cardId, printed } = setup('Fireball')
    placeSite(g, 1, 'Donnybrook Inn', 2, 3) // the opponent's site: anyone may cast minions here
    act(g, 0, { t: 'activate', sourceId: animist.id, ability: 'animate', extra: { cardId } } as any)
    expect(g.prompts[0].data.squares).toContainEqual({ x: 2, y: 3 })
    answer(g, { x: 2, y: 3 })
    const spirit = Object.values(g.units).find((u) => u.cardId === cardId)
    expect(spirit).toMatchObject({ x: 2, y: 3 })
    expect(g.players[0].mana).toBe(10 - printed + 1)
    expect(effAttack(g, spirit!)).toBe(printed)
  })

  it("needs the magic's threshold, like any cast", () => {
    const { g, animist, cardId } = setup('Fireball', false) // a Rustic Village gives no Fire
    expect(animate(g, animist.id, cardId)).toBeUndefined()
    expect(g.players[0].hand).toContain(cardId)
    expect(g.players[0].mana).toBe(10)
  })
})
