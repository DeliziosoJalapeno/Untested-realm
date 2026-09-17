// A minion's "here" is the single location IT occupies — its own square AND its own region. So an
// effect on "units here" must not reach a unit in a DIFFERENT region at the same square (a burrowed
// minion under a surface one is at a distinct location). Region-scoped: Silver Valkyries, Puppet
// Master, Asmodeus, Vatn Draconis.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

const burrow = (g: GameState, u: any) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'burrowing', duration: 'permanent', turn: g.turn, sourcePlayer: u.controller })
const submerge = (g: GameState, u: any) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'submerge', duration: 'permanent', turn: g.turn, sourcePlayer: u.controller })

describe('Silver Valkyries untap only allies in their own region', () => {
  it('untaps a co-located surface ally but not a burrowed one', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const valk = summonCard(g, 0, 'Silver Valkyries', 2, 2); valk.enteredTurn = -1
    const surfaceAlly = summonCard(g, 0, 'Bone Jumble', 2, 2); surfaceAlly.enteredTurn = -1; surfaceAlly.tapped = true
    const buried = summonCard(g, 0, 'Bone Jumble', 2, 2, 'underground'); buried.enteredTurn = -1; buried.tapped = true; burrow(g, buried)

    getScript('Silver Valkyries')!.endOfTurn!(makeCtx(g, valk.id, 0, []))
    expect(surfaceAlly.tapped, 'the surface ally is untapped').toBe(false)
    expect(buried.tapped, 'the burrowed ally below is left tapped').toBe(true)
  })
})

describe('Puppet Master controls only tapped minions in its own region', () => {
  it('seizes a co-located surface enemy but not a burrowed one', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const pm = summonCard(g, 0, 'Puppet Master', 2, 2); pm.enteredTurn = -1
    const surfaceFoe = summonCard(g, 1, 'Bone Jumble', 2, 2); surfaceFoe.enteredTurn = -1; surfaceFoe.tapped = true
    const buriedFoe = summonCard(g, 1, 'Bone Jumble', 2, 2, 'underground'); buriedFoe.enteredTurn = -1; buriedFoe.tapped = true; burrow(g, buriedFoe)

    getScript('Puppet Master')!.genesis!(makeCtx(g, pm.id, 0, []))
    expect(surfaceFoe.controller, 'the surface enemy is seized').toBe(0)
    expect(buriedFoe.controller, 'the burrowed enemy below is untouched').toBe(1)
  })
})

describe('Asmodeus destroys only his own location (surface), plus the site', () => {
  it('kills a co-located surface minion but not a burrowed one', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const asmo = summonCard(g, 0, 'Asmodeus', 2, 2); asmo.enteredTurn = -1; asmo.stealth = true
    const surfaceFoe = summonCard(g, 1, 'Bone Jumble', 2, 2); surfaceFoe.enteredTurn = -1
    const buriedFoe = summonCard(g, 1, 'Bone Jumble', 2, 2, 'underground'); buriedFoe.enteredTurn = -1; burrow(g, buriedFoe)

    getScript('Asmodeus')!.abilities![0].effect(makeCtx(g, asmo.id, 0, []))
    expect(g.units[surfaceFoe.id], 'the surface minion is destroyed').toBeUndefined()
    expect(g.units[buriedFoe.id], 'the burrowed minion under the site survives').toBeTruthy()
  })
})

describe("Vatn Draconis submerges only its own location", () => {
  it('while already submerged, it does NOT drag down a surface unit above it', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Croaking Swamp', 2, 2) // a water site
    const vatn = summonCard(g, 0, 'Vatn Draconis', 2, 2, 'underwater'); vatn.enteredTurn = -1; submerge(g, vatn)
    const above = summonCard(g, 0, 'Bone Jumble', 2, 2); above.enteredTurn = -1 // a surface unit at the same square

    getScript('Vatn Draconis')!.conts!.dive(makeCtx(g, vatn.id, 0, []), {}, true)
    expect(above.region, 'the surface unit above the submerged Vatn is not "here"').toBe('surface')
  })

  it('on the surface it DOES submerge a co-located surface unit', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Croaking Swamp', 2, 2)
    const vatn = summonCard(g, 0, 'Vatn Draconis', 2, 2); vatn.enteredTurn = -1
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 2); ally.enteredTurn = -1; submerge(g, ally) // can survive underwater

    getScript('Vatn Draconis')!.conts!.dive(makeCtx(g, vatn.id, 0, []), {}, true)
    expect(ally.region, 'a surface unit here is dragged under').toBe('underwater')
  })
})
