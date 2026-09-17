// FAQ 5: with Magellan Globe in play, more 2x2 AREA effects (Corpse Explosion, Whirlwind)
// may be anchored on the edge — the picker offers edge anchors and the area wraps.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, waiveThreshold } from './helpers'
import { GRID_W, GRID_H, type GameState } from '../src'
import '../src/cards/scripts/index'

function withGlobe(g: GameState) {
  const cid = `cglobe${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
  const aid = `aglobe${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
}

function fullBoard(g: GameState) {
  for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) placeSite(g, 0, 'Rustic Village', x, y)
}

// Corpse Explosion needs a dead minion in the caster's cemetery, or its onCast returns early.
function seedCorpse(g: GameState) {
  const cid = `ccorpse${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Bone Jumble', owner: 0 } as any
  g.players[0].cemetery.push(cid)
}

describe('Magellan Globe — Corpse Explosion edge anchor (FAQ 5)', () => {
  it('offers an edge anchor whose 2x2 wraps, with the Globe in play', () => {
    const g = newGame(); keepBoth(g); fullBoard(g); seedCorpse(g); withGlobe(g)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Corpse Explosion')
    const p = g.prompts[0] as any
    expect(p?.kind).toBe('chooseSquare')
    expect(p?.data?.area2x2).toBe(true)
    expect(p.data.squares, 'a last-column edge anchor is offered').toContainEqual({ x: GRID_W - 1, y: 1 })
    expect(p.data.squares, 'a bottom-row edge anchor is offered').toContainEqual({ x: 1, y: GRID_H - 1 })
  })

  it('does NOT offer edge anchors without the Globe', () => {
    const g = newGame(); keepBoth(g); fullBoard(g); seedCorpse(g)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Corpse Explosion')
    const p = g.prompts[0] as any
    expect(p.data.squares.every((s: any) => s.x < GRID_W - 1 && s.y < GRID_H - 1), 'all anchors fit inside the realm').toBe(true)
  })
})

describe('Magellan Globe — Whirlwind edge anchor (FAQ 5)', () => {
  it('offers an edge anchor whose 2x2 wraps, with the Globe in play', () => {
    const g = newGame(); keepBoth(g); fullBoard(g); withGlobe(g)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Whirlwind')
    const p = g.prompts[0] as any
    expect(p?.kind).toBe('chooseSquare')
    expect(p.data.squares, 'a last-column edge anchor is offered').toContainEqual({ x: GRID_W - 1, y: 1 })
    expect(p.data.squares, 'a bottom-row edge anchor is offered').toContainEqual({ x: 1, y: GRID_H - 1 })
  })

  it('does NOT offer edge anchors without the Globe', () => {
    const g = newGame(); keepBoth(g); fullBoard(g)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Whirlwind')
    const p = g.prompts[0] as any
    expect(p.data.squares.every((s: any) => s.x < GRID_W - 1 && s.y < GRID_H - 1), 'all anchors fit inside the realm').toBe(true)
  })
})
