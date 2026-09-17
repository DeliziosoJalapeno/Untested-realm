// The board animations all play IN-TILE now: death and teleport-out ride a real card-sized `.unit`
// (an .anim-ghost) sitting in the exact slot the card held, and a mid-walk card is the live UnitChip
// relocated square-by-square with `.anim-move` — none of them are full-square overlays anymore. This
// keeps each animation exactly card-sized and defers the sibling reflow until it finishes.
import { describe, it, expect, afterEach } from 'vitest'
import { board, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('board animations', () => {
  it('death fade is an in-tile card ghost where the removed unit stood', () => {
    const g = board(); g.prompts = []
    const id = usummon(g, 0, 'Bone Jumble', 2, 2)
    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector(`[data-unit="${id}"]`), 'unit renders first').toBeTruthy()
    delete (h.state as GameState).units[id] // it leaves the realm
    h.rerender()
    // fades in its own tile, INSIDE a .units container (card-sized) — not a full-square overlay
    expect(h.container.querySelector('.units .unit.anim-death'), 'an in-tile fading ghost appears').toBeTruthy()
    expect(h.container.querySelector('.death-fade'), 'no full-square death overlay anymore').toBeFalsy()
  })

  it('a mid-walk card is a self-contained in-tile ghost (no floating overlay); the real chip is hidden', () => {
    const g = board(); g.prompts = []
    const id = usummon(g, 0, 'Bone Jumble', 0, 1)
    const h = new GameHarness(g).mount(); active = h
    const s = h.state as GameState
    s.flow = s.flow ?? {}
    ;(s.flow as any).moveSeq = 1
    ;(s.flow as any).moveAnim = [{ unitId: id, name: 'Bone Jumble', squares: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], seq: 1 }]
    h.rerender()
    expect(h.container.querySelector('.move-chip'), 'no floating chip overlay anymore').toBeFalsy()
    // the walk is a ghost built from the RECORD (so it plays even if the unit died); the real chip is hidden
    expect(h.container.querySelector('.units .unit.anim-move'), 'an in-tile walk ghost renders').toBeTruthy()
    expect(h.container.querySelector(`[data-unit="${id}"]`), 'the real chip is hidden while the ghost walks').toBeFalsy()
  })

  it('teleport: destination square glows and the card zaps out of its old tile', () => {
    const g = board(); g.prompts = []
    const id = usummon(g, 0, 'Bone Jumble', 2, 2)
    const h = new GameHarness(g).mount(); active = h
    const s = h.state as GameState
    s.flow = s.flow ?? {}
    ;(s.flow as any).teleSeq = 1
    ;(s.flow as any).teleportAnim = [{ unitId: id, name: 'Bone Jumble', from: { x: 0, y: 0 }, to: { x: 2, y: 2 }, seq: 1 }]
    h.rerender()
    expect(h.container.querySelector('.tele-glow'), 'destination glow renders').toBeTruthy()
    expect(h.container.querySelector('.units .unit.anim-teleout'), 'an in-tile zap ghost renders at the old square').toBeTruthy()
    expect(h.container.querySelector('.tele-zap'), 'no full-square zap overlay anymore').toBeFalsy()
  })

  it('teleporting an AVATAR also zaps out (Blink/Teleport on your own avatar)', () => {
    const g = board(); g.prompts = []
    const av = g.players[0].avatarUnitId
    const h = new GameHarness(g).mount(); active = h // prevUnitsRef captures the avatar at its square
    const s = h.state as GameState
    const from = { x: s.units[av].x, y: s.units[av].y }
    s.flow = s.flow ?? {}
    ;(s.flow as any).teleSeq = 1
    ;(s.flow as any).teleportAnim = [{ unitId: av, name: s.units[av].name, from, to: { x: from.x, y: from.y + 1 }, seq: 1 }]
    h.rerender()
    expect(h.container.querySelector('.tele-glow'), 'destination glow renders for an avatar teleport').toBeTruthy()
    expect(h.container.querySelector('.unit.anim-teleout'), 'the avatar zaps out of its old tile too').toBeTruthy()
  })
})
