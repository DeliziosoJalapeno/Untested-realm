// Rulings from the same batch:
//  * Hillock Basilisk / Stone-gaze Gorgons disable other minions "AT REST". A minion that moves
//    into the zone and attacks (the Basilisk itself or an ally there) is mid-action, so it is NOT
//    disabled on arrival — it completes the attack, then is disabled once it comes to rest.
//  * Order of the White Wing banishes minions SUMMONED nearby. A site that TRANSFORMS into a minion
//    (Horns of Behemoth / Island Leviathan) wasn't summoned — the White Wing must ignore it.
//  * A triggered/activated ability that TARGETS an enemy (Tooth Faeries' start-of-turn tap) breaks
//    a warded target's ward and does NOT affect it.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, act, actFail, answer } from './helpers'
import { emitUnitEnters, effectSummonUnit, makeCtx, wardUnit } from '../src/engine/effects'
import { getScript } from '../src/cards/scripts/registry'
import { isDisabled } from '../src/engine/statics'
import type { GameState, UnitState } from '../src'
import '../src/cards/scripts/index'

describe('Hillock Basilisk disables only at rest', () => {
  it('an enemy may move into the Basilisk zone and attack it (not disabled on arrival)', () => {
    const g: GameState = newGame(); keepBoth(g)
    // sited squares so the attacker can walk the surface onto the Basilisk to fight it
    placeSite(g, 1, 'Rustic Village', 2, 2); placeSite(g, 0, 'Rustic Village', 2, 3)
    // Basilisk belongs to player 1 at (2,2); its zone is "here (2,2)" + "one step ahead (2,1)".
    const basilisk = summonCard(g, 1, 'Hillock Basilisk', 2, 2)
    // player-0 attacker starts adjacent OUTSIDE the zone at (2,3), steps ONTO the Basilisk's square to fight.
    // a 6/6 melee body kills the 3/3 Basilisk and survives the 3-damage strikeback.
    const attacker = summonCard(g, 0, 'Escyllion Cyclops', 2, 3)

    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: basilisk.id } })

    // the attacker reached the Basilisk's square and its attack was ACCEPTED (not blocked on arrival).
    const msgs = g.log.map((l: any) => (typeof l === 'string' ? l : l.msg ?? ''))
    expect(g.units[attacker.id], 'the attacker is alive on the Basilisk square').toBeDefined()
    expect(g.units[attacker.id].x === 2 && g.units[attacker.id].y === 2, 'it stepped onto the Basilisk').toBe(true)
    expect(msgs.some((m) => /attacks Hillock Basilisk/.test(m)), 'the attack was performed').toBe(true)
    expect(msgs.some((m) => /disabled on arrival/i.test(m)), 'the at-rest disable did NOT block the attack').toBe(false)
    // (a defend window opens — normal combat flow; the on-arrival disable would have skipped it entirely)
    expect(g.prompts[0]?.kind, 'combat proceeded to the defend step').toBe('defend')
  })

  it('a minion already AT REST in the zone is disabled and cannot act', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0); placeSite(g, 0, 'Rustic Village', 2, 1); placeSite(g, 1, 'Rustic Village', 2, 2)
    const basilisk = summonCard(g, 1, 'Hillock Basilisk', 2, 2)
    // a player-0 minion sitting in the front square from a previous turn — at rest → disabled.
    const resting = summonCard(g, 0, 'Escyllion Cyclops', 2, 1)
    expect(isDisabled(g, resting), 'a resting minion in the zone is disabled').toBe(true)
    const err = actFail(g, 0, { t: 'moveAttack', unitId: resting.id, path: [{ x: 2, y: 0, region: 'surface' }] })
    expect(err, 'a disabled resting minion cannot move').toMatch(/disabled/i)
    // and the Basilisk still stands (nobody attacked it)
    expect(g.units[basilisk.id]).toBeDefined()
  })
})

describe('Order of the White Wing ignores transforms', () => {
  function makeEntering(g: GameState, name: string, x: number, y: number, counters?: any): UnitState {
    const cid = `c${g.nextId++}`; g.cards[cid] = { id: cid, name, owner: 0 } as any
    const uid = `u${g.nextId++}`
    const unit: UnitState = {
      id: uid, cardId: cid, name, owner: 0, controller: 0, isAvatar: false,
      x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {}, counters,
    } as UnitState
    return unit
  }

  it('a transformed unit (Behemoth/Leviathan) entering nearby is NOT banished', () => {
    const g: GameState = newGame(); keepBoth(g)
    summonCard(g, 1, 'Order of the White Wing', 2, 2) // enemy White Wing guards the area
    const beh = makeEntering(g, 'Bone Jumble', 2, 3, { transformed: 1 }) // stand-in for a transformed site
    g.units[beh.id] = beh
    emitUnitEnters(g, beh)
    expect(g.units[beh.id], 'the transformed thing survived the White Wing').toBeDefined()
  })

  it('control: a genuinely summoned minion nearby IS banished', () => {
    const g: GameState = newGame(); keepBoth(g)
    summonCard(g, 1, 'Order of the White Wing', 2, 2)
    const uid = `u${g.nextId++}`; const cid = `c${g.nextId++}`
    g.cards[cid] = { id: cid, name: 'Bone Jumble', owner: 0 } as any
    const summoned = effectSummonUnit(g, {
      id: uid, cardId: cid, name: 'Bone Jumble', owner: 0, controller: 0, isAvatar: false,
      x: 2, y: 3, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
    } as UnitState)
    expect(summoned, 'a plain effect-summon nearby is turned away').toBeFalsy()
    expect(g.units[uid]).toBeUndefined()
  })
})

describe('targeting abilities break ward (Tooth Faeries)', () => {
  it("an enemy ward absorbs the Faeries' tap: ward breaks, the minion is NOT tapped", () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2); placeSite(g, 1, 'Rustic Village', 2, 1)
    const faeries = summonCard(g, 0, 'Tooth Faeries', 2, 2)
    const prey = summonCard(g, 1, 'Sacred Stag', 2, 1) // a warded (non-Evil) enemy nearby
    expect(wardUnit(g, prey), 'the Stag is warded').toBe(true)

    // fire the start-of-turn trigger — it raises the "pester whom?" targeting prompt
    getScript('Tooth Faeries')!.startOfTurn!(makeCtx(g, faeries.id, 0, []))
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    answer(g, [prey.id]) // player 0 targets the warded enemy

    expect(prey.ward, 'the ward broke on being targeted').toBe(false)
    expect(prey.tapped, 'but the tap did NOT land — the ward absorbed the ability').toBe(false)
  })

  it('control: an UNWARDED enemy is tapped normally', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2); placeSite(g, 1, 'Rustic Village', 2, 1)
    const faeries = summonCard(g, 0, 'Tooth Faeries', 2, 2)
    const prey = summonCard(g, 1, 'Sacred Stag', 2, 1)

    getScript('Tooth Faeries')!.startOfTurn!(makeCtx(g, faeries.id, 0, []))
    answer(g, [prey.id])

    expect(prey.tapped, 'no ward → the Faeries tap it').toBe(true)
  })
})
