// Imperial Road: 'Genesis → Target opponent, then you, may play a site adjacent to this one.'
//
// The road DICTATES where the site goes, so it offers squares itself rather than going through
// the ordinary placement rule. It used to pick those squares by testing occupancy — "any
// adjacent square with no site on it" — which quietly excludes every card whose own entry
// script needs an OCCUPIED square. Rift Valley is exactly that card: 'You may pull apart a
// partial row or column to make a void in which to play this', so the square it wants is one
// that already has a site on it. The two sets never intersected and the road could never play
// a Rift Valley, with no message to say why.
//
// forcedSiteSquares() is the shared answer: free squares, plus whatever the card's own
// customSitePlay can still enter. A card without one gets exactly the old free-square set.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, act, answer, injectToHand, placeSite } from './helpers'
import { siteAt } from '../src'

/** Walk the road's offer: yes → which site → where. */
function takeTheOffer(g: any, pick: number, square?: { x: number; y: number }) {
  expect(g.prompts[0]?.kind, 'the road asks whether to play a site').toBe('yesNo')
  answer(g, true)
  expect(g.prompts[0]?.kind, 'then which site').toBe('chooseCards')
  answer(g, [pick])
  if (!square) return g.prompts[0]
  expect(g.prompts[0]?.kind, 'then where').toBe('chooseSquare')
  answer(g, square)
  return undefined
}

describe('Imperial Road offers a site the squares that site can actually use', () => {
  it('offers Rift Valley the occupied seam beside the road', () => {
    const g: any = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    // A run along the row in front of the avatar, so the square the road touches at
    // (av.x, av.y+1) is a seam: the run can slide one step and open a void there.
    placeSite(g, 1, 'Dark Tower', av.x - 2, av.y + 1)
    placeSite(g, 1, 'Lone Tower', av.x - 1, av.y + 1)
    placeSite(g, 1, 'Rustic Village', av.x, av.y + 1)
    g.players[1].hand = []
    injectToHand(g, 1, 'Rift Valley')

    const road = injectToHand(g, 0, 'Imperial Road')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: road, x: av.x, y: av.y })

    // the opponent is offered first, and Rift Valley is their only site in hand
    const where = takeTheOffer(g, 0)
    expect(where?.kind, 'a square is offered rather than the offer being dropped').toBe('chooseSquare')
    const squares = (where.data.squares ?? []) as { x: number; y: number }[]
    // Rift Valley may also be played the ordinary way, so the free neighbours are offered too —
    // what the fix adds is the OCCUPIED seam, which is the only square the card's own entry
    // script can use and which an occupancy test could never produce.
    const seam = squares.find((s) => s.x === av.x && s.y === av.y + 1)
    expect(seam, 'the occupied seam beside the road is on offer').toBeTruthy()
    expect(siteAt(g, av.x, av.y + 1), 'and it really is occupied').toBeTruthy()
  })

  it('plays it there, pulling the land apart', () => {
    const g: any = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    placeSite(g, 1, 'Dark Tower', av.x - 2, av.y + 1)
    placeSite(g, 1, 'Lone Tower', av.x - 1, av.y + 1)
    placeSite(g, 1, 'Rustic Village', av.x, av.y + 1)
    g.players[1].hand = []
    injectToHand(g, 1, 'Rift Valley')

    const road = injectToHand(g, 0, 'Imperial Road')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: road, x: av.x, y: av.y })
    takeTheOffer(g, 0, { x: av.x, y: av.y + 1 })

    // more than one direction can part the land here, so the engine asks which
    if (g.prompts[0]?.kind === 'chooseOption') {
      const options = (g.prompts[0].data.options ?? []) as string[]
      answer(g, options.find((o) => o.includes('east')) ?? options[0])
    }
    expect(siteAt(g, av.x, av.y + 1)?.name, 'Rift Valley landed in the void it opened').toBe('Rift Valley')
    expect(
      Object.values(g.sites).some((s: any) => s.name === 'Rustic Village' && !s.isRubble),
      'the site that was there was pushed aside, not destroyed',
    ).toBe(true)
  })

  it('still offers an ordinary site only the free squares', () => {
    const g: any = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    g.players[1].hand = []
    injectToHand(g, 1, 'Rustic Village')

    const road = injectToHand(g, 0, 'Imperial Road')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: road, x: av.x, y: av.y })

    const where = takeTheOffer(g, 0)
    const squares = (where.data.squares ?? []) as { x: number; y: number }[]
    for (const sq of squares) {
      expect(siteAt(g, sq.x, sq.y), `(${sq.x},${sq.y}) is open ground`).toBeFalsy()
    }
  })
})
