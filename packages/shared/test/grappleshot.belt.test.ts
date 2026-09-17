// Grapple Shot fires from the grappling ALLY, so the direction-picker's conveyor belt must anchor
// on the ally minion — not on the avatar caster (graphical: the belt's `from` origin).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, castMagic, waiveThreshold } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Grapple Shot direction belt anchors on the ally', () => {
  it("the 'fire' prompt's origin is the ally's square, not the avatar's", () => {
    const g: GameState = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0 // avatar in the corner
    const ally = summonCard(g, 0, 'Bone Jumble', 3, 1); ally.enteredTurn = -1 // the grappling ally, elsewhere
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Grapple Shot', { targets: [ally.id] })
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseOption')
    expect(p?.data?.from, 'belt origin is the ally, not the avatar (0,0)').toEqual({ x: 3, y: 1 })
  })
})
