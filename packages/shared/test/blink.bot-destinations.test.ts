// Blink: "An ally teleports to a location it's nearby." The destination is nearby the ALLY (the script's
// `whereOf: 0`), but the move generator (castTargetCombos, used by legalActions / the bot) validated every
// pick against the CASTER, so an ally away from the caster was only offered the squares near both — often
// none. Each pick is now validated with the picks before it.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, injectToHand, giveMana, waiveThreshold, placeSite } from './helpers'
import { avatarOf, legalActions, nearbySquaresW, siteAt, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('the move generator offers Blink to every location nearby the ally', () => {
  it('measures the destination from the ally, not the caster', () => {
    const g = newGame() as GameState; keepBoth(g)
    for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) if (!siteAt(g, x, y)) placeSite(g, 0, 'Spire', x, y)
    const av = avatarOf(g, 0)
    const far = summonCard(g, 0, 'Foot Soldier', av.x === 0 ? 4 : 0, av.y === 0 ? 3 : 0)
    const blink = injectToHand(g, 0, 'Blink')
    giveMana(g, 0, 9); waiveThreshold(g, 0)

    const offered = new Set(
      legalActions(g, 0)
        .filter((a) => a.t === 'castSpell' && a.cardId === blink && a.targets?.[0] === far.id)
        .map((a) => (a as { targets: string[] }).targets[1].slice(3).split(',').slice(0, 2).join(',')),
    )
    const nearby = nearbySquaresW(g, far.x, far.y).map((s) => `${s.x},${s.y}`)
    expect([...offered].sort()).toEqual([...nearby].sort())
  })
})
