// Kairos the Archivist restores an aura with its anchor (2x2) and border (wall), not just its squares —
// otherwise a Thunderstorm that drifted after the archive comes back with its OLD squares but its NEW
// anchor, and an Enchantress later animates it a step (or a diagonal) away from where it really is.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, fillSites, summonCard } from './helpers'
import { makeCtx, getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

const archive = (g: GameState, kId: string) => getScript('Kairos the Archivist')!.genesis!(makeCtx(g, kId, 0, []))
const restore = (g: GameState, kId: string) => getScript('Kairos the Archivist')!.deathrite!(makeCtx(g, kId, 0, []))
const sq2 = (x: number, y: number) => [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }]

describe('Kairos restores aura anchors and borders', () => {
  it('a drifted Thunderstorm comes back with its archived anchor', () => {
    const g: any = newGame(); keepBoth(g); fillSites(g)
    g.cards.cts = { id: 'cts', name: 'Thunderstorm', owner: 0 }
    g.auras.ts = { id: 'ts', cardId: 'cts', name: 'Thunderstorm', controller: 0, squares: sq2(1, 1), anchor: { x: 1, y: 1 }, counters: { turns: 3 } }
    const kairos = summonCard(g, 0, 'Kairos the Archivist', 0, 0); kairos.enteredTurn = -1
    archive(g, kairos.id)
    getScript('Thunderstorm')!.conts!.drift(makeCtx(g, 'ts', 0, []), {}, 'east')
    getScript('Thunderstorm')!.conts!.drift(makeCtx(g, 'ts', 0, []), {}, 'north')
    expect(g.auras.ts.anchor).toEqual({ x: 2, y: 2 })
    restore(g, kairos.id)
    const r: any = Object.values(g.auras).find((a: any) => a.cardId === 'cts')
    expect(r.squares).toEqual(sq2(1, 1))
    expect(r.anchor, 'anchor restored with the squares').toEqual({ x: 1, y: 1 })
  })

  it('a wall keeps its archived border', () => {
    const g: any = newGame(); keepBoth(g); fillSites(g)
    g.cards.cw = { id: 'cw', name: 'Wall of Ice', owner: 0 }
    g.auras.w = { id: 'w', cardId: 'cw', name: 'Wall of Ice', controller: 0, squares: [{ x: 1, y: 1 }, { x: 2, y: 1 }], edge: { a: { x: 1, y: 1 }, b: { x: 2, y: 1 } } }
    const kairos = summonCard(g, 0, 'Kairos the Archivist', 0, 0); kairos.enteredTurn = -1
    archive(g, kairos.id)
    g.auras.w.squares = [{ x: 3, y: 1 }, { x: 4, y: 1 }]
    g.auras.w.edge = { a: { x: 3, y: 1 }, b: { x: 4, y: 1 } }
    restore(g, kairos.id)
    const r: any = Object.values(g.auras).find((a: any) => a.cardId === 'cw')
    expect(r.edge).toEqual({ a: { x: 1, y: 1 }, b: { x: 2, y: 1 } })
  })
})
