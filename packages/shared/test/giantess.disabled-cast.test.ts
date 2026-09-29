import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, injectToHand, giveMana, waiveThreshold, act } from './helpers'
import { isDisabled, type GameState } from '../src'
import '../src/cards/scripts/index'

// Slumbering Giantess falls asleep (disables herself) as her Genesis. But a minion whose Genesis is
// suppressed by an OUTSIDE disable when it enters never runs that Genesis — so a Giantess summoned
// where she's already disabled (atop a burrowed Root Spider) must NOT add her own sleep, and once
// the outside condition leaves she becomes active. Regression: the hard-cast path fired Genesis
// without the isDisabled guard the effect-summon path had, so she slept forever.
describe('Slumbering Giantess cast where already disabled', () => {
  function castGiantessAt(g: GameState, x: number, y: number) {
    const cardId = injectToHand(g, 0, 'Slumbering Giantess')
    giveMana(g, 0, 20); waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId, casterId: g.players[0].avatarUnitId, at: { x, y, region: 'surface' } })
    return Object.values(g.units).find((u) => u.name === 'Slumbering Giantess')!
  }

  it('falls asleep normally when cast on open ground', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0)
    const gia = castGiantessAt(g, 2, 0)
    expect(gia.counters?.asleep, 'her own Genesis put her to sleep').toBe(1)
    expect(isDisabled(g, gia)).toBe(true)
  })

  it('atop a burrowed Root Spider she does NOT self-sleep, and wakes when the Spider leaves', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0)
    const spider = summonCard(g, 1, 'Root Spider', 2, 0, 'underground'); spider.enteredTurn = -1
    const gia = castGiantessAt(g, 2, 0)
    // disabled right now — but by the Spider, not by her own (never-fired) sleep Genesis
    expect(gia.counters?.asleep ?? 0, 'no self-inflicted sleep').toBe(0)
    expect(gia.disabled ?? false, 'no persistent self-disable flag').toBe(false)
    expect(isDisabled(g, gia), 'the Spider disables her for now').toBe(true)
    // the Spider crawls away — nothing keeps her disabled
    spider.x = 5; spider.y = 5
    expect(isDisabled(g, gia), 'active once the outside condition leaves').toBe(false)
  })
})
