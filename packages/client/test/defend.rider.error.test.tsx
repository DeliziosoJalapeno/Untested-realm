// Selecting a carried rider to defend WITHOUT its carrier shows an error (rather than a
// silent no-op) and does not submit; adding the carrier clears the error.
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

describe('defend: a rider chosen without its carrier is rejected with a message', () => {
  it('shows an error on confirm and only clears it once the carrier is selected too', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    addUnit(g, { id: 'h1', name: 'War Horse', controller: me, carryingUnits: ['r1'] })
    addUnit(g, { id: 'r1', name: 'Bosk Troll', controller: me, carriedBy: 'h1' })
    g.prompts.push({ id: 'd1', player: me, kind: 'defend', title: 'Defend?', data: { candidates: ['h1', 'r1'], attackLocation: { x: 1, y: 1, region: 'surface' }, attackerId: 'atk' }, cont: '', ctx: {} })

    const h = new GameHarness(g).mount(); active = h
    const box = () => h.container.querySelector('[data-promptbox="defend"]') as HTMLElement
    expect(box(), 'the defend prompt is shown').toBeTruthy()

    // pick ONLY the rider, then confirm → error, no submit
    h.click(box().querySelector('[data-choice="r1"]')!)
    h.click(box().querySelector('[data-confirm="1"]')!)
    expect(h.container.querySelector('.prompterr'), 'an error is shown').toBeTruthy()
    expect(box(), 'the prompt stays open (not submitted)').toBeTruthy()
    expect(g.prompts.length, 'nothing was sent to the engine').toBe(1)
    expect(h.drifts, 'no drift — the action was never dispatched').toHaveLength(0)

    // now also pick the carrier → the error clears
    h.click(box().querySelector('[data-choice="h1"]')!)
    expect(h.container.querySelector('.prompterr'), 'selecting the carrier clears the error').toBeFalsy()
  })
})

describe('defend: "defend with 0 units" is not offered', () => {
  it('the confirm button is disabled until at least one defender is picked', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    addUnit(g, { id: 'd1u', name: 'Bosk Troll', controller: me })
    g.prompts.push({ id: 'p1', player: me, kind: 'defend', title: 'Defend?', data: { candidates: ['d1u'], attackLocation: { x: 1, y: 1, region: 'surface' }, attackerId: 'atk' }, cont: '', ctx: {} })
    const h = new GameHarness(g).mount(); active = h
    const box = () => h.container.querySelector('[data-promptbox="defend"]') as HTMLElement
    const confirm = () => box().querySelector('[data-confirm="1"]') as HTMLButtonElement
    expect(confirm().disabled, 'nothing selected → cannot "defend with 0"').toBe(true)
    h.click(box().querySelector('[data-choice="d1u"]')!)
    expect(confirm().disabled, 'enabled once a defender is picked').toBe(false)
    expect(confirm().textContent).toContain('1 unit')
  })
})
