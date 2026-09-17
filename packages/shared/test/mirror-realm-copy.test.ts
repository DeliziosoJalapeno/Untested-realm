// Mirror Realm reflects a NEARBY site, but only where the copied site could itself be played:
//  • a plain nearby site is copied freely;
//  • a placement-limited site (Edge of the World) is only copyable when Mirror Realm's square meets
//    that site's rule — you can't copy an Edge of the World unless you sit on a void edge;
//  • it may even enter "the special way" of a nearby Rift Valley — pulling the land apart and landing
//    in the void — then reflect it (FAQ: allowed as long as it ends up nearby that Rift Valley).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, injectToHand, placeSite, answer } from './helpers'
import type { GameState, SiteState } from '../src'
import '../src/cards/scripts/index'

function siteAtXY(g: GameState, x: number, y: number): SiteState | undefined {
  return Object.values(g.sites).find((s) => s.x === x && s.y === y && !s.isRubble)
}
function playMirror(g: GameState, x: number, y: number): string {
  const id = injectToHand(g, 0, 'Mirror Realm')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: id, x, y })
  return id
}

describe('Mirror Realm copies a nearby site', () => {
  it('reflects the sole nearby site automatically', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    playMirror(g, 2, 3) // adjacent to the Village
    expect(siteAtXY(g, 2, 3)?.name, 'became a copy of the nearby Village').toBe('Rustic Village')
  })

  it('stays playable and just fizzles into a blank Mirror Realm with nothing nearby to copy', () => {
    // Empty board: standard placement offers the squares closest to the avatar (this is the kind of
    // forced establishment a Pathfinder's first turn can't decline). Nothing is nearby to reflect.
    const g = newGame() as GameState; keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    const id = injectToHand(g, 0, 'Mirror Realm')
    // with no sites, standard placement is the avatar's own square (the establishment square)
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: id, x: av.x, y: av.y })
    const placed = Object.values(g.sites).find((s) => s.cardId === id)
    expect(placed, 'Mirror Realm still entered the realm (playable with nothing to copy)').toBeTruthy()
    expect(placed?.name, 'it fizzled into a blank Mirror Realm').toBe('Mirror Realm')
    expect(g.prompts.length, 'no reflect prompt was raised').toBe(0)
  })
})

describe("Mirror Realm honors the copied site's placement rule (Edge of the World)", () => {
  it('CANNOT copy an Edge of the World when it does not sit on a void edge', () => {
    const g = newGame() as GameState; keepBoth(g)
    // ring (2,1) with sites on every orthogonal neighbor → (2,1) is NOT adjacent to the void
    placeSite(g, 0, 'Edge of the World', 2, 2)
    placeSite(g, 0, 'Rustic Village', 1, 1)
    placeSite(g, 0, 'Rustic Village', 3, 1)
    placeSite(g, 0, 'Rustic Village', 2, 0)
    playMirror(g, 2, 1)
    // several villages are copyable, so a reflect prompt is raised — the Edge's square must NOT be offered
    const squares = (g.prompts[0]?.data?.squares ?? []) as { x: number; y: number }[]
    expect(g.prompts[0]?.kind).toBe('chooseSquare')
    expect(squares.some((s) => s.x === 2 && s.y === 2), 'Edge of the World is not a legal copy off a void edge').toBe(false)
    expect(squares.length, 'the plain Villages are still offered').toBeGreaterThan(0)
  })

  it('CAN copy an Edge of the World when it sits on a void edge', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Edge of the World', 1, 1)
    playMirror(g, 2, 1) // (2,0),(3,1),(2,2) are void → void-adjacent, and adjacent to the Edge
    // only the Edge is nearby-and-legal → auto reflect
    expect(siteAtXY(g, 2, 1)?.name).toBe('Edge of the World')
  })
})

describe('Mirror Realm copies Rift Valley', () => {
  it('reflects a Rift Valley it merely sits next to (normal placement)', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rift Valley', 2, 2)
    playMirror(g, 2, 3)
    expect(siteAtXY(g, 2, 3)?.name).toBe('Rift Valley')
  })

  it('enters "the special way" — pulls the land apart onto a seam, then reflects the Rift Valley', () => {
    const g = newGame() as GameState; keepBoth(g)
    // row y=2: [Rift Valley][Village] then void — (1,2) is a pull-apart seam nearby the Rift Valley
    placeSite(g, 0, 'Rift Valley', 0, 2)
    placeSite(g, 0, 'Rustic Village', 1, 2)
    const id = injectToHand(g, 0, 'Mirror Realm')
    // the seam (1,2) is offered even though it's occupied — it's a Rift-Valley-style entry
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: id, x: 1, y: 2 })
    // the Village was pushed east to (2,2); Mirror Realm now occupies the opened (1,2)
    expect(siteAtXY(g, 2, 2)?.name, 'the Village slid east').toBe('Rustic Village')
    const mirror = siteAtXY(g, 1, 2)
    expect(mirror, 'Mirror Realm landed on the opened square').toBeTruthy()
    // reflect: choose the Rift Valley (both it and the slid Village are now nearby-legal)
    if (g.prompts[0]) answer(g, { x: 0, y: 2 })
    expect(siteAtXY(g, 1, 2)?.name, 'reflected the Rift Valley it opened next to').toBe('Rift Valley')
  })
})
