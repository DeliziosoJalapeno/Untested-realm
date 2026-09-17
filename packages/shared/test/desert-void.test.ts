// A Desert's Genesis ("Deal 1 damage to each minion atop target nearby site") counts its OWN site as
// nearby, and "atop" includes a minion still lingering in the void of that now-sited square — so casting
// a Desert under a voidwalker damages it (even before checkStateBased lifts it to the surface).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, answer } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Desert damages minions atop its own site', () => {
  it('offers its own site as a nearby target and damages a surface minion there', () => {
    const g: GameState = newGame(); keepBoth(g)
    const desert = placeSite(g, 0, 'Arid Desert', 2, 2)
    const foe = summonCard(g, 1, 'Forsaken', 2, 2); foe.enteredTurn = -1
    getScript('Arid Desert')!.genesis!(makeCtx(g, desert.id, 0, []))
    expect(g.prompts[0]?.data?.candidates, 'the Desert offers its own site').toContain(desert.id)
    answer(g, desert.id)
    expect(g.units[foe.id]?.damage).toBe(1)
  })

  it('damages a voidwalker cast under the Desert, even before it is lifted to the surface', () => {
    const g: GameState = newGame(); keepBoth(g)
    const desert = placeSite(g, 0, 'Arid Desert', 2, 2)
    const vw = summonCard(g, 1, 'Forsaken', 2, 2, 'void'); vw.enteredTurn = -1
    // deliberately do NOT settle state first — the void unit is still in the void at scorch time
    getScript('Arid Desert')!.genesis!(makeCtx(g, desert.id, 0, []))
    answer(g, desert.id)
    expect(g.units[vw.id]?.damage, 'the lingering void minion atop the site is hit').toBe(1)
  })

  it('does NOT hit a truly submerged (below-site) minion', () => {
    const g: GameState = newGame(); keepBoth(g)
    const desert = placeSite(g, 0, 'Arid Desert', 2, 2)
    const sub = summonCard(g, 1, 'Forsaken', 2, 2, 'underwater'); sub.enteredTurn = -1
    getScript('Arid Desert')!.genesis!(makeCtx(g, desert.id, 0, []))
    answer(g, desert.id)
    expect(g.units[sub.id]?.damage ?? 0, 'below the site, not atop → untouched').toBe(0)
  })
})
