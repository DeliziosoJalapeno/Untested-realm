// Blink on an OVERSIZED ally: 'An ally teleports to a location it's nearby.' A 2x2 ally is nearby every
// location nearby any of its four parts — not just its top-left anchor. The player picks the ANCHOR part,
// then a location nearby that part, then the rotation: the anchor part lands on the location.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, fillSites, castMagic, waiveThreshold } from './helpers'
import { getScript, validateTarget, occupiedSquares, oversizedTeleportPlacements, type GameState } from '../src'
import '../src/cards/scripts/index'

function board() {
  const g = newGame() as GameState; keepBoth(g); fillSites(g, 0); waiveThreshold(g, 0)
  const giant = summonCard(g, 0, 'Foot Soldier', 0, 0); giant.size = '2x2'; giant.enteredTurn = -1 // (0,0)-(1,1)
  return { g, giant, av: g.units[g.players[0].avatarUnitId] }
}
const sorted = (sq: { x: number; y: number }[]) => sq.map((s) => `${s.x},${s.y}`).sort()

describe('Blink: nearby an oversized ally', () => {
  it('a location nearby a NON-anchor part is legal; one nearby no part is not', () => {
    const { g, giant, av } = board()
    const spec = getScript('Blink')!.targets![1] as any
    const check = (x: number, y: number) => validateTarget(g, spec, { square: { x, y, region: 'surface' } } as any, av, 0, [{ unit: giant.id }] as any)
    expect(check(2, 2), '(2,2) is nearby the bottom-right part (1,1)').toBeNull()
    expect(check(3, 3), '(3,3) is nearby no part').toMatch(/nearby/)
  })

  it('the chosen anchor part lands on the location, in the chosen rotation', () => {
    const { g, giant } = board()
    const places = oversizedTeleportPlacements(g, giant, { x: 2, y: 2 }, { x: 1, y: 1 })
    const pick = places.find((p) => p.x === 2 && p.y === 2)! // the block whose top-left is (2,2)
    expect(pick, 'offered').toBeTruthy()
    castMagic(g, 0, 'Blink', { targets: [giant.id, 'sq:2,2,surface'], extra: { teleportPlace: { x: pick.x, y: pick.y, shape: pick.shape, from: pick.from } } })
    expect(sorted(occupiedSquares(giant))).toEqual(sorted([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }]))
  })

  it("an anchor the location isn't nearby is ignored — the default part that reaches it is used", () => {
    const { g, giant } = board()
    // (0,0) is two steps from (2,2): not a valid anchor for it
    castMagic(g, 0, 'Blink', { targets: [giant.id, 'sq:2,2,surface'], extra: { teleportPlace: { x: 2, y: 2, from: { x: 0, y: 0 } } } })
    const occ = sorted(occupiedSquares(giant))
    expect(occ).toContain('2,2')
    expect(occ, 'it moved').not.toEqual(sorted([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]))
  })

  it('no placement sent (the bot): the part that reaches the location anchors it', () => {
    const { g, giant } = board()
    castMagic(g, 0, 'Blink', { targets: [giant.id, 'sq:2,2,surface'] })
    expect(sorted(occupiedSquares(giant))).toContain('2,2')
  })
})
