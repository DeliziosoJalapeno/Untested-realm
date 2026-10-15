// An animated aura reverts to a mere enchantment at the start of the animator's NEXT turn. This is a
// property of the animation (flow.auraAnimations), de-animated centrally in beginTurn — so it works
// even when NO Enchantress is in play (she left the realm, or a masked IMPOSTER did the animating and
// its forwarded hooks never included the de-animator). Reported: a Wildfire animated by a masked
// Imposter never de-animated.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { beginTurn, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

/** an animated Wildfire minion + its underlying aura, flagged as animated by `player` on `turn`. */
function animated(g: GameState, player: 0 | 1, turn: number) {
  placeSite(g, player, 'Rustic Village', 1, 1)
  const acid = `cw${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Wildfire', owner: player }
  const wid = `w${g.nextId++}`
  ;(g.auras as any)[wid] = { id: wid, cardId: acid, name: 'Wildfire', controller: player, squares: [{ x: 1, y: 1 }], enteredTurn: -1 }
  const ucid = `cu${g.nextId++}`; g.cards[ucid] = { id: ucid, name: 'Wildfire', owner: player }
  const uid = `u${g.nextId++}`
  const unit: UnitState = {
    id: uid, cardId: ucid, name: 'Wildfire', owner: player, controller: player, isAvatar: false, x: 1, y: 1, region: 'surface',
    tapped: false, damage: 0, enteredTurn: -1, modifiers: [{ kind: 'power', amount: 10, duration: 'permanent', turn, sourcePlayer: player }],
    carrying: [], carryingUnits: [], usedThisTurn: {}, counters: { animatedAura: wid } as any,
  }
  g.units[uid] = unit
  g.flow = g.flow ?? {}
  ;(g.flow as any).auraAnimations = [...((g.flow as any).auraAnimations ?? []), { unitId: uid, player, turn }]
  return { unit, wid, uid }
}

describe('animated auras de-animate centrally (works without an Enchantress / via Imposter)', () => {
  it('a Wildfire animated by a now-gone animator reverts at the start of the animator’s next turn', () => {
    const g = newGame() as GameState; keepBoth(g)
    g.turn = 3; g.activePlayer = 1
    const { uid, wid } = animated(g, 0, 3) // animated by player 0 on turn 3 — NO Enchantress in play

    beginTurn(g, 0) // player 0's next turn begins

    expect(g.units[uid], 'the animated minion dissolved').toBeUndefined()
    expect(g.auras[wid], 'the Wildfire aura persists (reverted, not destroyed)').toBeTruthy()
    expect((g.flow as any).auraAnimations.length, 'the animation record is consumed').toBe(0)
  })

  it('does NOT revert on the OPPONENT’s turn — only the animator’s own next turn', () => {
    const g = newGame() as GameState; keepBoth(g)
    g.turn = 3; g.activePlayer = 0
    const { uid } = animated(g, 0, 3) // animated by player 0

    beginTurn(g, 1) // the OPPONENT's turn starts first

    expect(g.units[uid], 'still animated during the opponent’s turn').toBeTruthy()
    expect((g.flow as any).auraAnimations.length, 'the record is kept until the animator’s turn').toBe(1)
  })
})
