// A rigid multi-square body (an Enchantress wall, a Rack-stretched unit, a moeba blob — any unit whose extra
// parts live in `extraSquares`) moved by ANY teleport or push keeps its shape: every part is relaid around
// the new anchor, not only the anchor moved. (teleportBody used to relay parts only when a `shape` was passed.)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, castMagic, answer, fillSites, waiveThreshold } from './helpers'
import { occupiedSquares, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame() as GameState
  keepBoth(g)
  fillSites(g)
  waiveThreshold(g, 0)
  return g
}

describe('teleport / push of a rigid extraSquares body', () => {
  it('Windblast pushes a 2x1 body one step: both parts move', () => {
    const g = board()
    const body = summonCard(g, 1, 'Bone Jumble', 1, 1)
    body.extraSquares = [{ x: 2, y: 1, region: 'surface' }]
    castMagic(g, 0, 'Windblast')
    answer(g, 'north')
    expect([body.x, body.y]).toEqual([1, 2])
    expect(occupiedSquares(body)).toEqual([{ x: 1, y: 2 }, { x: 2, y: 2 }])
  })

  it('a genuine teleport (no shape given) relays the parts around the new anchor', () => {
    const g = board()
    const body = summonCard(g, 0, 'Bone Jumble', 0, 0)
    body.extraSquares = [{ x: 0, y: 1, region: 'surface' }]
    // a relocation through the shared ctx.teleport, no shape (Springstem Meadow, Blink without a placement…)
    makeCtx(g, '', 0, []).teleport(body.id, 3, 1, 'surface')
    expect([body.x, body.y]).toEqual([3, 1])
    expect(occupiedSquares(body)).toEqual([{ x: 3, y: 1 }, { x: 3, y: 2 }])
  })
})
