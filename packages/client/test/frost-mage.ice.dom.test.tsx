// A minion the Frost Mage encased in ice (flow.encased) shows its card cracked with ice; the others don't,
// and the ice goes once the encasing ends.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Frost Mage ice cracks', () => {
  it('the encased minion is cracked with ice, its neighbour is not', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const minion = (x: number, y: number) => {
      const c = `cm${g.nextId++}`; g.cards[c] = { id: c, name: 'Bone Jumble', owner: me }
      const id = `um${g.nextId++}`
      g.units[id] = {
        id, cardId: c, name: 'Bone Jumble', owner: me, controller: me, isAvatar: false, x, y, region: 'surface',
        tapped: false, damage: 0, enteredTurn: -1, usedThisTurn: {}, carrying: [], carryingUnits: [], modifiers: [],
      }
      return id
    }
    const site = Object.values(g.sites).find((s: any) => !s.isRubble) as any
    const frozen = minion(site.x, site.y)
    const free = minion(site.x, site.y)
    g.flow = g.flow ?? {}
    g.flow.encased = [{ unitId: frozen, player: 1 - me, turn: g.turn }]

    const h = new GameHarness(g).mount(); active = h
    const ice = (uid: string) => h.container.querySelector(`[data-unit="${uid}"] .encased-ice`)
    expect(ice(frozen), 'encased minion shows the ice').not.toBeNull()
    expect(ice(frozen)?.querySelector('svg.encased-ice-cracks path'), 'cracked like ice').not.toBeNull()
    expect(ice(free), 'its neighbour does not').toBeNull()

    g.flow.encased = []
    h.rerender()
    expect(ice(frozen), 'the ice goes when the encasing ends').toBeNull()
  })
})
