// New defend UX: select defenders, then each FAR one is walked to the fight along a route. When there's a
// single/forced route it auto-resolves (no picker) and the client sends the declared {unitId, path} to the
// engine, which walks the defender in and commits it (→ the attacked unit is offered stay/withdraw).
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function addUnit(g: any, over: any) {
  const cardId = over.cardId ?? over.id
  g.cards[cardId] = { id: cardId, name: over.name, owner: over.controller }
  g.units[over.id] = {
    id: over.id, cardId, name: over.name, owner: over.controller, controller: over.controller,
    isAvatar: false, x: 1, y: 1, region: 'surface', tapped: false, damage: 0,
    enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {}, ...over,
  }
  return g.units[over.id]
}

describe('defend: a far defender is routed to the fight and committed', () => {
  it('auto-resolves the single route and sends the declared path; the defender walks in and defends', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const opp = (1 - me) as 0 | 1
    // clear scaffold units on the squares we use, then set up a real attack: opp attacker on my target,
    // my defender one step away. (1,1) and (2,1) both carry sites in the base board.
    for (const id of Object.keys(g.units)) { const u = g.units[id]; if ((u.x === 1 && u.y === 1) || (u.x === 2 && u.y === 1)) delete g.units[id] }
    addUnit(g, { id: 'atk', name: 'Bosk Troll', controller: opp, x: 1, y: 1, enteredTurn: -5 })
    addUnit(g, { id: 'tgt', name: 'Bosk Troll', controller: me, x: 1, y: 1, enteredTurn: -5 })
    addUnit(g, { id: 'def', name: 'Bosk Troll', controller: me, x: 2, y: 1, enteredTurn: -5 })
    g.flow = g.flow ?? {}
    g.flow.battleUnits = ['atk', 'tgt']
    const ctx = { attackerId: 'atk', isAttack: true, targetUnitId: 'tgt', siteId: undefined, defenderIds: [], targetStays: true, stage: 'strikeFirst', allocations: {}, struck: [], enemiesAtStart: ['tgt', 'def'] }
    g.prompts.push({
      id: 'd1', player: me, kind: 'defend', title: 'Defend?',
      data: { candidates: ['def'], attackLocation: { x: 1, y: 1, region: 'surface' }, attackerId: 'atk', target: { unit: 'tgt' } },
      cont: 'combat:defenders', ctx,
    })

    const h = new GameHarness(g).mount(); active = h
    const box = () => h.container.querySelector('[data-promptbox="defend"]') as HTMLElement
    expect(box(), 'the defend prompt is shown').toBeTruthy()

    h.click(box().querySelector('[data-choice="def"]')!)
    h.click(box().querySelector('[data-confirm="1"]')!)

    expect(h.drifts, 'the engine accepted the declared-path defend (no drift)').toHaveLength(0)
    expect([g.units['def'].x, g.units['def'].y], 'the defender walked the route to the fight square').toEqual([1, 1])
    expect(g.units['def'].tapped, 'defending taps it').toBe(true)
    // a real defender joined → the attacked unit is offered stay/withdraw
    expect(g.prompts.some((p: any) => p.kind === 'stayInFight'), 'withdrawal offered').toBe(true)
  })
})
