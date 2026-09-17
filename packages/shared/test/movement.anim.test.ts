// A walk records its route in flow.moveAnim so the client can animate the unit stepping square-by-square.
// ANY actual move records — including a single hop into an adjacent site; only a zero-step move records nothing.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { applyJudge, resolveMovement, type GameState, type Step, type UnitState } from '../src'
import { makeCtx } from '../src/engine/effects'

const surf = (x: number, y: number): Step => ({ x, y, region: 'surface' })

function board(): { g: GameState; u: UnitState } {
  const g = newGame(); keepBoth(g)
  for (const x of [0, 1, 2]) applyJudge(g, 0, { k: 'placeSite', name: 'Accursed Tower', player: 0, x, y: 1 })
  applyJudge(g, 0, { k: 'summonUnit', name: 'Bone Jumble', player: 0, x: 0, y: 1, region: 'surface', noGenesis: true })
  const u = Object.values(g.units).find((v) => v.name === 'Bone Jumble')! as UnitState
  u.enteredTurn = -5
  return { g, u }
}

describe('step-wise movement animation record', () => {
  it('a 2-step walk records the full visited route (start … destination)', () => {
    const { g, u } = board()
    resolveMovement(g as GameState, u, [surf(1, 1), surf(2, 1)])
    const rec = (g.flow as any).moveAnim?.at(-1)
    expect(rec, 'a moveAnim record exists').toBeTruthy()
    expect(rec.unitId).toBe(u.id)
    expect(rec.squares.map((s: any) => `${s.x},${s.y}`)).toEqual(['0,1', '1,1', '2,1'])
  })

  it('a single-step hop records the 2-square route (start → destination), so it animates too', () => {
    const { g, u } = board()
    resolveMovement(g as GameState, u, [surf(1, 1)])
    const rec = (g.flow as any).moveAnim?.at(-1)
    expect(rec, 'a single hop still records a walk').toBeTruthy()
    expect(rec.squares.map((s: any) => `${s.x},${s.y}`)).toEqual(['0,1', '1,1'])
  })

  it('a zero-step move (nowhere legal to go) records nothing', () => {
    const { g, u } = board()
    resolveMovement(g as GameState, u, [surf(0, 1)]) // stepping onto its own square is not a real step
    expect((g.flow as any).moveAnim ?? []).toHaveLength(0)
  })
})

describe('teleport animation record', () => {
  it('a genuine teleport records from → to for the zap-away + destination glow', () => {
    const { g, u } = board()
    makeCtx(g as GameState, u.id, 0, []).teleport(u.id, 2, 1, 'surface')
    expect(u.x).toBe(2)
    const rec = (g.flow as any).teleportAnim?.at(-1)
    expect(rec, 'a teleport record exists').toBeTruthy()
    expect(rec.from).toEqual({ x: 0, y: 1 })
    expect(rec.to).toEqual({ x: 2, y: 1 })
  })

  it('a push (one-step shove) records no teleport', () => {
    const { g, u } = board()
    makeCtx(g as GameState, u.id, 0, []).teleport(u.id, 1, 1, 'surface', { push: true })
    expect((g.flow as any).teleportAnim ?? []).toHaveLength(0)
  })
})
