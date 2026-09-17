// Draconian Bonekite's "Tap → deal 3 damage at target NEARBY location" must only target nearby
// squares — both for the Bonekite itself and for a Dragonlord that has taken its aspect. The spec was
// missing `where: 'nearby'`, and the engine's square-target validation never enforced `where` at all,
// so any square (whole board) validated; the effect only rejected far picks at resolve time (wasted tap).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { validateTarget, applyJudge, type GameState, type PlayerId, type UnitState, type TargetSpec } from '../src'
import { getScript } from '../src/cards/scripts/registry'

const sq = (x: number, y: number) => ({ square: { x, y, region: 'surface' as const } })
const reapSpec = () => getScript('Draconian Bonekite')!.abilities![0].targets![0] as TargetSpec

describe('Draconian Bonekite reap — nearby only', () => {
  it('accepts a nearby square, rejects a far one', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'summonUnit', name: 'Draconian Bonekite', player: 0, x: 2, y: 1, region: 'surface', noGenesis: true })
    const kite = Object.values(g.units).find((u) => u.name === 'Draconian Bonekite')! as UnitState
    const spec = reapSpec()
    expect(validateTarget(g as GameState, spec, sq(2, 2), kite, 0), 'adjacent square is legal').toBeNull()
    expect(validateTarget(g as GameState, spec, sq(2, 1), kite, 0), 'own square is legal (nearby incl. self)').toBeNull()
    expect(validateTarget(g as GameState, spec, sq(0, 3), kite, 0), 'a far square is NOT legal').not.toBeNull()
  })
})

describe('Dragonlord with Draconian Bonekite aspect — reap stays nearby', () => {
  it('the granted reap ability is nearby-locked to the Dragonlord, not the whole board', () => {
    const g = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]! as UnitState // seat 0 avatar at (2,0)
    av.name = 'Dragonlord'; g.cards[av.cardId].name = 'Dragonlord'
    g.flow = g.flow ?? {}
    ;(g.flow as any).dragonForm = { player: 0 as PlayerId, turn: g.turn, name: 'Draconian Bonekite' }
    const granted = getScript('Dragonlord')!.grantsAbilities!(g as GameState, av.id, av)
    const spec = granted.find((a) => a.key === 'reap')!.targets![0] as TargetSpec
    expect(validateTarget(g as GameState, spec, sq(av.x, av.y + 1), av, 0), 'nearby the Dragonlord is legal').toBeNull()
    expect(validateTarget(g as GameState, spec, sq(0, 3), av, 0), 'across the board is NOT legal').not.toBeNull()
  })
})
