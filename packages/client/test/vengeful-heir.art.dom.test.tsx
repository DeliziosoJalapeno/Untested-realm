// Vengeful Heir summoned as a copy of a dead Knight: the engine renames the unit, but the chip kept drawing
// the Heir's chosen artwork (card.art beat the unit's name). Art now applies only while a permanent is
// still its own card.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('a unit that became another card draws the new card', () => {
  it('Vengeful Heir as Blue Knight: no Heir artwork on its chip', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const site: any = Object.values(g.sites).find((s: any) => !s.isRubble)
    const c = `cvh${g.nextId++}`; g.cards[c] = { id: c, name: 'Vengeful Heir', owner: me, art: 'heir-special-art' }
    const id = `uvh${g.nextId++}`
    g.units[id] = {
      id, cardId: c, name: 'Blue Knight', owner: me, controller: me, isAvatar: false, x: site.x, y: site.y, region: 'surface',
      tapped: false, damage: 0, enteredTurn: -1, usedThisTurn: {}, carrying: [], carryingUnits: [], modifiers: [],
    }
    const h = new GameHarness(g).mount(); active = h
    const img = h.container.querySelector(`[data-unit="${id}"] img.unitimg`) as HTMLImageElement
    expect(img.alt).toBe('Blue Knight')
    expect(img.getAttribute('src') ?? '').not.toContain('heir-special-art')
  })

  it('an untransformed unit still shows its chosen artwork', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const site: any = Object.values(g.sites).find((s: any) => !s.isRubble)
    const c = `cvh${g.nextId++}`; g.cards[c] = { id: c, name: 'Vengeful Heir', owner: me, art: 'heir-special-art' }
    const id = `uvh${g.nextId++}`
    g.units[id] = {
      id, cardId: c, name: 'Vengeful Heir', owner: me, controller: me, isAvatar: false, x: site.x, y: site.y, region: 'surface',
      tapped: false, damage: 0, enteredTurn: -1, usedThisTurn: {}, carrying: [], carryingUnits: [], modifiers: [],
    }
    const h = new GameHarness(g).mount(); active = h
    const img = h.container.querySelector(`[data-unit="${id}"] img.unitimg`) as HTMLImageElement
    expect(img.getAttribute('src') ?? '').toContain('heir-special-art')
  })
})
