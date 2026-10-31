// "Summon a token here" / "where it died" means the unit's LOCATION, region included (rulebook: "Here &
// There refer to the location(s) a card occupies"). A Noisome Twosome buried by Cave-In dies underground,
// so its Skeleton is summoned underground — where, lacking Burrowing, it immediately dies too (rulebook:
// minions in the subsurface "immediately die, unless otherwise allowed"). It never stands on the surface.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, waiveThreshold } from './helpers'
import { killUnit, checkStateBased, type GameState } from '../src'
import '../src/cards/scripts/index'

const skeletons = (g: GameState) => Object.values(g.units).filter((u) => u.name === 'Skeleton')

describe('"here" tokens rise in the region the unit was in', () => {
  it('Noisome Twosome buried by Cave-In: its Deathrite Skeleton rises underground (and dies there)', () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2)
    const twosome = summonCard(g, 1, 'Noisome Twosome', 2, 2); twosome.enteredTurn = -1
    const entered: string[] = []
    const enterSpy = (id: string) => { const u = g.units[id]; if (u?.name === 'Skeleton') entered.push(u.region) }
    const before = new Set(Object.keys(g.units))
    const origPush = g.log.push.bind(g.log)
    g.log.push = (...ev) => { for (const id of Object.keys(g.units)) if (!before.has(id)) { before.add(id); enterSpy(id) } return origPush(...ev) }
    castMagic(g, 0, 'Cave-In', { targets: [site.id] })
    expect(g.units[twosome.id], 'a non-burrower dies underground').toBeUndefined()
    expect(entered, 'the Skeleton was summoned under the site').toEqual(['underground'])
    expect(skeletons(g), 'and, no Burrowing, died there — none on the surface').toEqual([])
  })

  it('on the surface it is unchanged', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const twosome = summonCard(g, 1, 'Noisome Twosome', 2, 2)
    killUnit(g, twosome.id); checkStateBased(g)
    expect(skeletons(g).map((s) => [s.x, s.y, s.region])).toEqual([[2, 2, 'surface']])
  })
})
