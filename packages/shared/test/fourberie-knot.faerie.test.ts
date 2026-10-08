// Fourberie Knot: "…and is also a Faerie." The Knot must grant its bearer the Faerie subtype
// DYNAMICALLY, so every effSubtypes consumer (A Midsummer Night's Dream, Seelie/Unseelie Court,
// Fae City, The Faerie Queene…) counts the bearer as a Faerie — not just printed Faeries.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, giveArtifact } from './helpers'
import { effSubtypes, getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Fourberie Knot grants a dynamic Faerie subtype', () => {
  it('a non-Faerie bearer becomes a Faerie while wearing the Knot', () => {
    const g = newGame() as GameState; keepBoth(g)
    const bearer = summonCard(g, 0, 'Foot Soldiers', 1, 1); bearer.enteredTurn = -1
    expect(effSubtypes(g, bearer).includes('Faerie'), 'not a Faerie bare-handed').toBe(false)
    giveArtifact(g, bearer, 'Fourberie Knot')
    expect(effSubtypes(g, bearer).includes('Faerie'), 'the Knot makes its bearer a Faerie').toBe(true)
  })

  it("A Midsummer Night's Dream treats a Knot-bearer as a Faerie (no dispel, gets the power boost)", () => {
    const g = newGame() as GameState; keepBoth(g)
    // a Knot-wearing Foot Soldier is the only "Faerie" here — dynamic, not printed
    const bearer = summonCard(g, 0, 'Foot Soldiers', 1, 1); bearer.enteredTurn = -1
    giveArtifact(g, bearer, 'Fourberie Knot')
    // a Mortal sharing the square fuels the Dream's +1-per-Mortal boost
    const mortal = summonCard(g, 1, 'Foot Soldiers', 1, 1); mortal.enteredTurn = -1
    expect(effSubtypes(g, mortal).includes('Mortal'), 'fixture sanity: Foot Soldiers are Mortal').toBe(true)

    const dream = getScript("A Midsummer Night's Dream")!
    const aura = { id: 'rtest', cardId: 'ctest', name: "A Midsummer Night's Dream", controller: 0, squares: [{ x: 1, y: 1 }] } as any
    g.auras[aura.id] = aura

    // the dynamic Faerie is boosted +1 per Mortal present (the Mortal Foot Soldier)
    expect(dream.auraGrantsPower!(g, aura, bearer)).toBeGreaterThan(0)
    // and the Dream does NOT fade — there IS a Faerie here (the Knot-bearer)
    dream.endOfEveryTurn!({ state: g, sourceId: aura.id, controller: 0 } as any)
    expect(g.auras[aura.id], 'a dynamic Faerie keeps the Dream alive').toBeTruthy()
  })
})
