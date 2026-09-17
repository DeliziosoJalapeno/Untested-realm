// Magellan Globe wraps opposite edges. An Airborne unit steps diagonally, so from a corner it can
// fly DIRECTLY to the opposite corner in one wrap step (FAQ 6). A grounded unit only wraps orthogonally.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { isLegalStep } from '../src/engine/movement'
import { GRID_W, GRID_H } from '../src/engine/grid'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

function withGlobe(g: GameState) {
  const cid = `cglobe${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
  const aid = `aglobe${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
}

const S = (x: number, y: number) => ({ x, y, region: 'surface' as const })

describe('Magellan Globe — Airborne diagonal wrap', () => {
  it('an Airborne unit at a corner may fly to the opposite corner in one step (with the Globe)', () => {
    const g = newGame(); keepBoth(g)
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) placeSite(g, 0, 'Rustic Village', x, y)
    withGlobe(g)
    const flyer = summonCard(g, 0, 'Cloud Spirit', 0, 0); flyer.enteredTurn = -1 // Airborne
    expect(isLegalStep(g, flyer, S(0, 0), S(GRID_W - 1, GRID_H - 1)), 'corner→opposite corner diagonal wrap').toBe(true)
  })

  it('WITHOUT the Globe there is no wrap step', () => {
    const g = newGame(); keepBoth(g)
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) placeSite(g, 0, 'Rustic Village', x, y)
    const flyer = summonCard(g, 0, 'Cloud Spirit', 0, 0); flyer.enteredTurn = -1
    expect(isLegalStep(g, flyer, S(0, 0), S(GRID_W - 1, GRID_H - 1)), 'no Globe → no wrap').toBe(false)
  })

  it('a GROUNDED unit only wraps orthogonally, not diagonally', () => {
    const g = newGame(); keepBoth(g)
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) placeSite(g, 0, 'Rustic Village', x, y)
    withGlobe(g)
    const walker = summonCard(g, 0, 'Bone Jumble', 0, 0); walker.enteredTurn = -1 // grounded
    expect(isLegalStep(g, walker, S(0, 0), S(GRID_W - 1, 0)), 'orthogonal wrap allowed').toBe(true)
    expect(isLegalStep(g, walker, S(0, 0), S(GRID_W - 1, GRID_H - 1)), 'grounded gets no diagonal wrap').toBe(false)
  })
})
