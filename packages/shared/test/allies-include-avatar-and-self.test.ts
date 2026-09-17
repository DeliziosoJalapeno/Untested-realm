// "Allies" effects (no "OTHER") include BOTH the source itself and an allied AVATAR — avatars are allies
// and positive buffs apply to them. And an Avatar is never Evil (Evil is a minion classification).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { avatarOf, effAttack, isEvilUnit, isLegalStep, GRID_H, type GameState } from '../src'
import { dealDamageToUnit } from '../src/engine/effects'
import '../src/cards/scripts/index'

describe('allies buffs include the avatar and the source itself', () => {
  it('Ruler of Thul: an allied avatar on an edge-row site gets +1, and the Ruler edge-moves itself', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0)             // top row
    placeSite(g, 0, 'Rustic Village', 2, GRID_H - 1)    // bottom row
    const av = avatarOf(g, 0); av.x = 2; av.y = 0; av.region = 'surface'
    const without = effAttack(g, av) // the avatar may already carry other buffs — measure the Ruler's delta
    summonCard(g, 0, 'Ruler of Thul', 1, 1)
    expect(effAttack(g, av), 'allied avatar on an edge-row site gains +1 from the Ruler').toBe(without + 1)

    // "Allies can move as if the top/bottom edges were connected" — INCLUDES the Ruler itself
    const ruler = Object.values(g.units).find((u) => u.name === 'Ruler of Thul')!
    ruler.x = 2; ruler.y = 0; ruler.region = 'surface'
    expect(isLegalStep(g, ruler, { x: 2, y: 0, region: 'surface' }, { x: 2, y: GRID_H - 1, region: 'surface' }), 'the Ruler wraps edge-to-edge itself').toBe(true)
  })

  it('a Demon-typed Avatar (Mephistopheles) stays Evil (FAQ 1953)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const av = avatarOf(g, 0); av.name = 'Mephistopheles'; g.cards[av.cardId].name = 'Mephistopheles'
    expect(isEvilUnit(g, av)).toBe(true)
  })

  it('Sir Priamus is immune to Lethal himself ("Nearby allies" is self-inclusive)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const pri = summonCard(g, 0, 'Sir Priamus', 2, 2); pri.enteredTurn = -1
    dealDamageToUnit(g, pri, 1, 1, { lethal: true, source: { player: 1, kind: 'effect' } })
    expect(g.units[pri.id], 'a Lethal blow did not destroy Sir Priamus — he shields himself').toBeTruthy()
  })
})
