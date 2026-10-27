// Troll Bridge: 'The first time a lone enemy enters here each turn, strike it unless they discard a card.'
// FAQ: a "lone enemy" is one "not entering simultaneously with another enemy unit. Stationary units at
// the Troll Bridge [are] ignored." Its three examples:
//   · an enemy War Horse carrying its Avatar → two enemies enter together → no toll
//   · your Bodach Bogeyman carrying ONE enemy → toll (carrying two → no toll)
//   · an enemy already on the bridge, another enemy enters → toll (it used to be cancelled)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, fillSites } from './helpers'
import { getScript, makeCtx, pickUp, type GameState } from '../src'
import '../src/cards/scripts/index'

const TOLL = 'script:Troll Bridge:toll'
const tollAsked = (g: GameState) => g.prompts.some((p) => p.cont === TOLL)

function board() {
  const g = newGame() as GameState; keepBoth(g); fillSites(g, 0)
  // replace the square below player 0's avatar with player 1's Troll Bridge
  const av = g.units[g.players[0].avatarUnitId]
  const at = { x: av.x, y: av.y + 1 }
  for (const s of Object.values(g.sites)) if (s.x === at.x && s.y === at.y) delete g.sites[s.id]
  const bridge = placeSite(g, 1, 'Troll Bridge', at.x, at.y)
  return { g, av, bridge, at }
}
/** fire the bridge's entry trigger for `unitId` arriving from (fx, fy) */
const enter = (g: GameState, bridgeId: string, unitId: string, from: { x: number; y: number }) =>
  getScript('Troll Bridge')!.onUnitEntersSquare!(makeCtx(g, bridgeId, 1, []), g.units[unitId], { ...from, region: 'surface' } as any)

describe('Troll Bridge: lone enemies', () => {
  it('a War Horse carrying its Avatar is not a lone enemy — no toll', () => {
    const { g, av, at } = board()
    const horse = summonCard(g, 0, 'War Horse', av.x, av.y); horse.enteredTurn = -1
    expect(pickUp(g, 0, horse.id, [], [av.id])).toBeNull()
    act(g, 0, { t: 'moveAttack', unitId: horse.id, path: [{ x: at.x, y: at.y, region: 'surface' }] })
    expect(g.units[horse.id].y, 'the horse crossed onto the bridge').toBe(at.y)
    expect(tollAsked(g)).toBe(false)
  })

  it('a War Horse entering ALONE is charged', () => {
    const { g, av, at } = board()
    const horse = summonCard(g, 0, 'War Horse', av.x, av.y); horse.enteredTurn = -1
    act(g, 0, { t: 'moveAttack', unitId: horse.id, path: [{ x: at.x, y: at.y, region: 'surface' }] })
    expect(tollAsked(g)).toBe(true)
  })

  it('an enemy already on the bridge does not stop the toll for another entering enemy', () => {
    const { g, av, bridge, at } = board()
    summonCard(g, 0, 'Bone Jumble', at.x, at.y).enteredTurn = -1 // stationary enemy already there
    const mover = summonCard(g, 0, 'Bone Jumble', av.x, av.y); mover.enteredTurn = -1
    mover.x = at.x; mover.y = at.y
    enter(g, bridge.id, mover.id, { x: av.x, y: av.y })
    expect(tollAsked(g)).toBe(true)
  })

  it("the bridge owner's carrier bringing ONE enemy: toll; bringing TWO: none", () => {
    for (const [n, expected] of [[1, true], [2, false]] as const) {
      const { g, bridge, at } = board()
      const carrier = summonCard(g, 1, 'Bone Jumble', at.x, at.y)
      const enemies = Array.from({ length: n }, () => summonCard(g, 0, 'Bone Jumble', at.x, at.y))
      carrier.carryingUnits = enemies.map((e) => e.id)
      for (const e of enemies) e.carriedBy = carrier.id
      enter(g, bridge.id, enemies[0].id, { x: at.x + 1, y: at.y })
      expect(tollAsked(g), `${n} enemy carried`).toBe(expected)
    }
  })
})
