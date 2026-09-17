// Blaze of Glory makes an ally FIGHT each nearby enemy. Each blow is a strike, so it must honor
// the fighter's Lethal — including a TEMPORARY one (Gift of the Serpent grants `lethal` for the
// turn). Regression: the fight dealt raw damage without passing `lethal`, so lethal was ignored.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, castMagic, waiveThreshold } from './helpers'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('Blaze of Glory honors the fighter’s Lethal', () => {
  it('a hero with (temporary) Lethal kills a high-defence foe it fights', () => {
    const g: GameState = newGame(); keepBoth(g); waiveThreshold(g, 0)
    const hero = summonCard(g, 0, 'Bone Jumble', 0, 2) // a 1/1 (corner, away from the enemy avatar)
    hero.modifiers.push({ kind: 'keyword', keyword: 'lethal' } as any) // e.g. Gift of the Serpent, this turn
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 0, 3) // 6/6, the sole nearby foe

    castMagic(g, 0, 'Blaze of Glory', { targets: [hero.id] })
    expect(g.units[foe.id], 'the 6/6 foe died to the hero’s lethal blow (1 dmg)').toBeUndefined()
  })

  it('control: without Lethal the same fight leaves the 6/6 foe alive on 1 damage', () => {
    const g: GameState = newGame(); keepBoth(g); waiveThreshold(g, 0)
    const hero = summonCard(g, 0, 'Bone Jumble', 0, 2)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 0, 3)

    castMagic(g, 0, 'Blaze of Glory', { targets: [hero.id] })
    expect(g.units[foe.id], 'the foe survives a mere 1 damage').toBeTruthy()
    expect(g.units[foe.id]?.damage).toBe(1)
  })
})
