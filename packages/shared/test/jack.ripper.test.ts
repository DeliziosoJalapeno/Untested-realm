// Jack the Ripper: "Stealth. May be cast to any Mortal, silencing then killing them,
// without breaking Stealth." His silence-and-kill is placed on the storyline when he is
// CAST and resolves as he enters. FAQ: if the Mortal's LOCATION is one where JACK himself
// is silenced or disabled on entry, he loses his Stealth (Stealth is an ability, like Ward).
//   - Silenced on entry  → the kill still resolves (a silenced minion may kill); revealed.
//   - Disabled on entry   → he cannot take the granted kill action, so no one dies; revealed.
//   - Neither             → the Mortal dies and his Stealth is NOT broken (card text).
import { describe, it, expect } from 'vitest'
import { newGame, summonCard, keepBoth } from './helpers'
import { getScript, makeCtx, checkStateBased } from '../src'

function ripperGenesis(g: any, jackId: string) {
  const jack = g.units[jackId]
  getScript('Jack the Ripper')!.genesis!(makeCtx(g, jackId, jack.controller, [], { x: jack.x, y: jack.y, region: jack.region }))
}

describe('Jack the Ripper — Stealth breaks only when HE is silenced/disabled on entry', () => {
  it('cast to a plain Mortal: the Mortal dies and Jack KEEPS his Stealth', () => {
    const g: any = newGame(); keepBoth(g)
    const prey = summonCard(g, 1, 'Common Cottagers', 2, 1) // a vanilla Mortal
    const jack = summonCard(g, 0, 'Jack the Ripper', 2, 1)
    jack.stealth = true // his printed Stealth token
    ripperGenesis(g, jack.id)
    expect(g.units[prey.id], 'the Mortal was slain').toBeFalsy()
    expect(g.units[jack.id]?.stealth, 'Stealth is NOT broken (card text)').toBe(true)
  })

  it('cast to Sister Stefánia (who silences him): she dies, and Jack is REVEALED', () => {
    // Sister Stefánia is a Mortal AND "other nearby minions are silenced" — she is Jack's
    // own silencer. He kills her, but was silenced the instant he entered → Stealth broken.
    const g: any = newGame(); keepBoth(g)
    const stef = summonCard(g, 1, 'Sister Stefánia', 2, 1)
    const jack = summonCard(g, 0, 'Jack the Ripper', 2, 1)
    jack.stealth = true
    ripperGenesis(g, jack.id)
    expect(g.units[stef.id], 'Sister Stefánia was slain').toBeFalsy()
    expect(g.units[jack.id], 'Jack survived').toBeTruthy()
    expect(g.units[jack.id]?.stealth, 'silenced on entry → Stealth broken').toBe(false)
  })

  it('cast to a Mortal while a Stone-gaze Gorgons disables him: NO ONE dies, Jack is revealed', () => {
    const g: any = newGame(); keepBoth(g)
    const prey = summonCard(g, 1, 'Common Cottagers', 2, 1)
    summonCard(g, 1, 'Stone-gaze Gorgons', 3, 1) // adjacent → disables Jack at (2,1)
    const jack = summonCard(g, 0, 'Jack the Ripper', 2, 1)
    jack.stealth = true
    ripperGenesis(g, jack.id)
    expect(g.units[prey.id], 'disabled Jack cannot take the granted kill — the Mortal lives').toBeTruthy()
    expect(g.units[jack.id]?.stealth, 'disabled on entry → Stealth broken').toBe(false)
  })

  it('general rule: any Stealth minion silenced by a persistent source loses its Stealth token', () => {
    const g: any = newGame(); keepBoth(g)
    summonCard(g, 1, 'Sisters of Silence', 3, 1) // silences nearby minions
    const jack = summonCard(g, 0, 'Jack the Ripper', 2, 1) // adjacent, no Mortal here → no kill
    jack.stealth = true
    checkStateBased(g)
    expect(g.units[jack.id]?.silenced, 'hushed by Sisters of Silence').toBe(true)
    expect(g.units[jack.id]?.stealth, 'silenced → Stealth token removed').toBe(false)
  })
})
