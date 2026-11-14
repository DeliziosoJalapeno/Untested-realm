// "Win this turn" puzzles: the published solution of every puzzle must win against EVERY answer the
// engine lets the defender give, and the tempting wrong lines must not.
import { describe, it, expect } from 'vitest'
import { applyAction, cloneState, expandActions, type Action, type GameState } from '@sorcery/shared'
import { PUZZLES } from '../src/puzzle/puzzles'
import { Solver, solve } from '../src/puzzle/solver'
import { gate, puzzleDefence, playThrough } from '../src/tutorial/runner'
import type { Tut } from '../src/tutorial/scene'

/** follow the puzzle's line from `g`; at each of the defender's decisions, branch over all of them */
function lineWins(line: (t: Tut) => Action | null, g: GameState, ids: Record<string, string>, depth = 0): string | null {
  if (g.winner === 0) return null
  if (g.winner !== null || depth > 40) return 'the game ended without a win'
  const prompt = g.prompts[0]
  if (prompt && prompt.player === 1) {
    const kids = expandActions(g, 1)
    if (!kids.length) return `the defender has no legal answer to ${prompt.kind}`
    for (const k of kids) { const why = lineWins(line, k.next, ids, depth + 1); if (why) return `after the defender answers ${JSON.stringify(k.action.t === 'prompt' ? k.action.choice : k.action)}: ${why}` }
    return null
  }
  const a = line({ g, ids })
  if (!a) return 'the line has no move here'
  const next = cloneState(g)
  const r = applyAction(next, 0, a)
  if (!r.ok) return `the engine rejects ${JSON.stringify(a)}: ${r.error}`
  return lineWins(line, next, ids, depth + 1)
}

describe('puzzles', () => {
  it('are ordered easiest first and have hints and a solution', () => {
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(PUZZLES.length)
    let last = 1
    for (const p of PUZZLES) {
      expect(p.puzzle!.stars, p.id).toBeGreaterThanOrEqual(last); last = p.puzzle!.stars
      expect(p.puzzle!.hints.length, p.id).toBeGreaterThanOrEqual(2)
      expect(p.puzzle!.solution.length, p.id).toBeGreaterThan(80)
    }
  })

  for (const p of PUZZLES) {
    it(`"${p.title}": the published line wins against every defence`, () => {
      const t = p.build()
      expect(t.g.units[t.ids.foe].deathsDoor, 'the defender starts at Death\'s Door').toBe(true)
      expect(lineWins(p.steps[0].solve!, t.g, t.ids)).toBeNull()
    })
    it(`"${p.title}": can be played through against the live defender`, () => {
      expect(playThrough(p)).toBeNull()
    })
  }

  it('the position is not already won by the obvious attack (the defender holds)', () => {
    // Trapdoor: sending both attackers without springing the trap fails — two guards, two attacks
    const t = PUZZLES.find((p) => p.id === 'puzzle:trapdoor')!.build()
    const attack = (key: string): Action => ({ t: 'moveAttack', unitId: t.ids[key], path: [{ x: 2, y: 3, region: 'surface' }], attack: { unit: t.ids.foe } })
    expect(applyAction(t.g, 0, attack('sol')).ok).toBe(true)
    expect(t.g.prompts[0]?.kind).toBe('defend')
    expect(applyAction(t.g, 1, puzzleDefence(t.g)).ok).toBe(true) // a guard steps in
    expect(t.g.winner).toBeNull()
    expect(solve(t.g, 0).win).toBe(false) // …and from here there is no win left this turn
  })

  it('the solver finds the forced win and the key first move', () => {
    const p = PUZZLES.find((x) => x.id === 'puzzle:sirens-call')!
    const t = p.build()
    const s = new Solver(0)
    expect(s.wins(t.g)).toBe(true)
    const first = s.winningMoves(t.g)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ t: 'activate', ability: 'beckon', targets: [t.ids.foe] })
  })

  it('ending the turn is refused: the puzzle is to win this turn', () => {
    const p = PUZZLES[0], t = p.build()
    expect(gate(p, 0, { t: 'endTurn' }, t)).toMatch(/win this turn/i)
    expect(gate(p, 0, p.steps[0].solve!(t)!, t)).toBeNull()
  })
})
