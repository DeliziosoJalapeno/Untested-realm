// Codex, Simultaneous Triggers: "the active player adds all of their events first, in the order of their
// choice." The active player is asked for that order only when two or more of their triggers would really
// act on the event — found by running each on a copy of the game, so a listener with nothing to do (Book of
// Blessings when the spell isn't magic on one ally) never makes them answer a question.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, injectToHand, giveMana, waiveThreshold, act, answer } from './helpers'
import { type GameState } from '../src'
import '../src/cards/scripts/index'

function castWithArtifacts(names: string[]) {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  placeSite(g, 0, 'Rustic Village', 2, 3)
  const avatar = g.units[g.players[0].avatarUnitId]
  avatar.x = 2; avatar.y = 3
  for (const n of names) giveArtifact(g, avatar, n)
  const victim = summonCard(g, 1, 'Wild Boars', 2, 3); victim.enteredTurn = -1
  const boars = injectToHand(g, 0, 'Wild Boars')
  giveMana(g, 0, 20)
  const lifeBefore = avatar.life
  act(g, 0, { t: 'castSpell', cardId: boars, casterId: avatar.id, at: { x: 2, y: 3, region: 'surface' } })
  return { g, avatar, victim, lifeBefore }
}

describe('the active player orders their own simultaneous triggers', () => {
  it('two triggers that both act: asked for the order first', () => {
    const { g } = castWithArtifacts(['Ring of Morrigan', 'Thumb Screws'])
    expect(g.prompts[0]?.kind).toBe('orderCards')
    expect(g.prompts[0]?.player).toBe(0)
    expect([...g.prompts[0].data.cards].sort()).toEqual(['Ring of Morrigan', 'Thumb Screws'])
  })

  it('they resolve in the chosen order', () => {
    const { g, avatar, lifeBefore } = castWithArtifacts(['Ring of Morrigan', 'Thumb Screws'])
    const cards: string[] = g.prompts[0].data.cards
    answer(g, [cards.indexOf('Thumb Screws'), cards.indexOf('Ring of Morrigan')])
    expect(avatar.life, 'Thumb Screws resolved first: 1 life lost').toBe((lifeBefore ?? 20) - 1)
    expect(g.prompts[0]?.cont, 'then the Ring asks').toBe('script:Ring of Morrigan:bleed')
  })

  it('a trigger with nothing to do does not count: no order question', () => {
    const { g } = castWithArtifacts(['Ring of Morrigan', 'Book of Blessings'])
    expect(g.prompts[0]?.cont).toBe('script:Ring of Morrigan:bleed')
  })

  it('a single trigger is never asked about', () => {
    const { g } = castWithArtifacts(['Ring of Morrigan'])
    expect(g.prompts[0]?.cont).toBe('script:Ring of Morrigan:bleed')
  })
})
