// Undertow: 'Genesis → Staying within this body of water, move target unit one step.' For a minion with
// Submerge, crossing between surface and underwater IS a step: it may dive/surface in place. (Changing
// square keeps the level — one step is one square or one level.)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, waiveThreshold, summonCard, placeSite, answer } from './helpers'
import { avatarOf, getScript, makeCtx, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

function board(): { g: GameState; towId: string } {
  const g = newGame(); keepBoth(g); fillSites(g); waiveThreshold(g, 0)
  avatarOf(g, 0).x = 4; avatarOf(g, 0).y = 0
  avatarOf(g, 1).x = 4; avatarOf(g, 1).y = 3
  const swap = (name: string, x: number, y: number) => {
    for (const s of Object.values(g.sites)) if (s.x === x && s.y === y) delete g.sites[s.id]
    return placeSite(g, 0, name, x, y)
  }
  const tow = swap('Undertow', 1, 1)
  swap('Pond', 1, 2)
  return { g, towId: tow.id }
}
const ready = (u: UnitState) => { u.enteredTurn = -1; u.tapped = false; return u }
const squares = (g: GameState) => (g.prompts[0]?.data as { squares: { x: number; y: number }[] }).squares

describe('Undertow moves a Submerge minion between surface and underwater', () => {
  it('its own square is offered: diving in place is its step', () => {
    const { g, towId } = board()
    const shark = ready(summonCard(g, 1, 'Giant Shark', 1, 1)) // Submerge, on the surface
    getScript('Undertow')!.genesis!(makeCtx(g, towId, 0, []))
    answer(g, [shark.id])
    expect(squares(g)).toContainEqual({ x: 1, y: 1 })
    answer(g, { x: 1, y: 1 })
    expect(g.units[shark.id].region).toBe('underwater')
    expect([g.units[shark.id].x, g.units[shark.id].y]).toEqual([1, 1])
  })

  it('stepping to the other square keeps its level (a step is one square OR one level, not both)', () => {
    const { g, towId } = board()
    const shark = ready(summonCard(g, 1, 'Giant Shark', 1, 1))
    getScript('Undertow')!.genesis!(makeCtx(g, towId, 0, []))
    answer(g, [shark.id])
    answer(g, { x: 1, y: 2 })
    expect(g.prompts.length).toBe(0)
    const s = g.units[shark.id]
    expect([s.x, s.y, s.region]).toEqual([1, 2, 'surface'])
  })

  it('a submerged one may surface in place', () => {
    const { g, towId } = board()
    const shark = ready(summonCard(g, 1, 'Giant Shark', 1, 2)); shark.region = 'underwater'
    getScript('Undertow')!.genesis!(makeCtx(g, towId, 0, []))
    answer(g, [shark.id])
    answer(g, { x: 1, y: 2 })
    expect(g.units[shark.id].region).toBe('surface')
  })

  it('a minion without Submerge gets no in-place option and no level question', () => {
    const { g, towId } = board()
    const leo = ready(summonCard(g, 1, 'Snow Leopard', 1, 1))
    getScript('Undertow')!.genesis!(makeCtx(g, towId, 0, []))
    answer(g, [leo.id])
    expect(squares(g)).not.toContainEqual({ x: 1, y: 1 })
    answer(g, { x: 1, y: 2 })
    expect(g.prompts.length).toBe(0)
    expect([g.units[leo.id].x, g.units[leo.id].y, g.units[leo.id].region]).toEqual([1, 2, 'surface'])
  })
})
