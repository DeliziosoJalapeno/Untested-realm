// Mudslide FAQ: "Does this effect span the void? Yes" — the column isn't broken by void squares, so units on
// land sites past a void gap slide too. But a forced "one step" is to an adjacent location in the same
// region (Windblast FAQ: "Can I push something into the void? No"), so no unit — Avatar or minion — is
// slid into a siteless square: with the void beside it, it stays put.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { makeCtx, getScript } from '../src'

function mudslide(g: any, x: number, y: number) {
  return placeSite(g, 0, 'Mudslide', x, y) // self.x is the column that slides
}
// the Genesis only asks the direction; the `slide` cont does the work — drive it directly
function slide(g: any, siteId: string, dir: 'left' | 'right') {
  getScript('Mudslide')!.conts!.slide(makeCtx(g, siteId, 0, []), {}, dir)
}

describe('Mudslide vs the void', () => {
  it('will NOT slide an Avatar into a siteless (void) square', () => {
    const g: any = newGame(); keepBoth(g)
    const ms = mudslide(g, 1, 0)
    placeSite(g, 0, 'Active Volcano', 1, 1) // land site the avatar stands on
    // column x=0 is left empty → (0,1) is the void
    const av = g.units[g.players[0].avatarUnitId]; av.x = 1; av.y = 1; av.region = 'surface'

    slide(g, ms.id, 'left') // toward x=0 (void)
    expect(g.units[av.id].x, 'the Avatar holds its ground — it can never enter the void').toBe(1)
  })

  it('DOES slide an Avatar onto an adjacent site', () => {
    const g: any = newGame(); keepBoth(g)
    const ms = mudslide(g, 1, 0)
    placeSite(g, 0, 'Active Volcano', 1, 1)
    placeSite(g, 0, 'Active Volcano', 0, 1) // a real site to the left → a legal destination
    const av = g.units[g.players[0].avatarUnitId]; av.x = 1; av.y = 1; av.region = 'surface'

    slide(g, ms.id, 'left')
    expect(g.units[av.id].x, 'with a site to slide onto, the Avatar moves normally').toBe(0)
  })

  it('will NOT slide an ordinary unit into the void either (a forced step is to an adjacent location)', () => {
    const g: any = newGame(); keepBoth(g)
    const ms = mudslide(g, 1, 0)
    placeSite(g, 0, 'Active Volcano', 1, 2)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 2); foe.enteredTurn = 0
    // column x=0 empty → (0,2) is the void: the minion holds its ground
    slide(g, ms.id, 'left')
    expect(g.units[foe.id]?.x, 'a minion is not shoved into the void').toBe(1)
    expect(g.players[1].banished).not.toContain(foe.cardId)
  })

  it('spans the void: a unit on a land site past a void gap in the column still slides', () => {
    const g: any = newGame(); keepBoth(g)
    const ms = mudslide(g, 1, 0)
    // (1,1) is left as void — the column continues past it
    placeSite(g, 0, 'Active Volcano', 1, 2)
    placeSite(g, 0, 'Active Volcano', 0, 2)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 2); foe.enteredTurn = 0
    slide(g, ms.id, 'left')
    expect(g.units[foe.id]?.x, 'slid across to the adjacent site').toBe(0)
  })
})
