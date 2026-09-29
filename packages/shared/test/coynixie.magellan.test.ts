// Coy Nixie forces a nearby enemy to "take a step towards her". Under a Magellan Globe the realm's
// opposite edges are joined, so the step generator must be topologically wrap-aware: an enemy at the
// far edge steps ACROSS the border toward the Nixie, exactly as its target-eligibility already does.
// Regression — selfStepsToward used raw (non-wrapped) neighbours + distance, so the cross-border step
// was never offered or forced. Canary for the general self-/forced-step wrapping.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { selfStepsCloser } from '../src/engine/movement'
import { getScript, makeCtx, GRID_W, GRID_H, type GameState } from '../src'
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

describe('Coy Nixie forced step is Magellan-aware', () => {
  it('selfStepsCloser offers the cross-border step only with the Globe', () => {
    const g = newGame() as GameState; keepBoth(g); fullBoard(g)
    const nixie = summonCard(g, 0, 'Coy Nixie', 0, 1); nixie.enteredTurn = -1
    const foe = summonCard(g, 1, 'Bone Jumble', GRID_W - 1, 1); foe.enteredTurn = -1 // far x-edge, same row

    const without = selfStepsCloser(g, foe, nixie)
    expect(without.some((s) => s.x === 0 && s.y === 1), 'no Globe → no wrap step').toBe(false)

    withGlobe(g)
    const withG = selfStepsCloser(g, foe, nixie)
    expect(withG.some((s) => s.x === 0 && s.y === 1), 'Globe → the wrap step toward the Nixie is offered').toBe(true)
  })

  it('beckoning actually drags the enemy across the wrapped border', () => {
    const g = newGame() as GameState; keepBoth(g); fullBoard(g); withGlobe(g)
    const nixie = summonCard(g, 0, 'Coy Nixie', 0, 1); nixie.enteredTurn = -1
    const foe = summonCard(g, 1, 'Bone Jumble', GRID_W - 1, 1); foe.enteredTurn = -1
    // exactly one legal step is closer (the wrap onto the Nixie's square) → forced with no prompt
    getScript('Coy Nixie')!.abilities![0].effect(makeCtx(g, nixie.id, 0, [{ unit: foe.id }]))
    expect(g.units[foe.id]?.x, 'the enemy stepped across the border').toBe(0)
    expect(g.units[foe.id]?.y).toBe(1)
    expect(g.units[foe.id]?.tapped, '"Tap that enemy"').toBe(true)
  })
})
