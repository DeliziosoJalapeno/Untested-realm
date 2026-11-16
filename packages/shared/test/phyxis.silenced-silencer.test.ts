// A silenced Fields of Phyxis silences nothing ("The site directly in front is silenced" is its own
// printed ability). It used to keep silencing when Sinterfee was the silencer: the "is the silencer itself
// silenced?" check passed bare coordinates, and Sinterfee recognises its site by id.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { siteSilenced, type GameState, type SiteState } from '../src'

/** P0's Phyxis at (2,1) with an enemy Rustic Village directly in front at (2,2). Sites get real-game
 *  `s<n>` ids, since Sinterfee stores its chosen site as that number. */
function board(): { g: GameState; phyxis: SiteState; front: SiteState } {
  const g = newGame() as GameState; keepBoth(g)
  for (const s of Object.values(g.sites)) delete g.sites[s.id]
  const reId = (s: SiteState, n: number) => { delete g.sites[s.id]; s.id = `s${n}`; g.sites[s.id] = s; return s }
  const phyxis = reId(placeSite(g, 0, 'Fields of Phyxis', 2, 1), 901)
  const front = reId(placeSite(g, 1, 'Rustic Village', 2, 2), 902)
  return { g, phyxis, front }
}

describe('a silenced Fields of Phyxis silences nothing', () => {
  it('unsilenced, it silences the site in front', () => {
    const { g, front } = board()
    expect(siteSilenced(g, front)).toBe(true)
  })

  it('silenced by Sinterfee → the site in front keeps its abilities', () => {
    const { g, phyxis, front } = board()
    const sf = summonCard(g, 1, 'Sinterfee', 2, 0)
    sf.counters = { sinterfeeSite: 901 }
    expect(siteSilenced(g, phyxis), 'Sinterfee silences the Phyxis').toBe(true)
    expect(siteSilenced(g, front)).toBe(false)
    expect(siteSilenced(g, { x: front.x, y: front.y }), 'bare coordinates too').toBe(false)
  })

  it('silenced by Smokestacks of Gnaak (out of the front site\'s reach) → the site in front keeps its abilities', () => {
    const { g, front } = board()
    placeSite(g, 1, 'Smokestacks of Gnaak', 3, 0) // nearby the Phyxis, not the Village
    expect(siteSilenced(g, front)).toBe(false)
  })

  it('silenced by Acid Rain → the site in front keeps its abilities', () => {
    const { g, front } = board()
    ;(g.auras as any).a1 = { id: 'a1', cardId: 'x', name: 'Acid Rain', controller: 1, squares: [{ x: 2, y: 1 }] }
    expect(siteSilenced(g, front)).toBe(false)
  })
})
