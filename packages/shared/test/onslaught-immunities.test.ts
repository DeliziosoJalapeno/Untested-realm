// Onslaught: "This turn, allies gain +1 power, Charge, and can't be immobilized, silenced, or disabled."
// The reported bug: it granted only disable-immunity, so an allied Pudge Butcher (printed Immobile)
// still couldn't move. It's the general immobilize/silence-immunity class — modelled centrally now:
//   • effKeywords strips the Immobile keyword (printed or granted) when the unit can't be immobilized
//   • Gossamer Ghost / Iron Man Talus `immuneToDisable` now confers immobilize-immunity (per its contract)
//   • silence effects skip a unit that "can't be silenced"
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, waiveThreshold, castMagic } from './helpers'
import { effKeywords, isLegalStep, makeCtx, getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Onslaught lifts Immobile from allies', () => {
  it('an allied Pudge Butcher can move the turn Onslaught is cast', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 1, 1); placeSite(g, 0, 'Rustic Village', 1, 2) // a walkable path
    const pudge = summonCard(g, 0, 'Pudge Butcher', 1, 1); pudge.enteredTurn = -1

    expect(effKeywords(g, pudge).immobile, 'Pudge is printed Immobile').toBe(true)
    const stepBefore = isLegalStep(g, pudge, { x: 1, y: 1, region: 'surface' }, { x: 1, y: 2, region: 'surface' })
    expect(stepBefore, 'and cannot step before Onslaught').toBe(false)

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Onslaught')

    expect(effKeywords(g, pudge).immobile, 'Onslaught strips Immobile this turn').toBeFalsy()
    const stepAfter = isLegalStep(g, pudge, { x: 1, y: 1, region: 'surface' }, { x: 1, y: 2, region: 'surface' })
    expect(stepAfter, 'so Pudge may now step').toBe(true)
  })

  it('does not touch an enemy Pudge Butcher', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const enemyPudge = summonCard(g, 1, 'Pudge Butcher', 3, 3); enemyPudge.enteredTurn = -1
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Onslaught')
    expect(effKeywords(g, enemyPudge).immobile, 'enemy stays Immobile').toBe(true)
  })
})

describe('Onslaught grants silence-immunity', () => {
  it("an Onslaught'd ally cannot be silenced by Grievous Insult (but is still tapped)", () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const ally = summonCard(g, 0, 'Pudge Butcher', 1, 1); ally.enteredTurn = -1
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Onslaught')

    // fire Grievous Insult's resolution straight at the ally
    getScript('Grievous Insult')!.onCast!({ ...makeCtx(g, g.players[0].avatarUnitId, 0, []), targets: [{ unit: ally.id }] } as any)
    expect(ally.silenced, 'the hush does not land').toBeFalsy()
    expect(ally.tapped, 'but it is still tapped').toBe(true)
  })
})

describe("Gossamer Ghost's immuneToDisable also means it can't be immobilized", () => {
  it('a granted Immobile keyword is stripped by the immunity', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const ghost = summonCard(g, 0, 'Gossamer Ghost', 2, 2); ghost.enteredTurn = -1
    ghost.modifiers.push({ kind: 'keyword', keyword: 'immobile', duration: 'permanent', turn: g.turn } as any)
    expect(effKeywords(g, ghost).immobile, 'immobilize-immune → Immobile stripped').toBeFalsy()
  })
})
