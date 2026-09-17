// Scatter pushes EVERYTHING at the target location, "one at a time" — not just units. An aura
// occupying the square must also be offered a one-step push. (Reported bug: Scatter never let you
// move the auras there.)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, waiveThreshold, answer } from './helpers'
import { aura2x2Squares } from '../src'

describe('Scatter pushes auras at the target location', () => {
  it('a 2×2 aura on the square is offered a one-step shift, and moves', () => {
    const g: any = newGame(); keepBoth(g); waiveThreshold(g, 0)
    const av = g.units[g.players[0].avatarUnitId]; av.x = 0; av.y = 3 // out of the way
    placeSite(g, 0, 'Active Volcano', 2, 2) // the target square has a site
    // a 2×2 aura anchored at (2,2) → it covers (2,2)
    g.cards['cra1'] = { id: 'cra1', name: 'Acid Rain', owner: 0 }
    g.auras['ra1'] = { id: 'ra1', cardId: 'cra1', name: 'Acid Rain', controller: 0, squares: aura2x2Squares({ x: 2, y: 2 }, false), anchor: { x: 2, y: 2 } }

    castMagic(g, 0, 'Scatter', { targets: ['sq:2,2,surface'] })

    // no units on the square → the AURA push prompt comes up (the bug: it never did)
    const p = g.prompts[0]
    expect(p, 'a push prompt is offered for the aura').toBeTruthy()
    expect(String(p!.title), 'it targets the Acid Rain aura').toMatch(/Acid Rain/)
    expect((p!.data as any).area2x2, 'a 2×2 aura shifts by an intersection anchor').toBe(true)
    const anchors = (p!.data as any).squares as { x: number; y: number }[]
    expect(anchors.some((a) => a.x === 2 && a.y === 1), 'an orthogonal anchor shift is offered').toBe(true)

    answer(g, { x: 2, y: 1 })
    expect(g.auras['ra1'].anchor, 'the aura shifted one orthogonal step').toEqual({ x: 2, y: 1 })
  })
})
