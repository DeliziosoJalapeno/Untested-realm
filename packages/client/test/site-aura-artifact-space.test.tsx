// A 1x1 aura (Wildfire, Castle's/Hamlet's Ablaze!) is shown in the ARTIFACT SPACE — a small card in
// the site's right-hand strip, exactly like a ground artifact — never as the big translucent 2x2
// overlay box. When minions share the site it reserves that strip (the `has-arts` layout) so it isn't
// buried under them.
import { describe, it, expect, afterEach } from 'vitest'
import { board } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function addSite(g: any, x: number, y: number): string {
  const cid = `cs${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Rustic Village', owner: 0 }
  const sid = `s${g.nextId++}`
  g.sites[sid] = { id: sid, cardId: cid, name: 'Rustic Village', owner: 0, controller: 0, x, y, tapped: false, isRubble: false }
  return sid
}
function addWildfire(g: any, x: number, y: number): string {
  const cid = `cw${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Wildfire', owner: 0 }
  const wid = `w${g.nextId++}`
  g.auras[wid] = { id: wid, cardId: cid, name: 'Wildfire', controller: 0, squares: [{ x, y }], enteredTurn: 0 }
  return wid
}
function addUnit(g: any, x: number, y: number): string {
  const cid = `cu${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Bone Jumble', owner: 0 }
  const uid = `u${g.nextId++}`
  g.units[uid] = { id: uid, cardId: cid, name: 'Bone Jumble', owner: 0, controller: 0, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} }
  return uid
}

describe('1x1 aura renders in the artifact space', () => {
  it('a Wildfire shows as a .ground-art.site-aura, not the big overlay box', () => {
    const g = board() as any; g.prompts = []
    addSite(g, 2, 1)
    addWildfire(g, 2, 1)
    const h = new GameHarness(g).mount(); active = h
    const sq = h.container.querySelector('.square[data-sq="2,1"]')!
    expect(sq.querySelector('.ground-art.site-aura'), 'aura is a small card in the artifact strip').toBeTruthy()
    expect(sq.querySelector('.overlay-item.aura'), 'NOT rendered as the big 2x2 overlay box').toBeFalsy()
  })

  it('still tints its whole site (a click-through overlay) as well as the strip card', () => {
    const g = board() as any; g.prompts = []
    addSite(g, 2, 1)
    const w = addWildfire(g, 2, 1); g.auras[w].controller = 0
    const h = new GameHarness(g).mount(); active = h
    const sq = h.container.querySelector('.square[data-sq="2,1"]')!
    expect(sq.querySelector('.site-aura'), 'the card is in the artifact strip').toBeTruthy()
    const tint = h.container.querySelector(`[data-aura-tint="${w}"]`)
    expect(tint, 'and the whole site is tinted by the aura').toBeTruthy()
    // the EFFECT tint is element-coloured, NOT control-coloured — control colour lives on the card
    expect(tint!.classList.contains('aura-mine'), 'tint is element-coloured, not player-coloured').toBe(false)
    expect(sq.querySelector('.site-aura.aura-mine'), 'the CARD carries the control colour instead').toBeTruthy()
  })

  it('shows a control-coloured border (yours vs the opponent\'s)', () => {
    const g = board() as any; g.prompts = []
    const me = 0
    addSite(g, 2, 1); addSite(g, 3, 1)
    const w1 = addWildfire(g, 2, 1); g.auras[w1].controller = me       // mine
    const w2 = addWildfire(g, 3, 1); g.auras[w2].controller = 1 - me   // opponent's
    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('.square[data-sq="2,1"] .site-aura.aura-mine'), 'my aura is blue-bordered').toBeTruthy()
    expect(h.container.querySelector('.square[data-sq="3,1"] .site-aura.aura-theirs'), "the opponent's aura is red-bordered").toBeTruthy()
  })

  it('reserves the artifact strip so minions do not bury it', () => {
    const g = board() as any; g.prompts = []
    addSite(g, 2, 1)
    addWildfire(g, 2, 1)
    addUnit(g, 2, 1) // a minion shares the square
    const h = new GameHarness(g).mount(); active = h
    const sq = h.container.querySelector('.square[data-sq="2,1"]')!
    expect(sq.querySelector('.ground-art.site-aura'), 'the aura still shows in the strip').toBeTruthy()
    expect(sq.querySelector('.units.has-arts'), 'the minions reserve the artifact strip for it').toBeTruthy()
  })
})
