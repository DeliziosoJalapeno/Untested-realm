// Salt the Earth: 'Conjure Salt the Earth to a single site, destroying it. Sites can't be played here.'
// A single-site aura (like Hamlet's Ablaze!). The destroyed site becomes RUBBLE as usual — it used to be
// deleted outright, turning the square into a void that swallowed whatever stood there.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, waiveThreshold, fillSites } from './helpers'
import { siteAt, legalSiteSquares, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Salt the Earth', () => {
  it('covers only the chosen site, which becomes salted rubble', () => {
    const g = newGame() as GameState; keepBoth(g); fillSites(g, 1); waiveThreshold(g, 0)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2); foe.enteredTurn = -1
    castMagic(g, 0, 'Salt the Earth', { at: { x: 2, y: 2 } })
    const aura = Object.values(g.auras).find((a) => a.name === 'Salt the Earth')!
    expect(aura.squares, 'a single square, not a 2x2').toEqual([{ x: 2, y: 2 }])
    expect(siteAt(g, 2, 2)?.isRubble, 'the destroyed site is rubble, not a void').toBe(true)
    expect(g.units[foe.id], 'the minion standing there is not swallowed by a void').toBeDefined()
    expect(siteAt(g, 3, 2)?.isRubble, 'its neighbours are untouched').toBeFalsy()
  })

  it("sites can't be played on the salted rubble", () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    const av = g.units[g.players[0].avatarUnitId]
    placeSite(g, 0, 'Rustic Village', av.x, av.y)
    const target = { x: av.x, y: av.y + 1 }
    placeSite(g, 1, 'Rustic Village', target.x, target.y)
    castMagic(g, 0, 'Salt the Earth', { at: target })
    expect(siteAt(g, target.x, target.y)?.isRubble).toBe(true)
    const squares = legalSiteSquares(g, 0, 'Rustic Village')
    expect(squares.some((s) => s.x === target.x && s.y === target.y), 'no site may replace the salted rubble').toBe(false)
  })
})
