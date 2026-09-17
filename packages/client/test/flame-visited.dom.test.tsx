// A site the Flame of the First Ones has already kindled shows a (yellower) flame mark — mirroring
// Wildfire's scorch. The artifact remembers every visited SITE by id (a `flame:<siteId>` counter, not
// a coordinate), and the board resolves each visited site id to its CURRENT square — so the mark
// follows a site that has since moved, and drops off if the site is destroyed.
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

function addFlame(g: any, visitedSiteId: string): void {
  const acid = `cf${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Flame of the First Ones', owner: 0 }
  const aid = `a${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: acid, name: 'Flame of the First Ones', conjuredBy: 0, x: 0, y: 1, counters: { [`flame:${visitedSiteId}`]: 1 } }
}

describe('Flame of the First Ones — kindled site marker', () => {
  it('marks a site the flame has visited (by site id), not others', () => {
    const g = board() as any; g.prompts = []
    const kindled = addSite(g, 2, 1) // visited
    addSite(g, 0, 0)                 // untouched
    addFlame(g, kindled)

    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('.square[data-sq="2,1"] .siteflamevisited'), 'kindled site is marked').toBeTruthy()
    expect(h.container.querySelector('.square[data-sq="0,0"] .siteflamevisited'), 'untouched site is not marked').toBeFalsy()
  })

  it('the mark follows a kindled site that has moved', () => {
    const g = board() as any; g.prompts = []
    const kindled = addSite(g, 2, 1)
    addFlame(g, kindled)
    g.sites[kindled].x = 3; g.sites[kindled].y = 3 // the site was since relocated

    const h = new GameHarness(g).mount(); active = h
    expect(h.container.querySelector('.square[data-sq="3,3"] .siteflamevisited'), 'mark follows the site to its new square').toBeTruthy()
    expect(h.container.querySelector('.square[data-sq="2,1"] .siteflamevisited'), 'the old square is no longer marked').toBeFalsy()
  })
})
