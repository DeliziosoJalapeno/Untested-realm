// Drums of Doom: "Damage dealt to minions nearby is lethal." "Nearby" is region-locked to the source
// (the artifact's own region), like every other nearby-minion effect — so a SURFACE Drums does NOT make
// damage lethal to a minion burrowed underground (or submerged underwater) beneath a nearby site.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { getScript, type GameState } from '../src'

function drumsAt(g: GameState, x: number, y: number, region = 'surface'): string {
  const cardId = `cdrums${g.nextId++}`
  ;(g.cards as any)[cardId] = { id: cardId, name: 'Drums of Doom', owner: 0 }
  const id = `adrums${g.nextId++}`
  ;(g.artifacts as any)[id] = { id, cardId, name: 'Drums of Doom', conjuredBy: 0, x, y, region, carriedBy: null, tapped: false }
  return id
}

describe('Drums of Doom "nearby is lethal" is region-locked to the drums', () => {
  it('a surface Drums makes surface damage lethal, but NOT to a minion underground nearby', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    const drums = drumsAt(g, 2, 2, 'surface')
    const onSurface = summonCard(g, 1, 'Bone Jumble', 3, 2); onSurface.region = 'surface'
    const underground = summonCard(g, 1, 'Bone Jumble', 3, 2); underground.region = 'underground'

    const mod = getScript('Drums of Doom')!.damageModifier!
    const src: any = { player: 0, kind: 'effect' }
    // surface minion nearby → damage becomes lethal
    expect(mod(g, drums, onSurface, 1, src)).toEqual({ amount: 1, lethal: true })
    // underground minion at the same nearby square → NOT lethal (plain amount, different region)
    expect(mod(g, drums, underground, 1, src)).toBe(1)
  })

  it('an underground Drums instead reaches the underground minion, not the surface one', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    const drums = drumsAt(g, 2, 2, 'underground')
    const onSurface = summonCard(g, 1, 'Bone Jumble', 3, 2); onSurface.region = 'surface'
    const underground = summonCard(g, 1, 'Bone Jumble', 3, 2); underground.region = 'underground'

    const mod = getScript('Drums of Doom')!.damageModifier!
    const src: any = { player: 0, kind: 'effect' }
    expect(mod(g, drums, underground, 1, src)).toEqual({ amount: 1, lethal: true })
    expect(mod(g, drums, onSurface, 1, src)).toBe(1)
  })
})
