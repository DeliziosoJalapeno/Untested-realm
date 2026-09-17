import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer } from './helpers'
import { makeCtx } from '../src/engine/effects'
import { selfStepsCloser } from '../src/engine/movement'
import { getScript } from '../src/cards/scripts/registry'

// Purge of the "arbitrary choice" pattern: when the rules give the player a choice among
// 2+ candidates, the engine must PROMPT — not silently take the first-found / [0] / a count.
// (Same class as Divine Lance's count-prompt and Heretics of Seth's first-found loop.)

describe('Jack the Ripper: choose which co-located Mortal to slay', () => {
  it('prompts when 2 Mortals share the square; only the chosen one dies', () => {
    const g = newGame(42, 0); keepBoth(g)
    const jack = summonCard(g, 0, 'Jack the Ripper', 2, 2); jack.enteredTurn = 0
    const m1 = summonCard(g, 1, 'Heretics of Seth', 2, 2); m1.enteredTurn = 0 // Mortal
    const m2 = summonCard(g, 1, 'Heretics of Seth', 2, 2); m2.enteredTurn = 0 // Mortal
    getScript('Jack the Ripper')!.genesis!(makeCtx(g, jack.id, 0, []))
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(new Set(p!.data.candidates)).toEqual(new Set([m1.id, m2.id]))
    answer(g, [m1.id])
    expect(g.units[m1.id], 'the chosen Mortal is slain').toBeUndefined()
    expect(g.units[m2.id], 'the other is spared').toBeDefined()
  })
})

describe('Chains of Prometheus: tie for strongest is the player\'s choice', () => {
  it('prompts the drawing player when two minions tie for strongest', () => {
    const g = newGame(42, 0); keepBoth(g)
    const a = summonCard(g, 0, 'Escyllion Cyclops', 0, 0); a.enteredTurn = 0 // 6/6
    const b = summonCard(g, 0, 'Escyllion Cyclops', 1, 0); b.enteredTurn = 0 // 6/6 (tie)
    summonCard(g, 0, 'Heretics of Seth', 2, 0).enteredTurn = 0 // weaker, never a candidate
    // a real Chains source so its cont ('bind') routes via script:Chains of Prometheus:bind
    g.cards['cChains'] = { id: 'cChains', name: 'Chains of Prometheus', owner: 0 }
    ;(g.artifacts as any)['aChains'] = { id: 'aChains', cardId: 'cChains', name: 'Chains of Prometheus', conjuredBy: 0, x: 4, y: 3, region: 'surface', tapped: false }
    getScript('Chains of Prometheus')!.onCardDrawn!(makeCtx(g, 'aChains', 0, []), 0, 'spellbook')
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(new Set(p!.data.candidates)).toEqual(new Set([a.id, b.id]))
    answer(g, [a.id])
    expect(g.units[a.id].tapped, 'chosen one taps').toBe(true)
    expect(g.units[b.id].tapped, 'the other stays untapped').toBe(false)
  })
})

describe('Persecutor: choose the step-toward square', () => {
  it('prompts which way to stalk when 2+ steps close on the nearest Evil', () => {
    const g = newGame(42, 0); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    av.name = 'Persecutor'; g.cards[av.cardId].name = 'Persecutor'
    av.x = 0; av.y = 0; av.region = 'surface'
    // a unit can only step onto a square that holds a site — lay benign sites on the origin
    // and both candidate step squares (Active Volcano = vanilla, no entry filter)
    for (const [x, y] of [[0, 0], [1, 0], [0, 1]] as const) placeSite(g, 0, 'Active Volcano', x, y)
    const evil = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); evil.enteredTurn = 0 // Monster = Evil, diagonally away
    expect(selfStepsCloser(g, av, evil).length, 'two legal steps close the gap').toBe(2)
    const zeal = getScript('Persecutor')!.abilities!.find((a) => a.key === 'zeal')!
    zeal.effect(makeCtx(g, av.id, 0, []))
    answer(g, 'steps toward the closest Evil')
    const p = g.prompts[0]
    expect(p?.kind, 'a real square choice, not steps[0]').toBe('chooseSquare')
    const squares = new Set((p!.data.squares as { x: number; y: number }[]).map((s) => `${s.x},${s.y}`))
    expect(squares).toEqual(new Set(['1,0', '0,1']))
    answer(g, { x: 1, y: 0 })
    expect([av.x, av.y]).toEqual([1, 0])
  })
})

describe('Maelström: the OWNER chooses each pull direction (opponent never prompted)', () => {
  it('prompts the Maelström owner — not the enemy minion\'s controller — when 2 squares both draw it closer', () => {
    const g = newGame(42, 0); keepBoth(g)
    const maw = placeSite(g, 0, 'Great Wall', 0, 0); maw.name = 'Maelström'; g.cards[maw.cardId].name = 'Maelström'; maw.flooded = true
    placeSite(g, 0, 'Great Wall', 1, 0).flooded = true
    placeSite(g, 0, 'Great Wall', 0, 1).flooded = true
    placeSite(g, 0, 'Great Wall', 1, 1).flooded = true
    const minion = summonCard(g, 1, 'Escyllion Cyclops', 1, 1); minion.enteredTurn = 0
    getScript('Maelström')!.startOfTurn!(makeCtx(g, maw.id, 0, []))
    answer(g, true) // yes, spin
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    expect(p?.player, 'the Maelström owner chooses, not the pulled minion\'s controller').toBe(0)
    const squares = new Set((p!.data.squares as { x: number; y: number }[]).map((s) => `${s.x},${s.y}`))
    expect(squares).toEqual(new Set(['1,0', '0,1']))
    answer(g, { x: 1, y: 0 })
    expect([g.units[minion.id].x, g.units[minion.id].y]).toEqual([1, 0])
  })
})
