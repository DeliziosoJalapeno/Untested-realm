// The Rack: "Whenever the bearer strikes an Avatar, stretch them so that they also occupy
// another adjacent location. Then they lose 1 life for each location they occupy." Each strike
// prompts for a NEW adjacent square and grows the avatar's body by one; life bleeds per location.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, giveArtifact, placeSite, answer } from './helpers'
import { getScript, makeCtx, avatarOf, occupiedSquares, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('The Rack stretches a struck avatar one square per hit', () => {
  it('prompts for the stretch square, grows the body, and bleeds 1 life per location', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const bearer = summonCard(g, 0, 'Bone Jumble', 1, 1)
    const rack = giveArtifact(g, bearer, 'The Rack')
    const av = avatarOf(g, 1); av.x = 2; av.y = 1
    const life0 = av.life!
    // sites on rows 0-1 around the avatar; (2,2) is left a VOID (no site)
    for (const [x, y] of [[1, 0], [2, 0], [3, 0], [1, 1], [2, 1], [3, 1]] as const) placeSite(g, 0, 'Spire', x, y)

    // first strike on the avatar
    getScript('The Rack')!.bearerOnStrike!(makeCtx(g, rack.id, 0, []), rack.id, av)
    expect(g.prompts[0]?.kind, 'asks how to stretch').toBe('chooseSquare')
    // the void at (2,2) is NOT offered — an avatar can't be stretched into the void
    expect(g.prompts[0].data.squares.some((s: any) => s.x === 2 && s.y === 2), 'no void offered').toBe(false)
    const opt1 = g.prompts[0].data.squares[0]
    answer(g, opt1)
    expect(av.extraSquares?.length, 'gained one extra square').toBe(1)
    expect(occupiedSquares(av).length, 'now occupies two locations').toBe(2)
    expect(av.life, 'lost 1 life per occupied location (2)').toBe(life0 - 2)

    // second strike stretches again — a NEW square, occupying three
    getScript('The Rack')!.bearerOnStrike!(makeCtx(g, rack.id, 0, []), rack.id, av)
    expect(g.prompts[0]?.kind).toBe('chooseSquare')
    // none of the offered squares is one already occupied
    for (const s of g.prompts[0].data.squares) {
      expect(occupiedSquares(av).some((o) => o.x === s.x && o.y === s.y), 'offers only fresh squares').toBe(false)
    }
    answer(g, g.prompts[0].data.squares[0])
    expect(occupiedSquares(av).length, 'stretched across three locations').toBe(3)
    expect(av.life, 'bled a further 3').toBe(life0 - 2 - 3)
  })
})
