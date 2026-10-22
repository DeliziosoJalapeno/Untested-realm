// Blink on an OVERSIZED ally, through the UI: pick the ally, then WHICH of its squares anchors the
// teleport, then a location nearby that part, then the rotation. The anchor part lands on the location.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { inject as cinject, sweepBoardBase } from './domaudit'
import { hotseatViewpoint } from '../src/App'
import { GRID_W, GRID_H, occupiedSquares } from '@sorcery/shared'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

const hl = (root: HTMLElement) => [...root.querySelectorAll('[data-hl]')].map((e) => e.getAttribute('data-sq')!).sort()

describe('Blink an oversized ally (DOM)', () => {
  it('anchor part → nearby location → rotation', () => {
    const g = sweepBoardBase() as any
    const me = hotseatViewpoint(g)
    // every square sited, so any footprint is legal
    for (let x = 0; x < GRID_W; x++) for (let y = 0; y < GRID_H; y++) {
      if (Object.values(g.sites).some((s: any) => s.x === x && s.y === y)) continue
      const cid = `cfill${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Rustic Village', owner: me }
      const sid = `s${g.nextId++}`; g.sites[sid] = { id: sid, cardId: cid, name: 'Rustic Village', owner: me, controller: me, x, y, tapped: false, isRubble: false }
    }
    for (const u of Object.values(g.units) as any[]) if (!u.isAvatar) delete g.units[u.id]
    const av = g.units[g.players[me].avatarUnitId]; av.x = 4; av.y = 0
    const cid = `cgiant${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Foot Soldier', owner: me }
    g.units['u900'] = { id: 'u900', cardId: cid, name: 'Foot Soldier', owner: me, controller: me, isAvatar: false, size: '2x2', x: 0, y: 0, region: 'surface', tapped: false, damage: 0, enteredTurn: -1, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} }
    cinject(g, me, 'Blink'); g.players[me].mana = 20

    const h = new GameHarness(g).mount(); active = h
    const root = h.container
    h.click(root.querySelector('[data-hand][data-card="Blink"]') as HTMLElement); h.rerender()
    h.click(root.querySelector('[data-unit="u900"]') as HTMLElement); h.rerender()

    // step 1: which part anchors it — its four squares glow
    expect(root.querySelector('[data-modebanner="magic"]')?.textContent).toContain('Which part')
    expect(hl(root)).toEqual(['0,0', '0,1', '1,0', '1,1'])
    h.click(root.querySelector('[data-sq="1,1"]') as HTMLElement); h.rerender()

    // step 2: only locations nearby the bottom-right part (1,1) — (2,2) is offered, (0,0)'s far side isn't
    const dests = hl(root)
    expect(dests).toContain('2,2')
    expect(dests.every((k) => { const [x, y] = k.split(',').map(Number); return Math.abs(x - 1) <= 1 && Math.abs(y - 1) <= 1 })).toBe(true)
    h.click(root.querySelector('[data-sq="2,2"]') as HTMLElement); h.rerender()

    // step 3: rotation — cycle until the block lands at (2,2)-(3,3), then place it
    expect(root.querySelector('[data-modebanner="teleportPlace"]'), 'the rotation picker opens').toBeTruthy()
    for (let i = 0; i < 4 && hl(root).join(' ') !== '2,2 2,3 3,2 3,3'; i++) {
      h.click(root.querySelector('[title="Next orientation"]') as HTMLElement); h.rerender()
    }
    h.click(root.querySelector('[data-confirm="1"]') as HTMLElement); h.rerender()

    expect(h.drifts, 'the engine accepted the cast').toEqual([])
    const giant = h.state.units['u900']
    expect(occupiedSquares(giant).map((s) => `${s.x},${s.y}`).sort()).toEqual(['2,2', '2,3', '3,2', '3,3'])
  })
})
