// Wildfire is a surface fire — a burrowed/submerged (subsurface) unit sharing its square is NOT burned.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx, siteAt, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Wildfire burns only the surface', () => {
  it('a burrowed unit is unharmed while a surface unit at the same square takes 3', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2) // a land site (so the burrowed unit can exist underground)
    const surf = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); surf.enteredTurn = -1 // 6/6 — survives 3
    const under = summonCard(g, 0, 'Bone Jumble', 2, 2, 'underground'); under.enteredTurn = -1
    under.modifiers.push({ kind: 'keyword', keyword: 'burrowing', duration: 'permanent', turn: g.turn, sourcePlayer: 0 })

    // a Wildfire roaming at (2,2)
    const acid = `cw${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Wildfire', owner: 0 }
    const wid = `w${g.nextId++}`
    const wfSite = siteAt(g, 2, 2)!
    ;(g.auras as any)[wid] = { id: wid, cardId: acid, name: 'Wildfire', controller: 0, squares: [{ x: 2, y: 2 }], onSiteId: wfSite.id, counters: { [`s:${wfSite.id}`]: 1 }, enteredTurn: 0 }

    getScript('Wildfire')!.endOfEveryTurn!(makeCtx(g, wid, 0, []))
    expect(g.units[surf.id]?.damage, 'the surface unit is burned for 3').toBe(3)
    expect(g.units[under.id]?.damage ?? 0, 'the burrowed unit underground is untouched').toBe(0)
  })
})
