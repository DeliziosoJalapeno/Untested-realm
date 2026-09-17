// #4: a multi-step relocation with MORE THAN ONE shortest route prompts the player to
// pick the route (it matters for departed-location effects). A single route just resolves.
import { describe, it, expect, afterEach } from 'vitest'
import { board, place, usummon, type GameState } from '@sorcery/shared'
import { GameHarness } from './harness'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

function courserBoard(): { g: GameState; fcId: string } {
  const g = board(); g.prompts = []
  // a clean patch of sites around (2,2) so both L-routes to (1,1) are open
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2], [2, 3]] as const) place(g, 0, 'Active Volcano', x, y)
  const fcId = usummon(g, 0, 'Fine Courser', 2, 2) // Movement +1 → 2 steps
  g.units[fcId].enteredTurn = -5; g.units[fcId].tapped = false
  // make sure nothing enemy sits at the destination
  for (const u of Object.values(g.units)) if (u.controller === 1 && u.x === 1 && u.y === 1) delete g.units[u.id]
  return { g, fcId }
}

describe('multi-step move route picker', () => {
  it('an L-shaped 2-step move opens a route picker; choosing one moves via that route', () => {
    const { g, fcId } = courserBoard()
    const h = new GameHarness(g).mount(); active = h

    h.click(h.container.querySelector(`[data-unit="${fcId}"]`) as HTMLElement) // select the Courser
    h.click(h.container.querySelector(`.square[data-sq="1,1"]`) as HTMLElement) // click the L-diagonal dest

    const banner = h.container.querySelector('[data-modebanner="pathChoice"]')
    expect(banner, 'the route picker opened (2 routes exist)').toBeTruthy()
    const routes = banner!.querySelectorAll('[data-route]')
    expect(routes.length, 'a button per shortest route').toBe(2)

    h.click(routes[0] as HTMLElement)
    expect([g.units[fcId].x, g.units[fcId].y], 'the Courser moved to the destination').toEqual([1, 1])
    expect(h.drifts, 'the chosen route was a legal move').toHaveLength(0)
  })

  it('a straight 2-step move does NOT prompt (single route) — it just moves', () => {
    const { g, fcId } = courserBoard()
    place(g, 0, 'Active Volcano', 2, 0) // ensure (2,0) has a site; route is (2,2)->(2,1)->(2,0)
    const h = new GameHarness(g).mount(); active = h
    h.click(h.container.querySelector(`[data-unit="${fcId}"]`) as HTMLElement)
    h.click(h.container.querySelector(`.square[data-sq="2,0"]`) as HTMLElement)
    expect(h.container.querySelector('[data-modebanner="pathChoice"]'), 'no picker for a single route').toBeFalsy()
    expect([g.units[fcId].x, g.units[fcId].y]).toEqual([2, 0])
  })

  // The attack/move CHOOSER comes FIRST, the route pick SECOND (user's requested order): a
  // click on a reachable enemy that can be approached by >1 route must show ⚔ Attack / 🚶 Move
  // only BEFORE ever asking which route — the route picker only appears once you commit to attack.
  it('attacking via >1 route asks ⚔ Attack / 🚶 Move FIRST, then the route', () => {
    const { g, fcId } = courserBoard()
    const foeId = usummon(g, 1, 'Bone Jumble', 1, 1) // an enemy sitting on the L-diagonal dest
    g.units[foeId].tapped = false
    const h = new GameHarness(g).mount(); active = h

    h.click(h.container.querySelector(`[data-unit="${fcId}"]`) as HTMLElement) // select the Courser
    h.click(h.container.querySelector(`[data-unit="${foeId}"]`) as HTMLElement) // click the enemy to attack

    // FIRST prompt: the move/attack chooser — NOT the route picker yet.
    const chooser = h.container.querySelector('[data-modebanner="moveChoice"]')
    expect(chooser, 'the attack/move chooser opens first').toBeTruthy()
    expect(h.container.querySelector('[data-modebanner="pathChoice"]'), 'route picker must NOT be shown yet').toBeFalsy()

    // commit to the attack → NOW the route picker appears (two L-routes to the enemy).
    const attackBtn = Array.from(chooser!.querySelectorAll('button')).find((b) => /Attack/.test(b.textContent ?? ''))
    expect(attackBtn, 'an ⚔ Attack choice is offered').toBeTruthy()
    h.click(attackBtn as HTMLElement)

    const routes = h.container.querySelector('[data-modebanner="pathChoice"]')
    expect(routes, 'the route picker opens AFTER choosing to attack').toBeTruthy()
    expect(routes!.querySelectorAll('[data-route]').length, 'a button per shortest route').toBe(2)

    // pick a route → the strike fires along it (the 1/1 enemy dies), no illegal clicks.
    h.click(routes!.querySelectorAll('[data-route]')[0] as HTMLElement)
    expect(g.units[foeId], 'the attacked enemy took the hit and died').toBeUndefined()
    expect(h.drifts, 'every click was a legal action').toHaveLength(0)
  })
})
