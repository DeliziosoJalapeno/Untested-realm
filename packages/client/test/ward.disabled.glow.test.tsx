// A disabled (or silenced) unit loses its Ward — the engine clears the live u.ward. The
// board's ward glow must follow u.ward, NOT the never-expiring printed keyword (kw.ward),
// or a disabled warded unit keeps glowing after its ward has guttered out.
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
    isAvatar: false, x: 3, y: 3, region: 'surface', tapped: false, damage: 0,
    enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {}, ...over,
  }
  return g.units[over.id]
}

describe('ward glow follows the live ward, not the printed keyword', () => {
  it('a disabled Clairvoyant (printed Ward, live ward cleared) shows NO ward glow', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    addUnit(g, { id: 'w1', name: 'Clairvoyant', controller: me, ward: false, disabled: true })
    const h = new GameHarness(g).mount(); active = h
    const chip = h.container.querySelector('[data-unit="w1"]') as HTMLElement
    expect(chip, 'the unit chip renders').toBeTruthy()
    expect(chip.querySelector('.aura-ward'), 'no ward glow once disabled').toBeFalsy()
  })

  it('an active warded Clairvoyant DOES glow (control)', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    addUnit(g, { id: 'w2', name: 'Clairvoyant', controller: me, ward: true })
    const h = new GameHarness(g).mount(); active = h
    const chip = h.container.querySelector('[data-unit="w2"]') as HTMLElement
    expect(chip.querySelector('.aura-ward'), 'an active ward glows').toBeTruthy()
  })
})
