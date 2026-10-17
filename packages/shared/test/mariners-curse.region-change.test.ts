// Mariner's Curse: "Whenever a minion enters an affected water site, submerge it and return Mariner's
// Curse to its owner's hand." Surfacing or submerging within the SAME site is not entering it (the same
// reading Giant Shark's script already follows for "moves between sites") — yet a minion surfacing under
// the Curse was submerged again and the Curse went back to hand.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { emitUnitMoved } from '../src/engine/effects'
import type { GameState, PlayerId } from '../src'
import '../src/cards/scripts/index'

const submerge = (u: any, turn: number) => u.modifiers.push({ kind: 'keyword', keyword: 'submerge', duration: 'permanent', turn, sourcePlayer: u.controller as PlayerId })

function curse(g: GameState, squares: { x: number; y: number }[]): string {
  const cardId = `ctest${g.nextId++}`
  const auraId = `ra${g.nextId++}`
  g.cards[cardId] = { id: cardId, name: "Mariner's Curse", owner: 0 }
  g.auras[auraId] = { id: auraId, cardId, name: "Mariner's Curse", controller: 0, squares, enteredTurn: 0 }
  return auraId
}

describe("Mariner's Curse ignores surfacing and submerging in place", () => {
  it('a minion surfacing on the cursed site stays up, and the Curse stays in play', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Great Wall', 2, 2).flooded = true
    const auraId = curse(g, [{ x: 2, y: 2 }])
    const m = summonCard(g, 1, 'Bone Jumble', 2, 2, 'underwater'); submerge(m, g.turn)

    m.region = 'surface'
    emitUnitMoved(g, m, { x: 2, y: 2, region: 'underwater' }) // it surfaced, same site
    expect(m.region, 'not pulled back under').toBe('surface')
    expect(g.auras[auraId], 'the Curse is still in play').toBeTruthy()
  })

  it('a minion moving onto the cursed site from another site is still submerged', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Great Wall', 2, 2).flooded = true
    placeSite(g, 0, 'Great Wall', 1, 2).flooded = true
    const auraId = curse(g, [{ x: 2, y: 2 }])
    const m = summonCard(g, 1, 'Bone Jumble', 2, 2, 'surface'); submerge(m, g.turn)

    emitUnitMoved(g, m, { x: 1, y: 2, region: 'surface' }) // it entered from (1,2)
    expect(m.region).toBe('underwater')
    expect(g.auras[auraId], 'the Curse returned to hand').toBeUndefined()
  })
})
