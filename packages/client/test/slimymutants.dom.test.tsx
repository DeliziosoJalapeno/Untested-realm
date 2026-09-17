// #2: the Slimy Mutants hand-ability must be visible + clickable on the Avatar, and
// clicking it → picking a Submerge ally (Swan Maidens) transforms it. Reproduces the
// user's "couldn't summon by paying 3 / transforming Swan Maidens" report in the UI.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Slimy Mutants hand ability in the UI', () => {
  it('shows an enabled ability on the avatar and transforms a Swan Maidens on use', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const avatarId = g.players[me].avatarUnitId
    const av = g.units[avatarId]
    // Slimy Mutants in my hand, a Submerge ally (Swan Maidens) next to my avatar, mana ready
    const cardId = `slm${g.nextId++}`
    g.cards[cardId] = { id: cardId, name: 'Slimy Mutants', owner: me }
    g.players[me].hand.push(cardId)
    g.players[me].mana = 6
    const swanId = `swan${g.nextId++}`
    g.units[swanId] = { id: swanId, cardId: `swc${g.nextId++}`, name: 'Swan Maidens', owner: me, controller: me,
      isAvatar: false, x: av.x, y: av.y, region: 'surface', tapped: false, damage: 0, enteredTurn: -1,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} }
    g.cards[g.units[swanId].cardId] = { id: g.units[swanId].cardId, name: 'Swan Maidens', owner: me }

    const h = new GameHarness(g).mount(); active = h
    // select the avatar to reveal its actions
    h.click(h.container.querySelector('.unit.mine.avatar') as HTMLElement)

    const btn = h.container.querySelector(`[data-ability="slime:${cardId}"]`) as HTMLButtonElement
    expect(btn, 'the Slimy Mutants hand ability is shown on the avatar').toBeTruthy()
    expect(btn.disabled, 'and it is enabled (mana is there)').toBe(false)

    h.click(btn)
    // now a chooseTargets prompt for the Submerge ally — click the Swan Maidens
    const swanChip = h.container.querySelector(`[data-unit="${swanId}"]`) as HTMLElement
    expect(swanChip, 'the Swan Maidens is selectable').toBeTruthy()
    h.click(swanChip)

    expect(g.units[swanId]?.name, 'Swan Maidens transformed into Slimy Mutants').toBe('Slimy Mutants')
    expect(h.drifts, 'no rejected clicks').toHaveLength(0)
  })

  it('a SUBMERGED Swan Maidens can still be picked as the transform target', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const avatarId = g.players[me].avatarUnitId
    const av = g.units[avatarId]
    const cardId = `slm${g.nextId++}`
    g.cards[cardId] = { id: cardId, name: 'Slimy Mutants', owner: me }
    g.players[me].hand.push(cardId)
    g.players[me].mana = 6
    // Swan Maidens submerged (its natural state) on a water site under the avatar
    const site: any = Object.values(g.sites).find((s: any) => s.x === av.x && s.y === av.y)
    if (site) site.flooded = true
    const swanId = `swan${g.nextId++}`
    g.units[swanId] = { id: swanId, cardId: `swc${g.nextId++}`, name: 'Swan Maidens', owner: me, controller: me,
      isAvatar: false, x: av.x, y: av.y, region: 'underwater', tapped: false, damage: 0, enteredTurn: -1,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} }
    g.cards[g.units[swanId].cardId] = { id: g.units[swanId].cardId, name: 'Swan Maidens', owner: me }

    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector('.unit.mine.avatar') as HTMLElement)
    h.click(h.container.querySelector(`[data-ability="slime:${cardId}"]`) as HTMLElement)
    const swanChip = h.container.querySelector(`[data-unit="${swanId}"]`) as HTMLElement
    expect(swanChip, 'the submerged Swan Maidens is rendered + selectable for the prompt').toBeTruthy()
    h.click(swanChip)
    expect(g.units[swanId]?.name, 'submerged ally transformed').toBe('Slimy Mutants')
    expect(h.drifts).toHaveLength(0)
  })
})
