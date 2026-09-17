// Two fixes:
//  • The Gifts ("Give an allied minion … Draw a spell") don't target — the minion choice is
//    optional. With NO allied minion you can still cast one just to draw; the draw always happens.
//  • Deathspeaker's flicker ability paid mana WITHOUT recording it as "spent", so the total-mana
//    widget (total = remaining + spent) appeared to shrink each use. It now bumps manaSpent.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, actFail, injectToHand, placeSite, summonCard, giveMana, waiveThreshold, answer } from './helpers'
import { findCard, type GameState } from '../src'
import '../src/cards/scripts/index'

// The passive-buff Gifts ("Give an allied minion X") modify an EXISTING minion, so the minion is
// optional — castable with none, just to draw. (Raven "CHOOSE"s and Frog "summon TO" both require one.)
const OPTIONAL_GIFTS = ['Gift of the Wolf', 'Gift of the Serpent'] as const

describe('Buff Gifts are castable with no allied minion (just draw)', () => {
  for (const gift of OPTIONAL_GIFTS) {
    it(`${gift}: cast with zero targets succeeds and still draws a spell`, () => {
      const g = newGame() as GameState; keepBoth(g)
      waiveThreshold(g, 0)
      giveMana(g, 0, 20)
      const id = injectToHand(g, 0, gift)
      const handBefore = g.players[0].hand.length
      // no allied minions on the board — cast with an empty target list
      act(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, targets: [] })
      // the gift left the hand, and a spell was drawn in its place (net hand count unchanged: -1 gift +1 draw)
      expect(g.players[0].hand.includes(id), 'the gift was consumed').toBe(false)
      expect(g.players[0].hand.length, 'a spell was drawn — net hand size unchanged').toBe(handBefore)
    })
  }
})

// Frog summons a token TO an allied minion; Raven makes you CHOOSE one — both need a minion present.
describe('Gift of the Frog / Raven REQUIRE an allied minion (mandatory, not wasteable)', () => {
  for (const gift of ['Gift of the Frog', 'Gift of the Raven'] as const) {
    it(`${gift}: cannot be cast with no allied minion`, () => {
      const g = newGame() as GameState; keepBoth(g)
      waiveThreshold(g, 0)
      giveMana(g, 0, 20)
      const id = injectToHand(g, 0, gift)
      const err = actFail(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, targets: [] })
      expect(err, 'the cast is refused for want of a minion').toMatch(/target/i)
      expect(g.players[0].hand.includes(id), 'the gift stays in hand').toBe(true)
    })
  }
})

describe('Deathspeaker flicker counts its mana as spent', () => {
  it('bumps flow.manaSpent so the total-mana widget stays put', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2) // a legal summon square for the echo
    const speaker = summonCard(g, 0, 'Deathspeaker', 4, 3); speaker.enteredTurn = -1

    // a dead minion in player 0's cemetery for the ability to speak for
    const deadName = 'Bone Jumble'
    const deadId = `dead${g.nextId++}`
    g.cards[deadId] = { id: deadId, name: deadName, owner: 0 }
    g.players[0].cemetery.push(deadId)

    const cost = findCard(deadName)?.cost ?? 0
    expect(cost, 'fixture minion has a real mana cost').toBeGreaterThan(0)
    giveMana(g, 0, cost + 5)
    const manaBefore = g.players[0].mana
    const spentBefore = g.flow?.manaSpent?.[0] ?? 0

    act(g, 0, { t: 'activate', sourceId: speaker.id, ability: 'speak' })
    // resolve prompts: pick the dead minion, then (if asked) a square / genesis target
    let guard = 0
    while (g.prompts[0] && guard++ < 8) {
      const p = g.prompts[0]
      if (p.kind === 'chooseOption') answer(g, deadName)
      else if (p.kind === 'chooseSquare') answer(g, { x: 2, y: 2 })
      else answer(g, p.data?.upTo ? [] : (p.data?.candidates?.[0] ?? []))
    }

    expect(g.players[0].mana, 'remaining mana dropped by the cost').toBe(manaBefore - cost)
    expect((g.flow?.manaSpent?.[0] ?? 0) - spentBefore, 'the cost was recorded as spent').toBe(cost)
    // therefore remaining + spent (the widget's "total") is unchanged by the flicker
    expect(g.players[0].mana + (g.flow?.manaSpent?.[0] ?? 0)).toBe(manaBefore + spentBefore)
  })
})
