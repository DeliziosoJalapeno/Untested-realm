// Pathfinder "easier blaze" — a GUI shortcut over its existing `blaze` ability. While blaze is
// available (untapped, atlas non-empty), Pathfinder's adjacent buildable squares are offered as
// "lay a site here" targets in the move step. Clicking an adjacent VOID blazes there IMMEDIATELY
// (unprompted — moving into empty space just builds a trail); clicking an adjacent RUBBLE ASKS
// first (yes/no) before building over the destroyed site.
import { describe, it, expect, afterEach } from 'vitest'
import { boardWithAvatar, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

const sq = (h: GameHarness, x: number, y: number) => h.container.querySelector(`.square[data-sq="${x},${y}"]`) as HTMLElement

/** Pathfinder at (0,0), untapped, with a site on top of its atlas. (0,0) and the two adjacent
 *  squares (1,0),(0,1) are cleared to bare VOID (no site, no other unit). */
function pathfinderBoard(): { g: GameState; avId: string } {
  const g = boardWithAvatar('Pathfinder'); g.prompts = []
  const avId = g.players[0].avatarUnitId
  const av = g.units[avId]
  av.x = 0; av.y = 0; av.region = 'surface'; av.tapped = false; av.enteredTurn = -5
  for (const [x, y] of [[0, 0], [1, 0], [0, 1]]) {
    for (const s of Object.values(g.sites)) if (s.x === x && s.y === y) delete g.sites[s.id]
    for (const u of Object.values(g.units)) if (u.id !== avId && u.x === x && u.y === y) delete g.units[u.id]
  }
  const cid = `fz${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Rustic Village', owner: 0 } as any
  g.players[0].atlas.unshift(cid) // guarantee a topmost atlas site to blaze
  return { g, avId }
}

describe('Pathfinder easier-blaze (GUI only)', () => {
  it('clicking an adjacent void blazes there IMMEDIATELY, no prompt', async () => {
    const { g, avId } = pathfinderBoard()
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${avId}"]`) as HTMLElement) // select Pathfinder

    // adjacent voids are lit as "place a site" targets (as if it had a 1-step voidwalk)
    expect(sq(h, 1, 0).getAttribute('data-hl'), 'adjacent void offered').toBe('hl-place')
    expect(sq(h, 0, 1).getAttribute('data-hl'), 'the other adjacent void too').toBe('hl-place')

    h.click(sq(h, 1, 0)) // void → unprompted blaze (activate + auto-answered chooseSquare)
    expect(h.container.querySelector('[data-promptbox="blazeConfirm"]'), 'NO confirm dialog for a void').toBeFalsy()
    await h.driveToQuiescence(() => !!Object.values(g.sites).find((s: any) => s.x === 1 && s.y === 0 && !s.isRubble))

    expect(Object.values(g.sites).find((s: any) => s.x === 1 && s.y === 0 && !s.isRubble), 'site blazed into the void').toBeTruthy()
    expect([g.units[avId].x, g.units[avId].y], 'Pathfinder moved onto the new site').toEqual([1, 0])
    expect(g.units[avId].tapped, 'the ability tapped Pathfinder').toBe(true)
    expect(h.drifts, 'no engine drift — the click drove the real blaze ability').toHaveLength(0)
  })

  it('offers an adjacent rubble as a blaze target; confirming clears it and lays the site', async () => {
    const { g, avId } = pathfinderBoard()
    // a RUBBLE on the adjacent (1,0) — a destroyed-site token, controlled by no one
    const cid = `fz${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Rubble', owner: 0, isToken: true } as any
    const sid = `fzs${g.nextId++}`
    g.sites[sid] = { id: sid, cardId: cid, name: 'Rubble', owner: 0, controller: null, x: 1, y: 0, tapped: false, isRubble: true } as any

    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${avId}"]`) as HTMLElement) // select Pathfinder
    expect(sq(h, 1, 0).getAttribute('data-hl'), 'adjacent rubble offered as a blaze target').toBe('hl-place')

    h.click(h.container.querySelector(`[data-site="${sid}"]`) as HTMLElement) // click the rubble (routes via clickSite)
    const confirm = h.container.querySelector('[data-promptbox="blazeConfirm"] [data-confirm="1"]') as HTMLElement
    expect(confirm, 'blaze confirm shown for the rubble').toBeTruthy()

    h.click(confirm)
    await h.driveToQuiescence(() => { const s = Object.values(g.sites).find((s2: any) => s2.x === 1 && s2.y === 0); return !!s && !s.isRubble })
    expect(g.sites[sid], 'the rubble was cleared').toBeUndefined()
    expect(Object.values(g.sites).find((s: any) => s.x === 1 && s.y === 0 && !s.isRubble), 'a fresh site was blazed onto the rubble square').toBeTruthy()
    expect([g.units[avId].x, g.units[avId].y], 'Pathfinder moved onto it').toEqual([1, 0])
    expect(h.drifts, 'no engine drift').toHaveLength(0)
  })

  it('does NOT offer voids when the atlas is empty (blaze would tap for nothing)', () => {
    const { g, avId } = pathfinderBoard()
    g.players[0].atlas = [] // nothing to blaze
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${avId}"]`) as HTMLElement)
    expect(sq(h, 1, 0).getAttribute('data-hl'), 'no blaze target without an atlas site').toBeFalsy()
    h.click(sq(h, 1, 0))
    expect(h.container.querySelector('[data-promptbox="blazeConfirm"]'), 'no confirm shown').toBeFalsy()
  })

})
