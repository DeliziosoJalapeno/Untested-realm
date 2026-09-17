// Ward (and Stealth) are abilities: a DISABLED unit has no abilities, so it loses them. The marks are
// persistent — they don't return when the disable lifts. Ward is lost ONLY to a disabled minion: a
// Hillock Basilisk / Stone-Gaze Gorgons at-rest gaze disables a unit sitting still (→ ward gone), but a
// unit that is acting, entering, or PARTAKING IN A BATTLE is NOT disabled, so it keeps its ward (the
// Basilisk either disables or it doesn't — if it doesn't, no ability is lost). See the second describe
// block + basilisk-atrest.test.ts.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveMana, waiveThreshold, castMagic } from './helpers'
import { checkStateBased, isDisabled, dealDamageToUnit, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('disabled units lose ward', () => {
  it('a directly-disabled unit loses its ward', () => {
    const g = newGame() as GameState; keepBoth(g)
    const u = summonCard(g, 0, 'Bone Jumble', 2, 2); u.enteredTurn = -5; u.ward = true
    u.disabled = true
    checkStateBased(g)
    expect(g.units[u.id]?.ward ?? false, 'a disabled unit has no ward').toBe(false)
  })

  it('a unit at rest in a Basilisk cone loses its ward AND stealth (the Basilisk still alive)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 3)
    const bas = summonCard(g, 1, 'Hillock Basilisk', 2, 3); bas.enteredTurn = -5
    const victim = summonCard(g, 0, 'Bone Jumble', 2, 2); victim.enteredTurn = -5 // (2,2) is one step in front
    victim.ward = true; victim.stealth = true
    checkStateBased(g)
    expect(isDisabled(g, g.units[victim.id]), 'at rest in the cone → disabled').toBe(true)
    expect(g.units[victim.id]?.ward ?? false, 'Basilisk-disabled at rest → ward gone').toBe(false)
    expect(g.units[victim.id]?.stealth ?? false, 'Basilisk-disabled at rest → stealth gone').toBe(false)
    // and it STAYS gone even once it leaves the cone (persistent mark): move it away, re-settle
    g.units[victim.id].x = 0; g.units[victim.id].y = 0
    checkStateBased(g)
    expect(isDisabled(g, g.units[victim.id]), 'no longer in the cone').toBe(false)
    expect(g.units[victim.id]?.ward ?? false, 'ward does not come back').toBe(false)
  })
})

// Combat is NOT a disable. A warded minion PARTAKING in a battle (flow.battleUnits) is exempt from the
// Basilisk's at-rest gaze — the Basilisk either disables or it doesn't, and it does NOT disable a
// fighter — so the minion is not disabled and KEEPS its ward for that fight, even while standing in the
// cone. The ward then works normally: it absorbs an otherwise-unprevented strike and breaks to prevent
// it. (Only a unit truly AT REST in the gaze, above, is disabled and loses its ward.)
describe('a warded minion partaking in a battle keeps its ward (even gazed by a Basilisk)', () => {
  function board(withBasilisk: boolean) {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 3)
    if (withBasilisk) summonCard(g, 1, 'Hillock Basilisk', 2, 3).enteredTurn = -5 // gazes (2,2) at its front
    const warded = summonCard(g, 0, 'Bone Jumble', 2, 2); warded.enteredTurn = -5; warded.ward = true // 1/1
    g.flow = g.flow ?? {}; g.flow.battleUnits = [warded.id, 'atk'] // it is caught in a fight
    return { g, warded }
  }

  it('gazed but fighting → NOT disabled → ward absorbs the strike and breaks (survives)', () => {
    const { g, warded } = board(true)
    expect(isDisabled(g, g.units[warded.id]), 'in a battle → not disabled → keeps its abilities').toBe(false)
    dealDamageToUnit(g, g.units[warded.id], 3, 1, { source: { player: 1, kind: 'strike', attackerId: 'atk' } })
    checkStateBased(g)
    expect(g.units[warded.id], 'ward absorbed the blow → the 1/1 survived').toBeDefined()
    expect(g.units[warded.id]?.damage, 'took no damage — the ward prevented it').toBe(0)
    expect(g.units[warded.id]?.ward ?? false, 'the ward is spent to prevent the blow, as usual').toBe(false)
  })

  it('CONTROL: no Basilisk → identical (ward works in battle regardless)', () => {
    const { g, warded } = board(false)
    dealDamageToUnit(g, g.units[warded.id], 3, 1, { source: { player: 1, kind: 'strike', attackerId: 'atk' } })
    checkStateBased(g)
    expect(g.units[warded.id]?.damage, 'ward absorbed the whole strike').toBe(0)
    expect(g.units[warded.id]?.ward ?? false, 'ward spent').toBe(false)
  })
})

// A minion with a PRINTED ward summoned in front of a Basilisk keeps its ward while ENTERING (its own
// action — Genesis etc.), then loses it the instant it comes to rest still in the gaze. The printed
// keyword must NOT keep re-applying the ward each settle. Paladins of Bazia = "Spellcaster, Ward".
describe('a printed-ward minion summoned in front of a Basilisk loses its ward once at rest', () => {
  it('Paladins of Bazia settles disabled in the cone → its ward is gone (and stays gone)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2) // where the Paladins land — the Basilisk's front
    placeSite(g, 0, 'Rustic Village', 1, 2) // p0 site so (2,2) is a legal summon square
    placeSite(g, 1, 'Rustic Village', 2, 3) // the Basilisk's site
    summonCard(g, 1, 'Hillock Basilisk', 2, 3).enteredTurn = -5
    giveMana(g, 0, 30); waiveThreshold(g, 0)
    g.activePlayer = 0
    castMagic(g, 0, 'Paladins of Bazia', { at: { x: 2, y: 2 } })

    const pal = Object.values(g.units).find((u) => u.name === 'Paladins of Bazia')!
    expect(pal, 'the Paladins were summoned at the front').toBeTruthy()
    expect((g.flow?.entering ?? []).includes(pal.id), 'it has come to rest (no longer entering)').toBe(false)
    expect(isDisabled(g, pal), 'at rest in the gaze → disabled').toBe(true)
    expect(pal.ward ?? false, 'printed ward is lost once it settles at rest').toBe(false)
    // and the printed keyword does not re-apply it on the next settle
    checkStateBased(g)
    expect(g.units[pal.id]?.ward ?? false, 'ward stays gone').toBe(false)
  })
})
