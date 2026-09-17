// Sphere of Animosity: "Avatars here can't leave, heal, or be defended." A trapped avatar
// CAN still move between the sphere's own locations — only stepping OUT of the 2x2 area is
// forbidden. This locks in both halves so neither over- nor under-restricts.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { avatarOf, applyAction, type GameState } from '../src'
import '../src/cards/scripts/index'

function sphere(g: any, squares: { x: number; y: number }[], controller = 1) {
  const cid = `ac${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Sphere of Animosity', owner: controller }
  const id = `r${g.nextId++}`
  g.auras[id] = { id, cardId: cid, name: 'Sphere of Animosity', controller, squares, anchor: squares[0], enteredTurn: 0 }
}

function trapped(): GameState {
  const g: GameState = newGame(); keepBoth(g); g.turn = 3
  const av = avatarOf(g, 0); av.x = 1; av.y = 1; av.tapped = false; av.enteredTurn = -5
  // sites on the whole 2x2 plus an escape square (0,1) so the ONLY reason a step fails is the trap
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2], [0, 1]] as const) placeSite(g, 0, 'Spire', x, y)
  sphere(g, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }])
  return g
}

describe('Sphere of Animosity — a trapped avatar moves WITHIN the area but can’t leave', () => {
  it('a step to another square of the sphere succeeds', () => {
    const g = trapped()
    const r = applyAction(g, 0, { t: 'moveAttack', unitId: avatarOf(g, 0).id, path: [{ x: 2, y: 1, region: 'surface' }] } as any)
    expect(r.ok).toBe(true)
    expect([avatarOf(g, 0).x, avatarOf(g, 0).y], 'the avatar moved within the sphere').toEqual([2, 1])
  })

  it('a step OUT of the sphere is refused — the avatar stays put', () => {
    const g = trapped()
    applyAction(g, 0, { t: 'moveAttack', unitId: avatarOf(g, 0).id, path: [{ x: 0, y: 1, region: 'surface' }] } as any)
    expect([avatarOf(g, 0).x, avatarOf(g, 0).y], 'held fast — no escape').toEqual([1, 1])
  })
})
