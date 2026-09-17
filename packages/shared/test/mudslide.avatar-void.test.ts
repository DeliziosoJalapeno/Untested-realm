// "Avatars can never enter void locations" (Keyword: Void). Mudslide spans the void and may slide
// an ordinary unit into a siteless square, but it must NOT push an Avatar into one — the Avatar
// only slides if the destination square holds another site.
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

  it('slides an ordinary non-voidwalk unit into the void — where it is banished', () => {
    const g: any = newGame(); keepBoth(g)
    const ms = mudslide(g, 1, 0)
    placeSite(g, 0, 'Active Volcano', 1, 2)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 2); foe.enteredTurn = 0
    // column x=0 empty → (0,2) is the void; Mudslide pushes the non-Avatar in, and it is banished
    slide(g, ms.id, 'left')
    expect(g.units[foe.id], 'a non-voidwalk minion shoved into the void is banished').toBeUndefined()
    expect(g.players[1].banished).toContain(foe.cardId)
  })
})
