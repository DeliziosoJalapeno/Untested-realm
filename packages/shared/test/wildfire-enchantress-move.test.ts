// Wildfire animated by the Enchantress is a MINION that IS the fire. When it MOVES, the fire's
// site-anchor (onSiteId) and its burned-sites record (counters) must follow — otherwise the
// end-of-turn re-derive snaps the aura back to the OLD site (off the creature) and moving it never
// scorches. Fixed in emitUnitMoved (site-anchored auras re-anchor + scorch on their creature's move).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { emitUnitMoved, getScript, makeCtx, type GameState, type UnitState } from '../src'
import '../src/cards/scripts/index'

function animatedWildfire(g: GameState) {
  const A = placeSite(g, 0, 'Rustic Village', 1, 1)
  const B = placeSite(g, 0, 'Rustic Village', 2, 1)
  const C = placeSite(g, 0, 'Rustic Village', 3, 1)
  // the Wildfire aura, anchored to site A and having burned A
  const acid = `cw${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Wildfire', owner: 0 }
  const wid = `w${g.nextId++}`
  ;(g.auras as any)[wid] = { id: wid, cardId: acid, name: 'Wildfire', controller: 0, squares: [{ x: 1, y: 1 }], onSiteId: A.id, counters: { [`s:${A.id}`]: 1 }, enteredTurn: -1 }
  // the animated creature that embodies it (Enchantress): a unit carrying `animatedAura`, +power so it
  // survives its own end-of-turn burn
  const ucid = `cu${g.nextId++}`; g.cards[ucid] = { id: ucid, name: 'Wildfire', owner: 0 }
  const uid = `u${g.nextId++}`
  const unit: UnitState = {
    id: uid, cardId: ucid, name: 'Wildfire', owner: 0, controller: 0, isAvatar: false, x: 1, y: 1, region: 'surface',
    tapped: false, damage: 0, enteredTurn: -1, modifiers: [{ kind: 'power', amount: 10, duration: 'permanent', turn: g.turn, sourcePlayer: 0 }],
    carrying: [], carryingUnits: [], usedThisTurn: {}, counters: { animatedAura: wid } as any,
  }
  g.units[uid] = unit
  return { g, unit, wid, A, B, C }
}

describe('Wildfire animated by the Enchantress: moving the creature drags the fire', () => {
  it('moving the creature re-anchors the fire to the new site AND scorches it', () => {
    const g = newGame() as GameState; keepBoth(g)
    const { unit, wid, B } = animatedWildfire(g)
    unit.x = 2 // walk from site A(1,1) to site B(2,1)
    emitUnitMoved(g, unit, { x: 1, y: 1, region: 'surface' }, 'move')
    const aura = (g.auras as any)[wid]
    expect(aura.squares, 'the aura followed the creature').toEqual([{ x: 2, y: 1 }])
    expect(aura.onSiteId, 're-anchored to the site now beneath it').toBe(B.id)
    expect(aura.counters[`s:${B.id}`], 'the new site is scorched (visited)').toBe(1)
  })

  it('after the move, the end-of-turn fire stays with the creature (does not snap back)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const { unit, wid, A, C } = animatedWildfire(g)
    unit.x = 2
    emitUnitMoved(g, unit, { x: 1, y: 1, region: 'surface' }, 'move') // now at site B(2,1)
    getScript('Wildfire')!.endOfEveryTurn!(makeCtx(g, wid, 0, []))
    const aura = (g.auras as any)[wid]
    expect(aura, 'the fire survived (creature has +10 power)').toBeTruthy()
    expect(aura.squares, 'the fire burned at the creature\'s site (2,1), not the old (1,1)').toEqual([{ x: 2, y: 1 }])
    // it now spreads to an adjacent UNVISITED site: C(3,1) is eligible, the visited A(1,1) is not
    const p = g.prompts[0] as any
    expect(p?.kind).toBe('chooseSquare')
    const sqs = p.data.squares as { x: number; y: number }[]
    expect(sqs).toContainEqual({ x: C.x, y: C.y })
    expect(sqs.some((s) => s.x === A.x && s.y === A.y), 'the already-burned site is not offered').toBe(false)
  })
})
