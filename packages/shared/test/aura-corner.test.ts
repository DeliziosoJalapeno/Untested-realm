// A 2x2 aura's area must FULLY FIT in the realm. A corner/edge-overhanging anchor is legal ONLY when a
// Magellan Globe connects the edges (the area wraps around to the far side). Same rule the effect-cast
// path and Earthquake already use.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, injectToHand, giveMana, waiveThreshold, act, actFail } from './helpers'
import { GRID_W, GRID_H, type GameState } from '../src'
import '../src/cards/scripts/index'

function withGlobe(g: GameState) {
  const cid = `cglobe${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
  const aid = `aglobe${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
}

const castAura = (g: GameState, name: string, x: number, y: number) => {
  const cardId = injectToHand(g, 0, name)
  giveMana(g, 0, 20); waiveThreshold(g, 0)
  return { t: 'castSpell' as const, cardId, casterId: g.players[0].avatarUnitId, at: { x, y } }
}

describe('2x2 aura corners require a Magellan Globe', () => {
  it('rejects an edge-overhanging anchor without a Globe', () => {
    const g = newGame() as GameState; keepBoth(g)
    expect(actFail(g, 0, castAura(g, 'Flood', GRID_W - 1, GRID_H - 1))).toMatch(/fit inside the realm/i)
  })

  it('accepts a fully-fitting anchor without a Globe', () => {
    const g = newGame() as GameState; keepBoth(g)
    expect(() => act(g, 0, castAura(g, 'Flood', 0, 0))).not.toThrow()
  })

  it('accepts a corner anchor WITH a Magellan Globe (it wraps around)', () => {
    const g = newGame() as GameState; keepBoth(g); withGlobe(g)
    expect(() => act(g, 0, castAura(g, 'Flood', GRID_W - 1, GRID_H - 1))).not.toThrow()
  })
})
