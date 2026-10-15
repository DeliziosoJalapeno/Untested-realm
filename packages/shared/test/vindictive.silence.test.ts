// July 15 2026 FAQ (reversal of the old ruling): if your opponent SILENCES your Vindictive Nation — e.g.
// by playing Smokestacks of Gnaak or Fields of Phyxis nearby — you still make them lose life. "The act of
// silencing literally triggers Vindictive Nation's ability. So as Vindictive Nation becomes silenced, its
// ability triggers." (Silencing a site = a modify = 1 life.) Contrast: a PRE-EXISTING silence that isn't
// itself the triggering act does not newly trigger it.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { enterSite, siteSilenced, avatarOf, type GameState } from '../src'

function playSiteFor(g: GameState, player: 0 | 1, name: string, x: number, y: number) {
  const cid = `ctest${(g as any).nextId++}`
  g.cards[cid] = { id: cid, name, owner: player } as any
  return enterSite(g, player, cid, x, y)
}

describe('Vindictive Nation — silencing it triggers its penalty (July 15 2026 FAQ)', () => {
  it('opponent playing Smokestacks of Gnaak to silence it loses 1 life, and it IS silenced', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Vindictive Nation', 2, 2) // my Vindictive Nation
    const oppLife = avatarOf(g, 1).life!

    playSiteFor(g, 1, 'Smokestacks of Gnaak', 2, 3) // opponent's silencer, adjacent → silences my Vindictive

    expect(siteSilenced(g, { x: 2, y: 2 }), 'Vindictive Nation is indeed silenced').toBe(true)
    expect(avatarOf(g, 1).life, 'opponent loses 1 life — the act of silencing triggers Vindictive').toBe(oppLife - 1)
  })

  it('Fields of Phyxis played in front of Vindictive Nation also costs the opponent 1 life', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Vindictive Nation', 2, 2)
    const oppLife = avatarOf(g, 1).life!
    // Fields of Phyxis (controlled by p1) silences the site directly "in front" of it. For p1 (seat 1)
    // "in front" is y-1, so placing Fields at (2,3) puts Vindictive (2,2) in front of it.
    playSiteFor(g, 1, 'Fields of Phyxis', 2, 3)

    expect(siteSilenced(g, { x: 2, y: 2 }), 'Vindictive is silenced by Fields of Phyxis').toBe(true)
    expect(avatarOf(g, 1).life).toBe(oppLife - 1)
  })

  it('a player silencing their OWN nearby site via their own Smokestacks is not penalized', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Vindictive Nation', 2, 2)
    const ownLife = avatarOf(g, 0).life!
    playSiteFor(g, 0, 'Smokestacks of Gnaak', 2, 3) // MY own silencer next to MY Vindictive

    expect(avatarOf(g, 0).life, 'you never pay your own Vindictive').toBe(ownLife)
  })
})
