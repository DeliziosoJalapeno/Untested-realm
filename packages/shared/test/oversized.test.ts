import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { emitUnitMoved, occupiedSquares, beginAttack, type GameState, type PlayerId } from '../src'

function injectAura(g: GameState, name: string, o: { squares: { x: number; y: number }[]; anchor?: { x: number; y: number }; edge?: any }): string {
  const cardId = `ac${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name, owner: 0 }
  const id = `r${g.nextId++}`
  ;(g.auras as any)[id] = { id, cardId, name, controller: 0, squares: o.squares, anchor: o.anchor, edge: o.edge, enteredTurn: 1 }
  return id
}
function auraMinion(g: GameState, name: string, auraId: string, x: number, y: number, extra: Partial<{ size: '2x2'; extraSquares: any[] }> = {}) {
  const u = summonCard(g, 0, name, x, y)
  u.counters = { ...u.counters, animatedAura: auraId as any }
  if (extra.size) u.size = extra.size
  if (extra.extraSquares) u.extraSquares = extra.extraSquares
  return u
}

describe('Enchantress aura minion drags its aura area as it moves', () => {
  it('a 2x2 aura minion: the aura anchor + squares follow the block', () => {
    const g = newGame(); keepBoth(g)
    const r = injectAura(g, 'Eclipse', { squares: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }], anchor: { x: 1, y: 1 } })
    const u = auraMinion(g, 'Eclipse', r, 1, 1, { size: '2x2' })
    const from = { x: 1, y: 1, region: 'surface' as const }
    u.x = 2; u.y = 1 // shifted one step east
    emitUnitMoved(g, u, from)
    expect(g.auras[r].anchor).toEqual({ x: 2, y: 1 })
    expect(g.auras[r].squares).toEqual(occupiedSquares(u))
  })

  it('a single-site aura minion: the aura square follows it', () => {
    const g = newGame(); keepBoth(g)
    const r = injectAura(g, 'Wildfire', { squares: [{ x: 2, y: 2 }] })
    const u = auraMinion(g, 'Wildfire', r, 2, 2)
    const from = { x: 2, y: 2, region: 'surface' as const }
    u.x = 3; u.y = 2
    emitUnitMoved(g, u, from)
    expect(g.auras[r].squares).toEqual([{ x: 3, y: 2 }])
  })
})

describe('Oversized (2x2) units attack across their whole footprint', () => {
  const foot2x2 = (g: GameState, x: number, y: number) => {
    const u = summonCard(g, 0, 'Foot Soldier', x, y); u.size = '2x2'; u.enteredTurn = -1
    return u
  }
  it('a 2x2 attacker can strike an enemy in a NON-bottom-left square of its footprint', () => {
    const g = newGame(); keepBoth(g)
    for (const s of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) placeSite(g, 0, 'Spire', s[0], s[1])
    const atk = foot2x2(g, 1, 1) // occupies (1,1),(2,1),(1,2),(2,2)
    const foe = summonCard(g, 1, 'Foot Soldier', 2, 2) // top-right of the footprint
    expect(beginAttack(g, atk, { unit: foe.id })).toBeNull()
  })
  it('an enemy OUTSIDE the footprint is not reachable in place', () => {
    const g = newGame(); keepBoth(g)
    for (const s of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) placeSite(g, 0, 'Spire', s[0], s[1])
    const atk = foot2x2(g, 1, 1)
    const far = summonCard(g, 1, 'Foot Soldier', 4, 3) // nowhere near the block
    expect(beginAttack(g, atk, { unit: far.id })).not.toBeNull()
  })
})
