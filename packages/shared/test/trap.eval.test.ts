// The bot's eval gives a small bonus for each of its own face-down traps still unsprung, so it springs one
// only when that gains more than keeping it in reserve. A foe's trap, or a sprung one, earns nothing.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { explainEval, DEFAULT_WEIGHTS, type GameState, type PlayerId } from '../src'

const term = (g: GameState, me: PlayerId) => (explainEval(g, me).terms as Record<string, number>).trapUnsprung ?? 0

function withTrap(g: GameState, owner: PlayerId, id: string, x: number) {
  g.cards[`c${id}`] = { id: `c${id}`, name: 'Bouldermaw', owner } as any
  g.sites[id] = { id, cardId: `c${id}`, name: 'Valley', owner, controller: owner, x, y: owner === 0 ? 0 : 3, tapped: false, isRubble: false,
    trap: { element: 'earth', realName: 'Bouldermaw', realCardId: `c${id}` } } as any
}

describe('unsprung trap bonus', () => {
  it('a small bonus per own face-down trap; none for the foe\'s', () => {
    const g = newGame(); keepBoth(g)
    withTrap(g, 0, 'st1', 0)
    withTrap(g, 0, 'st2', 4)
    withTrap(g, 1, 'st3', 0)
    expect(term(g, 0)).toBe(2 * DEFAULT_WEIGHTS.trapUnsprung)
    expect(term(g, 1)).toBe(DEFAULT_WEIGHTS.trapUnsprung)
    expect(DEFAULT_WEIGHTS.trapUnsprung).toBeLessThanOrEqual(10) // kept small
  })

  it('a sprung trap (face up) earns nothing', () => {
    const g = newGame(); keepBoth(g)
    withTrap(g, 0, 'st1', 0)
    delete (g.sites.st1 as any).trap
    expect(term(g, 0)).toBe(0)
  })
})
