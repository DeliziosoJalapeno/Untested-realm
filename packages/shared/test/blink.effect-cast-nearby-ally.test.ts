// Blink: "An ally teleports to a location it's nearby." Its square is measured from the chosen ALLY (whereOf),
// not the caster. A cast from hand already did this; an effect cast (Archimago's echo, a collection cast,
// a copy…) builds its own prompts and offered the squares nearby the caster (the Avatar) instead.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer } from './helpers'
import { effectCastSpell, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Blink cast by an effect offers locations nearby the ally', () => {
  it('the square prompt lists only locations nearby the chosen ally, and the teleport lands', () => {
    const g = newGame() as GameState; keepBoth(g)
    const av = Object.values(g.units).find((u) => u.isAvatar && u.controller === 0)!
    av.x = 4; av.y = 3
    for (const [x, y] of [[0, 0], [1, 1], [4, 3]]) placeSite(g, 0, 'Rustic Village', x, y)
    const ally = summonCard(g, 0, 'Bone Jumble', 0, 0); ally.enteredTurn = -1

    effectCastSpell(g, 0, 'Blink', { free: true, tokenCopy: true, caster: av.id })
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    answer(g, [ally.id])

    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    const squares = p.data.squares as { x: number; y: number }[]
    expect(squares.length).toBeGreaterThan(0)
    for (const s of squares) expect(Math.max(Math.abs(s.x - ally.x), Math.abs(s.y - ally.y)), `(${s.x},${s.y}) nearby the ally`).toBeLessThanOrEqual(1)
    expect(squares.some((s) => s.x === 4 && s.y === 3), "not the Avatar's square").toBe(false)

    answer(g, { x: 1, y: 1 })
    expect([g.units[ally.id].x, g.units[ally.id].y]).toEqual([1, 1])
  })
})
