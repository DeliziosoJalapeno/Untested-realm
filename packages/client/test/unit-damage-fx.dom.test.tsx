// Minion damage numbers on the real Game screen: a NON-AREA hit floats its number INSIDE the hit minion's
// card (over its fading death ghost when the hit kills it); an AREA effect (Balor's gaze) shows its big
// numbers on the sites only, and Balor's own site isn't lit as if hit.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import { dealDamageToUnit, settleUnitDamage } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null; vi.useRealTimers() })

function addUnit(g: any, name: string, controller: number, x: number, y: number) {
  const c = `cx${g.nextId++}`; g.cards[c] = { id: c, name, owner: controller }
  const id = `ux${g.nextId++}`
  g.units[id] = { id, cardId: c, name, owner: controller, controller, isAvatar: false, x, y, region: 'surface',
    tapped: false, damage: 0, enteredTurn: -1, usedThisTurn: {}, carrying: [], carryingUnits: [], modifiers: [] }
  return id
}

describe('minion damage numbers on the board', () => {
  it('a surviving minion shows the number inside its own card', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const foe = addUnit(g, 'Escyllion Cyclops', 1 - me, 2, 1)
    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('.unitdmg-fx')).toBeNull()
    dealDamageToUnit(g, g.units[foe], 3, me as any)
    settleUnitDamage(g) // what applyAction does once an action has resolved
    h.rerender()
    const fx = h.container.querySelector(`[data-unit="${foe}"] .unitdmg-fx`)
    expect(fx?.textContent).toBe('3')
    expect(h.container.querySelectorAll('.unitdmg-fx').length, 'only the hit minion').toBe(1)
  })

  it('a lethal single hit floats its number over the fading card', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const victim = Object.values(g.units).find((u: any) => u.name === 'Foot Soldier' && u.controller !== me) as any
    const h = new GameHarness(g).mount(); active = h
    dealDamageToUnit(g, g.units[victim.id], 2, me as any)
    settleUnitDamage(g) // what applyAction does once an action has resolved
    h.rerender()
    expect(g.units[victim.id], 'the Foot Soldier died').toBeUndefined()
    const ghost = [...h.container.querySelectorAll('.anim-ghost')].find((e) => e.querySelector('.unitdmg-fx'))
    expect(ghost?.querySelector('.unitdmg-fx')?.textContent).toBe('2')
  })

  it("Balor's gaze is an AREA: big number on the gazed site, none on the minion, and Balor's own site isn't lit", () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const mine = Object.values(g.units).find((u: any) => u.name === 'Foot Soldier' && u.controller === me) as any
    const victim = Object.values(g.units).find((u: any) => u.name === 'Foot Soldier' && u.controller !== me && u.y === mine.y && u.x > mine.x) as any
    expect(victim, 'fixture: an enemy Foot Soldier east of mine').toBeTruthy()
    const balor = addUnit(g, 'Balor of the Evil Eye', me, mine.x, mine.y)
    const h = new GameHarness(g).mount(); active = h
    h.send({ t: 'activate', sourceId: balor, ability: 'gaze' } as any)
    h.send({ t: 'prompt', promptId: g.prompts[0].id, choice: 'e' } as any)
    while (g.prompts.length) h.send({ t: 'prompt', promptId: g.prompts[0].id, choice: [g.prompts[0].data.candidates[0]] } as any)
    expect(h.drifts).toEqual([])
    expect(g.units[victim.id], 'the Foot Soldier died').toBeUndefined()
    expect([...h.container.querySelectorAll('.areadmg-cell')].map((e) => e.textContent)).toContain('2')
    expect(h.container.querySelectorAll('.unitdmg-fx').length, 'no number on any minion').toBe(0)
    const red = (g.flow.areaReveal.redSites as { x: number; y: number }[]).map((s) => `${s.x},${s.y}`)
    expect(red, "Balor's own site is not lit as if hit").not.toContain(`${mine.x},${mine.y}`)
  })

  it('a minion killed while its action waits on a prompt keeps its ghost until the number arrives', () => {
    vi.useFakeTimers()
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    const victim = Object.values(g.units).find((u: any) => u.name === 'Foot Soldier' && u.controller !== me) as any
    const h = new GameHarness(g).mount(); active = h
    dealDamageToUnit(g, g.units[victim.id], 2, me as any) // not settled yet: the action is paused
    h.rerender()
    const ghost = () => [...h.container.querySelectorAll('.anim-ghost')].find((e) => (e as HTMLElement).querySelector('img, div'))
    expect(ghost(), 'the death ghost appears').toBeTruthy()
    expect(h.container.querySelector('.unitdmg-fx'), 'no number yet').toBeNull()
    act(() => { vi.advanceTimersByTime(5000) }) // a slow answer: well past the 2.8s fade
    h.rerender()
    expect(ghost(), 'held while its hit is pending').toBeTruthy()
    settleUnitDamage(g) // the prompt is answered, the action settles
    h.rerender()
    expect(h.container.querySelector('.anim-ghost .unitdmg-fx')?.textContent).toBe('2')
    act(() => { vi.advanceTimersByTime(3000) })
    h.rerender()
    expect(h.container.querySelector('.anim-ghost'), 'then it fades away').toBeNull()
  })
})
