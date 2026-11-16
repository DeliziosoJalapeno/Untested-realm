// Sir Perceval's quest site carries a 🚩; with TWO Percevals each has his own flag, and only the hovered /
// selected Perceval's flag glows (.quest-active) — never the other one's.
import { describe, it, expect, afterEach } from 'vitest'
import { act, fireEvent } from '@testing-library/react'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('Sir Perceval quest flags', () => {
  it('two Percevals: each flag sits on its own site and glows only for its own Perceval', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const perceval = (x: number, y: number) => {
      const c = `cp${g.nextId++}`; g.cards[c] = { id: c, name: 'Sir Perceval', owner: me }
      const id = `up${g.nextId++}`
      g.units[id] = {
        id, cardId: c, name: 'Sir Perceval', owner: me, controller: me, isAvatar: false, x, y, region: 'surface',
        tapped: false, damage: 0, enteredTurn: -1, usedThisTurn: {}, carrying: [], carryingUnits: [], modifiers: [],
      }
      return id
    }
    const [s1, s2] = Object.values(g.sites).filter((s: any) => !s.isRubble).slice(0, 2) as any[]
    const p1 = perceval(s1.x, s1.y)
    const p2 = perceval(s2.x, s2.y)
    g.flow = g.flow ?? {}
    g.flow.percevalQuest = { [p1]: s2.id, [p2]: s1.id } // each quests for the OTHER's square

    const h = new GameHarness(g).mount(); active = h
    const flag = (uid: string) => h.container.querySelector(`[data-quest-unit="${uid}"]`) as HTMLElement
    const lit = (uid: string) => flag(uid).classList.contains('quest-active')
    const chip = (uid: string) => h.container.querySelector(`[data-unit="${uid}"]`) as HTMLElement

    expect(flag(p1).closest('[data-site]')?.getAttribute('data-site'), 'p1 flag on p1\'s goal').toBe(s2.id)
    expect(flag(p2).closest('[data-site]')?.getAttribute('data-site'), 'p2 flag on p2\'s goal').toBe(s1.id)
    expect([lit(p1), lit(p2)], 'idle: neither glows').toEqual([false, false])

    act(() => { fireEvent.mouseEnter(chip(p1)) }); h.rerender()
    expect([lit(p1), lit(p2)], 'hover p1 → only p1\'s flag').toEqual([true, false])
    act(() => { fireEvent.mouseLeave(chip(p1)) }); h.rerender()
    expect([lit(p1), lit(p2)], 'leave → off').toEqual([false, false])

    act(() => { fireEvent.mouseEnter(chip(p2)) }); h.rerender()
    expect([lit(p1), lit(p2)], 'hover p2 → only p2\'s flag').toEqual([false, true])
    act(() => { fireEvent.mouseLeave(chip(p2)) }); h.rerender()

    act(() => { fireEvent.click(chip(p1)) }); h.rerender()
    expect([lit(p1), lit(p2)], 'select p1 → only p1\'s flag').toEqual([true, false])
  })

  it('two Percevals questing for the SAME site → two flags there, still lit independently', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const sites = Object.values(g.sites).filter((s: any) => !s.isRubble) as any[]
    const goal = sites[0]
    const ids: string[] = []
    for (const s of [sites[1], sites[2]]) {
      const c = `cp${g.nextId++}`; g.cards[c] = { id: c, name: 'Sir Perceval', owner: me }
      const id = `up${g.nextId++}`
      g.units[id] = {
        id, cardId: c, name: 'Sir Perceval', owner: me, controller: me, isAvatar: false, x: s.x, y: s.y, region: 'surface',
        tapped: false, damage: 0, enteredTurn: -1, usedThisTurn: {}, carrying: [], carryingUnits: [], modifiers: [],
      }
      ids.push(id)
    }
    g.flow = g.flow ?? {}
    g.flow.percevalQuest = { [ids[0]]: goal.id, [ids[1]]: goal.id }
    const h = new GameHarness(g).mount(); active = h
    const flags = h.container.querySelectorAll(`[data-site="${goal.id}"] .sitequest`)
    expect(flags.length).toBe(2)
    act(() => { fireEvent.mouseEnter(h.container.querySelector(`[data-unit="${ids[1]}"]`) as HTMLElement) }); h.rerender()
    const litIds = [...flags].map((f) => (h.container.querySelector(`[data-quest-unit="${(f as HTMLElement).dataset.questUnit}"]`) as HTMLElement))
      .filter((f) => f.classList.contains('quest-active')).map((f) => f.dataset.questUnit)
    expect(litIds).toEqual([ids[1]])
  })
})
