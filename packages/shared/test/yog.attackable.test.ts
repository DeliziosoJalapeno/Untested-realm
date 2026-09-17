// Yog-Sothoth occupies EVERY square, so any enemy unit is already standing on it and can strike
// it in place — no move needed. (The client couldn't offer this once Yog stopped rendering a chip
// at each square; the engine has always allowed it — this locks that in.)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { GRID_W, GRID_H, occupies, beginAttack, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Yog-Sothoth can be attacked in place from anywhere', () => {
  it('an enemy co-located with the all-occupying Yog may strike it with no movement', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) placeSite(g, 0, 'Spire', x, y)
    const yog = summonCard(g, 1, 'Yog-Sothoth', 2, 2); yog.enteredTurn = -1
    yog.extraSquares = []
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) if (!(x === 2 && y === 2)) yog.extraSquares.push({ x, y } as any)

    const atk = summonCard(g, 0, 'Stygian Archers', 0, 0); atk.enteredTurn = -5 // far from Yog's head at (2,2)
    expect(occupies(yog, 0, 0, 'surface'), 'Yog is on the attacker’s own square').toBe(true)

    // the attack the GUI now offers (in place, no move) is LEGAL — beginAttack returns no error
    expect(beginAttack(g, atk, { unit: yog.id }), 'attacking the co-located Yog is legal').toBeNull()
  })
})
