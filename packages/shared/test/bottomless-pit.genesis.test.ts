// Bottomless Pit: "Whenever a non-Airborne minion enters this site, kill it." A minion summoned ONTO
// the Pit must still get its full Genesis FIRST — including any target selection — before the Pit
// claims it. The location-entry kill is deferred to settleEntering, which runs only AFTER the Genesis
// (and any prompt it raises) has fully resolved.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, waiveThreshold } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

const liveUnit = (g: GameState, name: string) => Object.values(g.units).find((u) => u.name === name)

describe('Bottomless Pit vs Genesis', () => {
  it("resolves a self-referencing Genesis (Gargantula's drag) before the Pit kills the entrant", () => {
    const g = newGame(42, 0); keepBoth(g)
    // player 0's avatar beside the Pit so (2,1) is a legal summon square
    const av = avatarOf(g, 0); av.x = 1; av.y = 1; av.region = 'surface'
    placeSite(g, 0, 'Bottomless Pit', 2, 1)
    // an AIRBORNE enemy next to the Pit — a valid "adjacent minion" to drag, and (being Airborne) it
    // won't itself be killed when dragged onto the Pit square, so we can read its final position.
    const prey = summonCard(g, 1, 'Cloud Spirit', 3, 1); prey.enteredTurn = -1
    waiveThreshold(g, 0)

    // cast Gargantula (non-Airborne; "Genesis → drag an adjacent minion to ITS OWN square and cocoon
    // it") onto the Pit. The drag reads Gargantula's position, so it only works if the spider is alive.
    castMagic(g, 0, 'Gargantula', { at: { x: 2, y: 1, region: 'surface' }, targets: [prey.id] })

    // the Genesis resolved while Gargantula was alive: the prey was dragged to the Pit square + cocooned
    expect([prey.x, prey.y], 'the prey was dragged onto Gargantula’s square by the Genesis').toEqual([2, 1])
    expect(prey.counters?.cocooned, 'and cocooned by it').toBe(1)
    // …and only THEN did the Bottomless Pit claim Gargantula (the dragged Airborne prey survives)
    expect(liveUnit(g, 'Gargantula'), 'the Pit killed Gargantula AFTER its Genesis resolved').toBeFalsy()
    expect(liveUnit(g, 'Cloud Spirit'), 'the Airborne prey is unharmed by the Pit').toBeTruthy()
  })

  it('a targeted Genesis (Vile Imp) lands its effect before the Pit kills the entrant', () => {
    const g = newGame(42, 0); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 1; av.y = 1; av.region = 'surface'
    placeSite(g, 0, 'Bottomless Pit', 2, 1)
    const prey = summonCard(g, 1, 'Escyllion Cyclops', 3, 1); prey.enteredTurn = -1 // 6/6, survives 2 damage
    waiveThreshold(g, 0)

    // Vile Imp: "Genesis → may deal 2 damage to target adjacent unit" (target supplied with the cast)
    castMagic(g, 0, 'Vile Imp', { at: { x: 2, y: 1, region: 'surface' }, targets: [prey.id] })

    expect(prey.damage, 'the Genesis dealt its 2 damage to the chosen target').toBe(2)
    expect(liveUnit(g, 'Vile Imp'), 'the Pit killed the Imp after its Genesis resolved').toBeFalsy()
  })

  it('control: a Genesis-less minion summoned onto the Pit still dies immediately', () => {
    const g = newGame(42, 0); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 1; av.y = 1; av.region = 'surface'
    placeSite(g, 0, 'Bottomless Pit', 2, 1)
    waiveThreshold(g, 0)

    castMagic(g, 0, 'Stygian Archers', { at: { x: 2, y: 1, region: 'surface' } })

    expect(g.prompts.length, 'no Genesis, so no prompt').toBe(0)
    expect(liveUnit(g, 'Stygian Archers'), 'the Pit still kills a no-Genesis minion').toBeFalsy()
  })
})
