// A site a roaming Wildfire has already burned shows a scorched mark (next to the flooded 🌊 symbol).
// The Wildfire aura remembers every visited SITE by id (a `s:<siteId>` counter, not a coordinate), and
// the board resolves each visited site id to its CURRENT square — so the scorch mark follows a site
// that has since been moved.
import { describe, it, expect, afterEach } from 'vitest'
import { board } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function addSite(g: any, x: number, y: number): string {
  const scid = `cs${g.nextId++}`; g.cards[scid] = { id: scid, name: 'Rustic Village', owner: 0 }
  const sid = `s${g.nextId++}`
  g.sites[sid] = { id: sid, cardId: scid, name: 'Rustic Village', owner: 0, controller: 0, x, y, tapped: false, isRubble: false }
  return sid
}

describe('scorched site marker', () => {
  it('marks a site the Wildfire has visited (by site id), not others', () => {
    const g = board() as any; g.prompts = []
    const burned = addSite(g, 2, 1) // burned
    addSite(g, 0, 0)                // untouched
    // a Wildfire currently at (0,1) that has already burned the (2,1) SITE
    const acid = `cw${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Wildfire', owner: 0 }
    const wid = `w${g.nextId++}`
    g.auras[wid] = { id: wid, cardId: acid, name: 'Wildfire', controller: 0, squares: [{ x: 0, y: 1 }], onSiteId: burned, counters: { [`s:${burned}`]: 1 }, enteredTurn: 0 }

    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('.square[data-sq="2,1"] .sitescorched'), 'burned site is scorched').toBeTruthy()
    expect(h.container.querySelector('.square[data-sq="0,0"] .sitescorched'), 'untouched site is not scorched').toBeFalsy()
  })

  it('the scorch mark follows a burned site that has moved', () => {
    const g = board() as any; g.prompts = []
    const burned = addSite(g, 2, 1)
    const acid = `cw${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Wildfire', owner: 0 }
    const wid = `w${g.nextId++}`
    g.auras[wid] = { id: wid, cardId: acid, name: 'Wildfire', controller: 0, squares: [{ x: 0, y: 1 }], counters: { [`s:${burned}`]: 1 }, enteredTurn: 0 }
    // the burned site was since relocated to (3,3)
    g.sites[burned].x = 3; g.sites[burned].y = 3

    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('.square[data-sq="3,3"] .sitescorched'), 'scorch follows the site to its new square').toBeTruthy()
    expect(h.container.querySelector('.square[data-sq="2,1"] .sitescorched'), 'the old square is no longer scorched').toBeFalsy()
  })
})
