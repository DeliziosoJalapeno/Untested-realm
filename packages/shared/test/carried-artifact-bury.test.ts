// Carried artifacts are buriable too. A burial that also buries the bearer (Cave-In on a normal
// minion) drags the artifact down with it; when the bearer CAN'T be buried (an Avatar), the artifact
// is detached and buried on its own. Same for Bury / Earthquake / the editor.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveMana, waiveThreshold, placeSite, summonCard, giveArtifact, castMagic } from './helpers'
import { avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('carried artifacts can be buried', () => {
  it('Cave-In buries the Avatar\'s carried artifact (detached), even though the Avatar can\'t be buried', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    const art = giveArtifact(g, av, 'Poisonous Dagger')

    castMagic(g, 0, 'Cave-In', { targets: [site.id] })

    expect(av.region, 'the avatar stays on the surface').toBe('surface')
    expect(g.artifacts[art.id].region, 'the carried artifact is buried').toBe('underground')
    expect(g.artifacts[art.id].carriedBy, 'and detached from the avatar').toBeFalsy()
    expect(av.carrying).not.toContain(art.id)
  })

  it('Cave-In buries a (Burrowing) minion WITH its carried artifact (it rides down, still carried)', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2)
    const carrier = summonCard(g, 0, 'Bone Jumble', 2, 2); carrier.enteredTurn = -1
    carrier.modifiers.push({ kind: 'keyword', keyword: 'burrowing', duration: 'permanent', turn: g.turn, sourcePlayer: 0 } as any) // survives underground
    const art = giveArtifact(g, carrier, 'Poisonous Dagger')

    castMagic(g, 0, 'Cave-In', { targets: [site.id] })

    expect(carrier.region, 'the minion is buried').toBe('underground')
    expect(g.artifacts[art.id].region, 'its artifact rides down with it').toBe('underground')
    expect(g.artifacts[art.id].carriedBy, 'still carried').toBe(carrier.id)
  })

  it('Bury targets a carried artifact on the Avatar and buries it (detached)', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    const art = giveArtifact(g, av, 'Poisonous Dagger')

    castMagic(g, 0, 'Bury', { targets: [art.id] })

    expect(g.artifacts[art.id].region, 'buried').toBe('underground')
    expect(g.artifacts[art.id].carriedBy, 'detached from the avatar').toBeFalsy()
  })
})
