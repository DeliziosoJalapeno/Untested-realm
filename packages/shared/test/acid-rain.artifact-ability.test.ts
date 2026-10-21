// An artifact silenced by an aura (Acid Rain) also loses its ACTIVATED ability — not just its
// passive text. Regression: canActivate gated sites on siteSilenced but never checked artifacts.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, waiveThreshold, summonCard, giveArtifact } from './helpers'
import { canActivate } from '../src/engine/game'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('Acid Rain silences an artifact ability', () => {
  it("a silenced Ferryman's Coin can't use its ability", () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const bearer = summonCard(g, 0, 'Bone Jumble', 2, 2); bearer.enteredTurn = -1
    const coin = giveArtifact(g, bearer, "Ferryman's Coin").id // carried: an uncontrolled coin can't be used at all
    expect(canActivate(g, 0, coin, 'toll'), 'usable while the coin is active').toBeNull()

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Acid Rain', { at: { x: 2, y: 2 } }) // 2x2 aura silences artifacts here
    expect(canActivate(g, 0, coin, 'toll'), 'a silenced coin can no longer be activated').toMatch(/silenced/i)
  })
})
