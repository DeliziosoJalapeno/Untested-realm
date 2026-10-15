// Vindictive Nation + Atlantean Fate (reported: "atlantean fate ha modificato 4 siti quindi le Nation
// dovrebbero attivarsi"). Flooding a nearby allied non-Ordinary site is an enemy "modify" — so a nearby
// Vindictive Nation bills the caster 1 life per affected site. Fixed in 0.5.0 (Atlantean Fate now emits
// notifySiteInterference per flooded site).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { avatarOf, makeCtx, getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Vindictive Nation reacts to Atlantean Fate flooding its land', () => {
  it('bills the Atlantean Fate caster 1 life per nearby affected allied site', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    placeSite(g, 0, 'Vindictive Nation', 2, 2)            // your Nation
    placeSite(g, 0, 'City of Glass', 2, 1)                // nearby allied non-Ordinary sites…
    placeSite(g, 0, 'City of Glass', 3, 2)
    const foeLife0 = avatarOf(g, 1).life!

    // the opponent (player 1) casts Atlantean Fate over both sites — model the aura + its Genesis
    g.cards['afc'] = { id: 'afc', name: 'Atlantean Fate', owner: 1 } as any
    g.auras['af'] = { id: 'af', cardId: 'afc', name: 'Atlantean Fate', controller: 1, squares: [{ x: 2, y: 1 }, { x: 3, y: 2 }] } as any
    getScript('Atlantean Fate')!.genesis!(makeCtx(g, 'af', 1, []))

    // two affected allied sites nearby → the Nation exacts 1 life each
    expect(avatarOf(g, 1).life, 'caster paid 1 life per modified nearby site').toBe(foeLife0 - 2)
  })
})
