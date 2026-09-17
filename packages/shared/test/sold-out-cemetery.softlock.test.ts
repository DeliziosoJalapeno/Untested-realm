// Sold-out Cemetery ("Whenever Undead enter this site, push another Undead here away one step")
// must NOT offer an Undead whose death is deferred (flow.pendingDeaths) as the push candidate. A
// card that kills the Undead here and then summons another onto the site fires this trigger while
// the sacrificed Undead is still on the board mid-batch — offering it as the only, MANDATORY push
// candidate soft-locked the game once it was removed. Now such dying Undead are skipped.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx, runDamageEvent, dealDamageToUnit, effectSummonUnit, type GameState } from '../src'

describe('Sold-out Cemetery does not soft-lock on a sacrificed Undead', () => {
  it('an Undead whose death is deferred is NOT offered as the push target', () => {
    const g = newGame(); keepBoth(g)
    const cem = placeSite(g, 0, 'Sold-out Cemetery', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2) // somewhere to be pushed, so a LIVE candidate would prompt
    const victim = summonCard(g, 0, 'Bone Jumble', 2, 2); victim.enteredTurn = -1 // Undead, being sacrificed
    const mover = summonCard(g, 0, 'Bone Jumble', 2, 2); mover.enteredTurn = -1 // the freshly-summoned Undead

    // the summoning card killed `victim` first — its death is deferred (still on the board mid-batch)
    g.flow = g.flow ?? {}
    g.flow.pendingDeaths = [{ unitId: victim.id, death: {} as any }]

    getScript('Sold-out Cemetery')!.onUnitEntersSquare!(makeCtx(g, cem.id, 0, []), g.units[mover.id], { x: 2, y: 2, region: 'surface' })
    expect(g.prompts.length, 'no push prompt for the dying Undead → no soft-lock').toBe(0)
  })

  it('a LIVE other Undead is still offered (the trigger still works)', () => {
    const g = newGame(); keepBoth(g)
    const cem = placeSite(g, 0, 'Sold-out Cemetery', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    summonCard(g, 0, 'Bone Jumble', 2, 2).enteredTurn = -1 // a live other Undead
    const mover = summonCard(g, 0, 'Bone Jumble', 2, 2); mover.enteredTurn = -1

    getScript('Sold-out Cemetery')!.onUnitEntersSquare!(makeCtx(g, cem.id, 0, []), g.units[mover.id], { x: 2, y: 2, region: 'surface' })
    expect(g.prompts.length, 'a live Undead is pushed as normal').toBe(1)
  })

  // The OTHER deferral route (added with simultaneous damage events): an Undead lethally damaged inside
  // an open damage event lingers on the board but is NOT in flow.pendingDeaths. It must also be skipped
  // — else a damage-then-summon effect (e.g. Fowl Bones raised onto the site after a kill here) offers
  // the doomed Undead as the only MANDATORY push candidate, and it vanishes at the event's close → soft-lock.
  it('an Undead dying via a damage event (lethal damage, not yet settled) is NOT offered', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Sold-out Cemetery', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    const victim = summonCard(g, 0, 'Bone Jumble', 2, 2); victim.enteredTurn = -1 // 1/1 Undead
    runDamageEvent(g, () => {
      dealDamageToUnit(g, g.units[victim.id], 5, 1, { source: { player: 1, kind: 'effect' } }) // lethal, DEFERRED (no settle yet)
      expect(!!g.units[victim.id], 'still on the board mid-event').toBe(true)
      expect((g.flow?.pendingDeaths ?? []).length, 'and NOT in pendingDeaths — the old guard would miss it').toBe(0)
      // a fresh Undead is summoned onto the site DURING the event → fires the sold-out trigger
      effectSummonUnit(g, {
        id: `u${g.nextId++}`, cardId: '', name: 'Bone Jumble', owner: 0, controller: 0, isAvatar: false,
        x: 2, y: 2, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
        modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
      } as any)
    })
    expect(g.units[victim.id], 'the doomed Undead was removed at the event close').toBeUndefined()
    expect(g.prompts.length, 'no push prompt referencing the removed Undead → no soft-lock').toBe(0)
  })
})
