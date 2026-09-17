// An aura sits ATOP sites (surface) — its "here"/area effect must not reach the subsurface
// (burrowed/submerged units), matching the Wildfire ruling. (Black Plague/Great Famine are the
// deliberate whole-site exception, covered elsewhere.) Here: Year of the Blaze and Cursed Iron.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

function injectAura(g: GameState, name: string, x: number, y: number): string {
  const cardId = `c${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: 0 }
  const id = `r${g.nextId++}`
  ;(g.auras as any)[id] = { id, cardId, name, controller: 0, squares: [{ x, y }], enteredTurn: 0 }
  return id
}
const burrow = (g: GameState, u: any) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'burrowing', duration: 'permanent', turn: g.turn, sourcePlayer: u.controller })

describe('Year of the Blaze consumes only the surface', () => {
  it('kills a surface minion but not a burrowed one under the affected site', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const surf = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); surf.enteredTurn = -1
    const under = summonCard(g, 0, 'Bone Jumble', 2, 2, 'underground'); under.enteredTurn = -1; burrow(g, under)
    const id = injectAura(g, 'Year of the Blaze', 2, 2)

    getScript('Year of the Blaze')!.startOfTurn!(makeCtx(g, id, 0, []))
    expect(g.units[surf.id], 'the surface minion is consumed').toBeUndefined()
    expect(g.units[under.id], 'the burrowed minion under the site survives the blaze').toBeTruthy()
  })
})

describe('Cursed Iron sears only surface bearers', () => {
  function bearerWithArtifact(g: GameState, region: 'surface' | 'underground') {
    const bearer = summonCard(g, 0, 'Escyllion Cyclops', 2, 2, region); bearer.enteredTurn = -1
    if (region === 'underground') burrow(g, bearer)
    const cardId = `ca${g.nextId++}`; g.cards[cardId] = { id: cardId, name: 'Meat Hook', owner: 0 }
    const aid = `a${g.nextId++}`
    ;(g.artifacts as any)[aid] = { id: aid, cardId, name: 'Meat Hook', conjuredBy: 0, x: 2, y: 2, region, carriedBy: bearer.id, tapped: false }
    bearer.carrying.push(aid)
    return bearer
  }

  it('a surface bearer is seared, a burrowed one is not', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const id = injectAura(g, 'Cursed Iron', 2, 2)
    const surfaceBearer = bearerWithArtifact(g, 'surface')
    getScript('Cursed Iron')!.endOfEveryTurn!(makeCtx(g, id, 0, []))
    expect(g.units[surfaceBearer.id]?.damage, 'the surface bearer is seared for 1').toBe(1)

    const g2 = newGame() as GameState; keepBoth(g2)
    placeSite(g2, 0, 'Rustic Village', 2, 2)
    const id2 = injectAura(g2, 'Cursed Iron', 2, 2)
    // reuse the closure on g2
    const bearer2 = (() => {
      const bearer = summonCard(g2, 0, 'Bone Jumble', 2, 2, 'underground'); bearer.enteredTurn = -1; burrow(g2, bearer)
      const cardId = `ca${g2.nextId++}`; g2.cards[cardId] = { id: cardId, name: 'Meat Hook', owner: 0 }
      const aid = `a${g2.nextId++}`
      ;(g2.artifacts as any)[aid] = { id: aid, cardId, name: 'Meat Hook', conjuredBy: 0, x: 2, y: 2, region: 'underground', carriedBy: bearer.id, tapped: false }
      bearer.carrying.push(aid)
      return bearer
    })()
    getScript('Cursed Iron')!.endOfEveryTurn!(makeCtx(g2, id2, 0, []))
    expect(g2.units[bearer2.id]?.damage ?? 0, 'the burrowed bearer is not seared').toBe(0)
  })
})
