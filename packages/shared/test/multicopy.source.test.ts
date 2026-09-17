// Bug class: an effect that resolves ITSELF via find-by-name grabs the first copy, not the one that
// triggered. With two Shackled Demons, the release ability granted by demon B must free demon B.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { grantedAbilities, avatarOf, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('multi-copy self-resolution (Shackled Demon)', () => {
  it("releasing via the demon you're next to frees THAT demon, not the first copy", () => {
    const g: GameState = newGame(); keepBoth(g)
    const demonA = summonCard(g, 1, 'Shackled Demon', 1, 1); (demonA as any).disabled = true
    const demonB = summonCard(g, 1, 'Shackled Demon', 3, 1); (demonB as any).disabled = true
    // the avatar (a valid releaser) stands adjacent to demon B only
    const av = avatarOf(g, 0); av.x = 3; av.y = 2; av.region = 'surface'; av.tapped = false

    const rel = grantedAbilities(g, av).find((a) => a.key === 'shackles:release')
    expect(rel, 'demon B grants the release ability to the adjacent avatar').toBeTruthy()
    rel!.effect(makeCtx(g, av.id, 0, []))

    expect((g.units[demonB.id] as any)?.disabled, 'demon B (adjacent) is released').toBeFalsy()
    expect((g.units[demonA.id] as any)?.disabled, 'demon A (far) stays shackled').toBe(true)
  })
})
