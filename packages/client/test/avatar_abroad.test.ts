// From a reviewed game: the Lavamancer (power 1) walked onto the enemy's sites to hit them for 1 and
// was killed there. A weak Avatar off its own ground is now penalised; an activation that does nothing
// is no longer offered as a move.
import { describe, it, expect } from 'vitest'
import { evaluate, expandActions, DEFAULT_WEIGHTS } from '@sorcery/shared'
import { scene } from '../src/tutorial/scene'

const board = (at: [number, number], life: [number, number] = [10, 19]) =>
  scene({ avatars: ['Lavamancer', 'Frost Mage'], sites: [[0, 'Valley', 2, 0], [0, 'Valley', 2, 1], [1, 'Stream', 2, 2], [1, 'Stream', 2, 3]], at: [at, [2, 3]], life })

describe('a weak Avatar stays on its own ground', () => {
  it('scores standing on an enemy site below standing at home, whoever is ahead on life', () => {
    const home = board([2, 1]), away = board([2, 2])
    const gap = evaluate(home.g, 0, DEFAULT_WEIGHTS) - evaluate(away.g, 0, DEFAULT_WEIGHTS)
    const off = { ...DEFAULT_WEIGHTS, avatarAbroad: 0 }
    const gapOff = evaluate(home.g, 0, off) - evaluate(away.g, 0, off)
    expect(gap - gapOff).toBeCloseTo(DEFAULT_WEIGHTS.avatarAbroad, 6)
    const ahead = evaluate(board([2, 1], [19, 10]).g, 0, DEFAULT_WEIGHTS) - evaluate(board([2, 2], [19, 10]).g, 0, DEFAULT_WEIGHTS)
    const aheadOff = evaluate(board([2, 1], [19, 10]).g, 0, off) - evaluate(board([2, 2], [19, 10]).g, 0, off)
    expect(ahead - aheadOff).toBeCloseTo(DEFAULT_WEIGHTS.avatarAbroad, 6)
  })
})

describe('activations that do nothing', () => {
  it('does not offer Toolbox when no spell can be fetched', () => {
    const t = scene({ avatars: ['Lavamancer', 'Frost Mage'], sites: [[0, 'Valley', 2, 0], [1, 'Stream', 2, 3]], carry: ['Toolbox'], mana: 0 })
    const acts = expandActions(t.g, 0).map((c) => c.action)
    expect(acts.some((a) => a.t === 'activate' && a.ability === 'rummage')).toBe(false)
    expect(acts.some((a) => a.t === 'endTurn')).toBe(true)
  })
})
