// Two card fixes:
//  • Troll Bridge — "a lone ENEMY enters" includes the enemy AVATAR, and fires on FORCED moves.
//  • River Rapids — "push a minion" is NOT targeting, so it must not break a warded minion's ward.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'
import { emitUnitMoved } from '../src/engine/effects'
import { avatarOf, type Region } from '../src'

describe('Troll Bridge', () => {
  it('triggers on a lone enemy AVATAR that is force-moved in', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Troll Bridge', 2, 2) // player 0 owns the bridge
    const av = avatarOf(g, 1); av.x = 2; av.y = 2; av.region = 'surface' // enemy avatar now stands on it
    emitUnitMoved(g, av, { x: 1, y: 2, region: 'surface' as Region }, 'forced', true) // a FORCED entry
    const p = g.prompts[0]
    expect(p?.player, 'the enemy avatar must pay the toll').toBe(1)
    expect(String(p?.title)).toMatch(/toll/i)
  })
})

describe('River Rapids', () => {
  it('pushing a warded enemy minion does NOT break its ward', () => {
    const g = newGame(42, 0); keepBoth(g)
    const rr = placeSite(g, 0, 'River Rapids', 2, 1)
    placeSite(g, 0, 'River Rapids', 3, 1) // a connected river to push into
    const warded = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); warded.ward = true; warded.enteredTurn = 0
    act(g, 0, { t: 'activate', sourceId: rr.id, ability: 'rapids' })
    answer(g, [warded.id]) // choose to push the warded enemy minion
    expect(g.units[warded.id]?.ward, 'a pushed (not targeted) minion keeps its ward').toBe(true)
  })
})
