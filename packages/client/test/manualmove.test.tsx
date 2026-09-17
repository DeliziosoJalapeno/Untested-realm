// A move whose route set is too busy to arrow (≥10 candidate routes, or a route that
// changes region) skips the arrows: the player is asked Auto vs Manual. Auto takes a
// shortest route; Manual walks one legal step at a time (≤ n+1), and if it stops short
// of the stated destination it must confirm "move there" or cancel (which sends nothing).
import { describe, it, expect, afterEach } from 'vitest'
import { board, place, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

// full board of MY sites + a high-movement unit → a short move has many (>10) routes,
// and nothing at the destination is attackable (a genuine relocation).
function bigMoveBoard(): { g: GameState; id: string } {
  const g = board(); g.prompts = []
  for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) place(g, 0, 'Active Volcano', x, y)
  for (const s of Object.values(g.sites)) { s.controller = 0; s.isRubble = false } // all mine → no ⚔ attack
  for (const u of Object.values(g.units)) if (u.controller === 1) delete g.units[u.id] // no enemy units either
  const id = usummon(g, 0, 'Fine Courser', 2, 1)
  g.units[id].enteredTurn = -5; g.units[id].tapped = false
  g.units[id].modifiers.push({ kind: 'keyword', keyword: 'movement +2' }) // base +1 → total 3 → maxSteps 4
  return { g, id }
}

const sq = (h: GameHarness, x: number, y: number) => h.container.querySelector(`.square[data-sq="${x},${y}"]`) as HTMLElement

// a Burrowing, Movement +1 unit on surface (2,2) with two adjacent land sites → reaching
// the SUBSURFACE of (2,1) can be ordered burrow→move or move→burrow.
function burrowBoard(): { g: GameState; id: string } {
  const g = board(); g.prompts = []
  g.sites = {} as any
  place(g, 0, 'Rustic Village', 2, 2)
  place(g, 0, 'Rustic Village', 2, 1)
  for (const u of Object.values(g.units)) if (u.controller === 1) delete g.units[u.id]
  const id = usummon(g, 0, 'Fine Courser', 2, 2) // base Movement +1 → maxSteps 2
  const u = g.units[id]
  u.enteredTurn = -5; u.tapped = false; u.region = 'surface'
  u.modifiers.push({ kind: 'keyword', keyword: 'burrowing' })
  return { g, id }
}

// walk the shared prelude: select the unit, click (2,1), pick Underground, pick Manual.
function enterBurrowManual(h: GameHarness): void {
  const g = h.state as GameState
  const id = Object.values(g.units).find((u) => u.name === 'Fine Courser')!.id
  h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)
  h.click(sq(h, 2, 1)) // reachable on surface AND underground → region picker
  h.click(h.container.querySelector('[data-modebanner="moveRegion"] [data-choice="underground"]') as HTMLElement)
  h.click(h.container.querySelector('[data-modebanner="howMove"] [data-choice="manual"]') as HTMLElement)
}

describe('complex move → Auto / Manual', () => {
  it('offers the how-to-move prompt (not arrows) when there are ≥10 routes', () => {
    const { g, id } = bigMoveBoard()
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)
    h.click(sq(h, 2, 3))
    expect(h.container.querySelector('[data-modebanner="howMove"]'), 'Auto/Manual prompt shown').toBeTruthy()
    expect(h.container.querySelector('[data-modebanner="pathChoice"]'), 'not the arrows picker').toBeFalsy()
  })

  it('Auto takes a shortest route to the destination', () => {
    const { g, id } = bigMoveBoard()
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)
    h.click(sq(h, 2, 3))
    h.click(h.container.querySelector('[data-modebanner="howMove"] [data-choice="auto"]') as HTMLElement)
    expect([g.units[id].x, g.units[id].y], 'moved to the destination').toEqual([2, 3])
    expect(h.drifts, 'legal move, no engine drift').toHaveLength(0)
  })

  it('Manual: stepping the unit square-by-square to the destination resolves the move', () => {
    const { g, id } = bigMoveBoard()
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)
    h.click(sq(h, 2, 3))
    h.click(h.container.querySelector('[data-modebanner="howMove"] [data-choice="manual"]') as HTMLElement)
    expect(h.container.querySelector('[data-modebanner="manualMove"]'), 'manual mode entered').toBeTruthy()
    h.click(sq(h, 2, 2)) // one legal step (highlighted)
    h.click(sq(h, 2, 3)) // reaches the stated destination → resolves
    expect([g.units[id].x, g.units[id].y]).toEqual([2, 3])
    expect(h.drifts).toHaveLength(0)
    expect(h.container.querySelector('[data-modebanner="manualMove"]'), 'panel closed after resolving').toBeFalsy()
  })

  it('Manual + Stop here short of the destination → confirm "Move there"', () => {
    const { g, id } = bigMoveBoard()
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)
    h.click(sq(h, 2, 3))
    h.click(h.container.querySelector('[data-modebanner="howMove"] [data-choice="manual"]') as HTMLElement)
    h.click(sq(h, 1, 1)) // step AWAY from the stated destination
    h.click(h.container.querySelector('[data-modebanner="manualMove"] [data-stop="1"]') as HTMLElement)
    // the "not where you said" confirm appears
    const confirm = h.container.querySelector('[data-modebanner="manualMove"] [data-confirm="1"]') as HTMLElement
    expect(confirm, 'move-there confirm shown').toBeTruthy()
    h.click(confirm)
    expect([g.units[id].x, g.units[id].y], 'moved to where it actually ended').toEqual([1, 1])
    expect(h.drifts).toHaveLength(0)
  })

  it('Burrow route, order BURROW→MOVE: dive in place, then move underground to the target', () => {
    const { g, id } = burrowBoard()
    const h = new GameHarness(g).mount(); active = h
    enterBurrowManual(h)
    expect(h.container.querySelector('[data-modebanner="manualMove"]'), 'manual stepping for the region-change route').toBeTruthy()
    h.click(sq(h, 2, 2)) // click own square → burrow in place → underground (2,2)
    h.click(sq(h, 2, 1)) // move underground to (2,1) → reaches the target → resolves
    expect([g.units[id].x, g.units[id].y, g.units[id].region]).toEqual([2, 1, 'underground'])
    expect(h.drifts).toHaveLength(0)
  })

  it('Burrow route, order MOVE→BURROW: move on the surface, then dive at the target', () => {
    const { g, id } = burrowBoard()
    const h = new GameHarness(g).mount(); active = h
    enterBurrowManual(h)
    h.click(sq(h, 2, 1)) // step on the surface to (2,1)
    h.click(sq(h, 2, 1)) // click it again → burrow in place → underground (2,1) → resolves
    expect([g.units[id].x, g.units[id].y, g.units[id].region]).toEqual([2, 1, 'underground'])
    expect(h.drifts).toHaveLength(0)
  })

  it('Manual + Cancel undoes everything — the unit stays put, nothing sent', () => {
    const { g, id } = bigMoveBoard()
    const startVer = g.version
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${id}"]`) as HTMLElement)
    h.click(sq(h, 2, 3))
    h.click(h.container.querySelector('[data-modebanner="howMove"] [data-choice="manual"]') as HTMLElement)
    h.click(sq(h, 1, 1)) // take a step...
    h.click(h.container.querySelector('[data-modebanner="manualMove"] [data-cancel="1"]') as HTMLElement)
    expect([g.units[id].x, g.units[id].y], 'unit still on its start square').toEqual([2, 1])
    expect(g.units[id].tapped, 'and untapped').toBe(false)
    expect(g.version, 'nothing was sent to the engine').toBe(startVer)
  })
})
