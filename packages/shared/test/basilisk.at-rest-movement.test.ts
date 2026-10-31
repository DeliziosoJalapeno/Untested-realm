// Hillock Basilisk: "Other minions at rest here or one step in front of Hillock Basilisk are disabled."
// A unit still in the middle of a movement isn't at rest — not between the two steps of Whirling Blades
// (a prompt per step), nor while a Move & Attack waits on a square for a trigger mid-path (Storyline).
// It comes to rest — and is disabled — only once the whole effect has resolved.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, waiveThreshold, act, answer } from './helpers'
import { isDisabled, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Hillock Basilisk only disables a unit once it comes to rest', () => {
  it('Whirling Blades: the ally whirls through the Basilisk\'s square and takes its second step', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g); waiveThreshold(g, 0)
    for (const x of [2, 3, 4]) placeSite(g, 0, 'Active Volcano', x, 2)
    const ally = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); ally.enteredTurn = 0
    const basilisk = summonCard(g, 1, 'Hillock Basilisk', 3, 2); basilisk.enteredTurn = 0
    const foe = summonCard(g, 1, 'Conqueror Worm', 4, 2); foe.enteredTurn = 0 // 8/8
    castMagic(g, 0, 'Whirling Blades', { targets: [ally.id] })
    answer(g, { x: 3, y: 2 }) // into the Basilisk's square
    expect(isDisabled(g, g.units[ally.id]), 'mid-whirl: not at rest').toBe(false)
    const offered = (g.prompts[0]?.data as any)?.squares as { x: number; y: number }[]
    expect(offered.some((s) => s.x === 4 && s.y === 2), 'the second step is still offered').toBe(true)
    answer(g, { x: 4, y: 2 })
    expect([g.units[ally.id].x, g.units[ally.id].y]).toEqual([4, 2])
    expect(g.units[basilisk.id], 'the Basilisk on the path is struck').toBeUndefined()
    expect(g.units[foe.id]?.damage).toBe(6)
  })

  it('Whirling Blades: stopping in the Basilisk\'s square still strikes, then the ally is disabled', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g); waiveThreshold(g, 0)
    for (const x of [2, 3]) placeSite(g, 0, 'Active Volcano', x, 2)
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 2); ally.enteredTurn = 0 // 1 power: the 3/3 Basilisk survives
    const basilisk = summonCard(g, 1, 'Hillock Basilisk', 3, 2); basilisk.enteredTurn = 0
    castMagic(g, 0, 'Whirling Blades', { targets: [ally.id] })
    answer(g, { x: 3, y: 2 })
    answer(g, { x: 3, y: 2 }) // stop here
    expect(g.units[basilisk.id]?.damage, 'struck before it came to rest').toBe(1)
    expect(g.prompts.length).toBe(0)
    expect(isDisabled(g, g.units[ally.id]), 'at rest now: disabled').toBe(true)
  })

  it('a move paused on a gazed square for a trigger takes its next step once the trigger resolves', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 3)
    placeSite(g, 1, 'Troll Bridge', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const u = summonCard(g, 0, 'Snallygaster', 2, 3); u.enteredTurn = -1
    summonCard(g, 0, 'Hillock Basilisk', 2, 1).enteredTurn = -1 // its front is the bridge (2,2)
    act(g, 0, { t: 'moveAttack', unitId: u.id, path: [{ x: 2, y: 2, region: 'surface' }, { x: 2, y: 1, region: 'surface' }] })
    expect(g.prompts.map((p) => p.cont)).toEqual(['script:Troll Bridge:toll'])
    expect(isDisabled(g, g.units[u.id]), 'waiting on the bridge: not at rest').toBe(false)
    answer(g, [0]) // pay
    expect([g.units[u.id].x, g.units[u.id].y]).toEqual([2, 1])
    expect(isDisabled(g, g.units[u.id]), 'at rest beside the Basilisk now').toBe(true)
  })
})
