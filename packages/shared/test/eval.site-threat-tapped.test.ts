// Bot eval: a site threat (predictedSiteLoss → foeExposedSite / exposedSite) must count a TAPPED
// attacker too — it untaps at end of turn, so it's a standing threat next turn. This also stops a unit
// that just razed a site (now tapped on it) from "losing" the threat it still poses, which had made the
// bot prefer to merely threaten a site rather than actually attack it.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { explainEval } from '../src/bot/eval'

describe('site-threat eval counts tapped attackers', () => {
  it('foeExposedSite credits a TAPPED unit that can reach an enemy site', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 1, 'Rustic Village', 2, 2) // enemy (p1) site, undefended
    const atk = summonCard(g, 0, 'Escyllion Cyclops', 2, 1); atk.enteredTurn = -1 // my unit, adjacent → can reach
    atk.tapped = true // and TAPPED — it still threatens the site (untaps next turn)
    expect(explainEval(g, 0).terms.foeExposedSite ?? 0, 'the razable enemy site still counts').toBeGreaterThan(0)
  })

  it('exposedSite credits a TAPPED enemy that can reach MY site (defensive)', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2) // my (p0) site, undefended
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); foe.enteredTurn = -1
    foe.tapped = true
    expect((explainEval(g, 0).terms.exposedSite ?? 0) < 0, 'my site is still read as threatened').toBe(true)
  })
})
