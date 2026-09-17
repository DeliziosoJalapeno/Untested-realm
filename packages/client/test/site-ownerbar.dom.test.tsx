// A site's ownership colour bar is VIEWPOINT-relative (like units/auras/monuments): the current
// viewer's sites are blue (owner-mine), the opponent's red (owner-theirs). So it flips correctly
// when the perspective switches (hotseat / scenarios) instead of always showing seat 0 as blue.
import { describe, it, expect, afterEach } from 'vitest'
import { board } from '@sorcery/shared'
import { GameHarness } from './harness'
import { hotseatViewpoint } from '../src/App'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function addSite(g: any, x: number, y: number, controller: 0 | 1): string {
  const cid = `cs${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Rustic Village', owner: controller }
  const sid = `s${g.nextId++}`
  g.sites[sid] = { id: sid, cardId: cid, name: 'Rustic Village', owner: controller, controller, x, y, tapped: false, isRubble: false }
  return sid
}

describe('site ownership bar is viewpoint-relative', () => {
  it("the viewer's own site is owner-mine, the opponent's is owner-theirs", () => {
    const g = board() as any; g.prompts = []
    const me = hotseatViewpoint(g)
    addSite(g, 1, 1, me as 0 | 1)              // my site
    addSite(g, 2, 1, (1 - me) as 0 | 1)        // opponent's site
    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('.square[data-sq="1,1"] .site-ownerbar.owner-mine'), 'my site → blue (owner-mine)').toBeTruthy()
    expect(h.container.querySelector('.square[data-sq="2,1"] .site-ownerbar.owner-theirs'), "opponent's site → red (owner-theirs)").toBeTruthy()
    // and never the old absolute classes
    expect(h.container.querySelector('.site-ownerbar.owner0, .site-ownerbar.owner1'), 'no absolute owner0/1 bars').toBeFalsy()
  })
})
