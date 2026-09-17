// FAQ 2: with Magellan Globe in play, a damage-GRID spell spans the edges of the realm — cells that
// run off the board wrap to the opposite side (shared `resolveCells`, so Lava Flow / Cone of Flame /
// Firebreathing / Craterize all benefit). Without the Globe those cells are clipped, as before.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { areaDamagePreview } from '../src/cards/scripts/registry'
import { GRID_W, type GameState } from '../src'
import '../src/cards/scripts/index'

function withGlobe(g: GameState) {
  const cid = `cglobe${g.nextId++}`
  g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
  const aid = `aglobe${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
}
// fire 'n' from the east edge: the flame's east-spread arm (dx=+1) runs off the east edge
const preview = (g: GameState, casterId: string) => areaDamagePreview(g, 'Firebreathing', casterId, { direction: 'n' } as any)!.cells

describe('Magellan Globe — damage grid wraps the edge (FAQ 2)', () => {
  it('a cell that runs off the east edge wraps to the west edge under the Globe', () => {
    const g = newGame(); keepBoth(g)
    const caster = summonCard(g, 0, 'Bone Jumble', GRID_W - 1, 1); caster.enteredTurn = -1 // on the east edge
    withGlobe(g)
    expect(preview(g, caster.id).some((c) => c.x === 0), 'a cell wrapped onto the west (x=0) edge').toBe(true)
  })

  it('without the Globe the off-edge cell is clipped', () => {
    const g = newGame(); keepBoth(g)
    const caster = summonCard(g, 0, 'Bone Jumble', GRID_W - 1, 1); caster.enteredTurn = -1
    expect(preview(g, caster.id).some((c) => c.x === 0), 'no wrap → nothing on the far edge').toBe(false)
  })
})
