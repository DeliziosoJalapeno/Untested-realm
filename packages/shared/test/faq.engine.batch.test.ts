// Engine-level FAQ fixes done in the main session (not by the card-executor agents):
//  * Seirawan Hydra — heals only NON-lethal damage; 6-at-once / simultaneous kills.
//  * Regurgitator — an empty belly fills from a dead minion in EITHER cemetery.
//  * Day of Judgment — banishes ALL Evil first, THEN damages what remains.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { dealDamageToUnit, checkStateBased, makeCtx } from '../src/engine/effects'
import { effDefence, isDisabled } from '../src/engine/statics'
import { getScript } from '../src/cards/scripts/registry'
import { applyAction, canActivate } from '../src'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('Seirawan Hydra heals only non-lethal damage', () => {
  it('survives damage dealt one point at a time (each is healed)', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const hydra = summonCard(g, 0, 'Seirawan Hydra', 2, 2)
    expect(effDefence(g, hydra)).toBe(6)
    for (let i = 0; i < 5; i++) dealDamageToUnit(g, hydra, 1, 1, { source: { player: 1, kind: 'effect' } })
    expect(g.units[hydra.id], 'still alive').toBeDefined()
    expect(g.units[hydra.id].damage, 'each point healed away').toBe(0)
  })

  it('dies to 6 damage all at once', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const hydra = summonCard(g, 0, 'Seirawan Hydra', 2, 2)
    dealDamageToUnit(g, hydra, 6, 1, { source: { player: 1, kind: 'effect' } })
    expect(g.units[hydra.id], 'a single lethal blow kills it').toBeUndefined()
  })

  it('dies to two simultaneous (batched) blows that together total its life', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const hydra = summonCard(g, 0, 'Seirawan Hydra', 2, 2)
    // batch:true defers the death check, mirroring two defenders striking simultaneously
    dealDamageToUnit(g, hydra, 3, 1, { source: { player: 1, kind: 'strike' }, batch: true })
    dealDamageToUnit(g, hydra, 3, 1, { source: { player: 1, kind: 'strike' }, batch: true })
    checkStateBased(g)
    expect(g.units[hydra.id], 'two simultaneous 3s = 6 at once → dies').toBeUndefined()
  })
})

describe('Deathspeaker availability tracks BOTH cemeteries (live)', () => {
  it('the speak ability is unavailable with empty cemeteries, and becomes available when EITHER gains a minion', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const speaker = summonCard(g, 0, 'Deathspeaker', 2, 2)
    expect(canActivate(g, 0, speaker.id, 'speak'), 'no corpses → greyed/rejected').not.toBeNull()
    // a dead minion in the OPPONENT's cemetery must re-enable it (checked live)
    const cid = `ctest${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Bone Jumble', owner: 1 } as any
    g.players[1].cemetery.push(cid)
    expect(canActivate(g, 0, speaker.id, 'speak'), "opponent's dead minion re-enables it").toBeNull()
  })
})

describe('Regurgitator fills its belly from either cemetery', () => {
  it("swallows a dead minion sitting in the OPPONENT's cemetery", () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const reg = summonCard(g, 0, 'Regurgitator', 3, 3)
    // seed a dead minion ONLY in player 1's cemetery
    const cid = `ctest${g.nextId++}`
    g.cards[cid] = { id: cid, name: 'Bone Jumble', owner: 1 } as any
    g.players[1].cemetery.push(cid)
    // fire the end-of-turn trigger directly
    getScript('Regurgitator')!.endOfTurn!(makeCtx(g, reg.id, 0, []))
    // one candidate → resolve the swallow prompt
    const prompt = g.prompts[0]
    expect(prompt?.kind, 'a corpse in the enemy cemetery is offered').toBe('chooseCards')
    applyAction(g, 0, { t: 'prompt', promptId: prompt!.id, choice: [0] })
    expect(g.players[1].cemetery.includes(cid), 'removed from the enemy cemetery').toBe(false)
    expect(g.players[1].banished.includes(cid), 'banished to its owner pile').toBe(true)
    expect(g.units[reg.id].counters?.belly, 'belly now holds the eaten power').toBe(1)
  })
})

describe('Perilous Bridge: pushes blocked across the border, teleports allowed', () => {
  function setup() {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Perilous Bridge', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 3) // the front border square
    const mover = summonCard(g, 0, 'Escyllion Cyclops', 2, 3) // non-Airborne, on the front square
    return { g, mover }
  }
  it('a PUSH (pull/drag) can NOT drag a non-Airborne unit across the top border', () => {
    const { g, mover } = setup()
    makeCtx(g, g.players[0].avatarUnitId, 0, []).teleport(mover.id, 2, 2, 'surface', { push: true })
    expect(g.units[mover.id].y, 'stayed on the front square — the pull was refused').toBe(3)
  })
  it('a TELEPORT crosses the same border', () => {
    const { g, mover } = setup()
    makeCtx(g, g.players[0].avatarUnitId, 0, []).teleport(mover.id, 2, 2, 'surface')
    expect(g.units[mover.id].y, 'a genuine Teleport crosses').toBe(2)
  })
})

describe('Cage of Sidrak: carry, disable, teleport-only escape', () => {
  function caged() {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    placeSite(g, 0, 'Rustic Village', 1, 1)
    const prey = summonCard(g, 0, 'Bone Jumble', 1, 1) // 1 power => lockable
    const artCard = `cc${g.nextId++}`; g.cards[artCard] = { id: artCard, name: 'Cage of Sidrak', owner: 0 } as any
    const cageId = `ac${g.nextId++}`
    g.artifacts[cageId] = { id: cageId, cardId: artCard, name: 'Cage of Sidrak', conjuredBy: 0, x: 3, y: 3, region: 'surface', tapped: false } as any
    getScript('Cage of Sidrak')!.genesis!(makeCtx(g, cageId, 0, []))
    return { g, prey, cageId }
  }
  it('genesis teleports a small minion into the Cage, tapped and disabled', () => {
    const { g, prey } = caged()
    expect(g.units[prey.id].x === 3 && g.units[prey.id].y === 3, 'pulled into the Cage').toBe(true)
    expect(g.units[prey.id].tapped, 'tapped').toBe(true)
    expect(isDisabled(g, g.units[prey.id]), 'disabled while caged').toBe(true)
  })
  it('a PUSH can NOT free a caged minion; a TELEPORT does', () => {
    const { g, prey } = caged()
    makeCtx(g, g.players[0].avatarUnitId, 0, []).teleport(prey.id, 1, 1, 'surface', { push: true })
    expect(g.units[prey.id].x === 3 && g.units[prey.id].y === 3, 'push refused — still caged').toBe(true)
    expect(isDisabled(g, g.units[prey.id]), 'still disabled').toBe(true)
    makeCtx(g, g.players[0].avatarUnitId, 0, []).teleport(prey.id, 1, 1, 'surface')
    checkStateBased(g)
    expect(g.units[prey.id].x === 1 && g.units[prey.id].y === 1, 'teleport freed it').toBe(true)
    expect(g.units[prey.id].counters?.caged, 'no longer caged').toBeFalsy()
    expect(isDisabled(g, g.units[prey.id]), 'and no longer disabled').toBe(false)
  })
  it('destroying the Cage frees the caged minion', () => {
    const { g, prey, cageId } = caged()
    delete g.artifacts[cageId]
    checkStateBased(g)
    expect(g.units[prey.id].counters?.caged, 'freed when the Cage is gone').toBeFalsy()
    expect(isDisabled(g, g.units[prey.id]), 'and undisabled').toBe(false)
  })
})
