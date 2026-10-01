// Blaze of Glory makes an ally fight each nearby enemy through the real combat machinery (fightUnits),
// so striking an enemy Avatar must fire onAllyStrikesAvatar — i.e. the Interrogator triggers (pay 3 life
// or let the Interrogator's controller draw). Covers both the single-foe fast path and the multi-foe
// "choose the order" path.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, castMagic, waiveThreshold, answer } from './helpers'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

function setup() {
  const g = newGame(42, 0) as GameState; keepBoth(g)
  g.units[g.players[0].avatarUnitId].name = 'Interrogator' // player 0 pilots the Interrogator
  const enemyAv = g.units[g.players[1].avatarUnitId]
  const hero = summonCard(g, 0, 'Escyllion Cyclops', enemyAv.x, enemyAv.y); hero.enteredTurn = -1 // ally beside the foe Avatar
  waiveThreshold(g, 0)
  return { g, enemyAv, hero }
}
const interrogationFired = (g: GameState) => g.prompts.some((p) => /Interrogation/.test(p.title))

describe('Blaze of Glory striking an enemy Avatar triggers the Interrogator', () => {
  it('single nearby foe (the Avatar): fires immediately', () => {
    const { g, hero } = setup()
    castMagic(g, 0, 'Blaze of Glory', { targets: [hero.id] })
    expect(interrogationFired(g), 'Interrogation prompt fired on the Blaze fight').toBe(true)
    expect(g.prompts[0].player, 'the struck Avatar\'s controller answers').toBe(1)
  })

  it('multiple nearby foes: fires when you pick the Avatar in the order prompt', () => {
    const { g, enemyAv, hero } = setup()
    summonCard(g, 1, 'Bone Jumble', enemyAv.x, enemyAv.y).enteredTurn = -1 // a second nearby foe → order prompt
    castMagic(g, 0, 'Blaze of Glory', { targets: [hero.id] })
    expect(g.prompts[0]?.title, 'Blaze asks which foe to fight first').toMatch(/fight which enemy next/)
    answer(g, [enemyAv.id]) // fight the Avatar
    expect(interrogationFired(g), 'Interrogation fired after fighting the Avatar').toBe(true)
  })
})
