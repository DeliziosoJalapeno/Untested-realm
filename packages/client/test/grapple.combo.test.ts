// Brute-force combo test: the search bot must DISCOVER the Grapple Shot play with NO card-specific
// tuning — purely by applying actions and evaluating consequences.
//
// Setup: the two avatars face each other down column 2 with a line of sites between them; a Gyre
// Hippogriffs (3/3, Airborne, Charge) sits on MY avatar's square; I have 5 mana, air threshold, and
// Grapple Shot in hand. Grapple Shot: "an ally shoots a projectile; if it hits a unit, the ally is
// dragged there and may strike it." So the winning line is: Grapple Shot the Hippogriffs into the enemy
// avatar (strike 1), then attack the avatar again with the Hippogriffs (strike 2) — two hits.
import { describe, it, expect } from 'vitest'
import { applyAction, avatarOf, effAttack, type Action } from '@sorcery/shared'
import { newGame, keepBoth, summonCard, injectToHand, giveMana, waiveThreshold, placeSite } from '../../shared/test/helpers'
import { searchBotAction, searchBotNeedsToAct, DEFAULT_SEARCH } from '../src/bot_search'

describe('search finds spell combos by brute force', () => {
  it('Grapple Shot → strike enemy avatar, then attack again (two hits)', () => {
    const g = newGame(42, 0)
    keepBoth(g)
    // face the avatars down column 2, sites between them
    const myAv = avatarOf(g, 0); myAv.x = 2; myAv.y = 0
    const foeAv = avatarOf(g, 1); foeAv.x = 2; foeAv.y = 3
    // a projectile only travels over squares with a site (void ends the ray), so the WHOLE line between
    // the avatars — including the avatar squares themselves — must be sites for the shot to reach.
    for (const yy of [0, 1, 2, 3]) placeSite(g, yy === 3 ? 1 : 0, 'Spire', 2, yy)
    // Gyre Hippogriffs on my avatar's square, ready to act
    const hippo = summonCard(g, 0, 'Gyre Hippogriffs', 2, 0); hippo.enteredTurn = -1
    giveMana(g, 0, 5); waiveThreshold(g, 0); injectToHand(g, 0, 'Grapple Shot')

    const before = foeAv.life ?? 20
    const pow = effAttack(g, hippo) // 3
    const cfg = { ...DEFAULT_SEARCH, timeBudgetMs: 8000 } // generous — this is a brute-force check
    const acts: string[] = []
    let steps = 0
    while (steps++ < 80 && g.phase !== 'over' && g.activePlayer === 0) {
      if (!searchBotNeedsToAct(g, 0)) break
      const a: Action = searchBotAction(g, 0, cfg)
      acts.push(a.t === 'castSpell' ? 'cast:' + (g.cards[(a as { cardId?: string }).cardId ?? '']?.name ?? '') : a.t)
      const res = applyAction(g, 0, a)
      if (!res.ok) break
      if (a.t === 'endTurn') break
    }
    const after = avatarOf(g, 1).life ?? 20
    // eslint-disable-next-line no-console
    console.log('actions:', acts.join(' → '), '| foe avatar life', before, '→', after)
    expect(acts).toContain('cast:Grapple Shot') // it actually PLAYED the spell
    expect(after).toBeLessThanOrEqual(before - 2 * pow) // and landed BOTH hits on the avatar
  })
})
