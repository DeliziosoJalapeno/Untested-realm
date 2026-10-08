// An artifact silenced by an aura (Acid Rain) also loses its ACTIVATED ability — not just its
// passive text. Regression: canActivate gated sites on siteSilenced but never checked artifacts.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, waiveThreshold } from './helpers'
import { canActivate } from '../src/engine/game'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

function groundArtifact(g: GameState, name: string, x: number, y: number, owner = 0): string {
  const cid = `ctest${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner } as any
  const aid = `atest${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name, conjuredBy: owner, x, y, region: 'surface', carriedBy: null, tapped: false } as any
  return aid
}

describe('Acid Rain silences an artifact ability', () => {
  it("a silenced Ferryman's Coin can't use its ability", () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const coin = groundArtifact(g, "Ferryman's Coin", 2, 2)
    expect(canActivate(g, 0, coin, 'toll'), 'usable while the coin is active').toBeNull()

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Acid Rain', { at: { x: 2, y: 2 } }) // 2x2 aura silences artifacts here
    expect(canActivate(g, 0, coin, 'toll'), 'a silenced coin can no longer be activated').toMatch(/silenced/i)
  })
})
