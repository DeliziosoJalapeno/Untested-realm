// Imperial Road: "When it enters, each player may play a site from hand adjacent to the
// Imperial Road." The site is placed BESIDE THE ROAD — not beside the player's own sites —
// so the normal placement-adjacency rule must not block it (it was, so the opponent could
// never actually play their site here).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, injectToHand, answer } from './helpers'
import { getScript, makeCtx, siteAt, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Imperial Road lets a player play a site beside the road', () => {
  it("makes the opponent play their hand site into a free road-adjacent square, ignoring normal adjacency", () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 4
    // player 1's only site is far away at (0,0) — so (3,2) is NOT one of their normal legal squares
    placeSite(g, 1, 'Spire', 0, 0)
    const road = placeSite(g, 0, 'Imperial Road', 2, 2)
    g.players[1].hand = [] // start from a clean hand so the only site offered is the one we inject
    const handSite = injectToHand(g, 1, 'Rustic Village') // a site in the opponent's hand

    getScript('Imperial Road')!.genesis!(makeCtx(g, road.id, 0, []))
    // opponent is asked whether to play a site by the road
    expect(g.prompts[0]?.kind).toBe('yesNo')
    answer(g, true)
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    answer(g, [0]) // the Ruins
    expect(g.prompts[0]?.kind, 'now choose a road-adjacent square').toBe('chooseSquare')
    expect(g.prompts[0]?.data.squares.some((s: any) => s.x === 3 && s.y === 2)).toBe(true)
    answer(g, { x: 3, y: 2 })

    const placed = siteAt(g, 3, 2)
    expect(placed?.name, 'the site was actually played beside the road').toBe('Rustic Village')
    expect(placed?.controller, 'the opponent controls the site they played').toBe(1)
    expect(g.players[1].hand.includes(handSite), 'it left their hand').toBe(false)
  })
})
