// Failed Mutation: "Can't be targeted or damaged by magic." A MAGIC projectile (Firebolts, a Magic
// card) must not pick it as a target — it flies right past. A non-magic projectile (a unit/ability
// shot) still hits it, and magic projectiles still hit unprotected enemies.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { fireVolleyProjectiles, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function laneGame(): GameState {
  const g = newGame(42, 0) as GameState; keepBoth(g)
  // a 3-square lane of sites so the projectile can travel east and units can stand on it
  placeSite(g, 0, 'Rustic Village', 0, 1)
  placeSite(g, 0, 'Rustic Village', 1, 1)
  placeSite(g, 0, 'Rustic Village', 2, 1)
  const av = avatarOf(g, 0); av.x = 0; av.y = 1
  return g
}
const volley = (g: GameState, srcName: string, volleys = 1) =>
  fireVolleyProjectiles(g, {
    player: 0, ox: 0, oy: 1, region: 'surface', dir: 'e', volleys, damage: 1,
    filter: 'notStealth', excludeId: avatarOf(g, 0).id, srcName,
  })

describe('magic protection blocks magic projectiles (Firebolts) but not unit shots', () => {
  it('Firebolts cannot target or damage a Failed Mutation — it flies past', () => {
    const g = laneGame()
    const fm = summonCard(g, 1, 'Failed Mutation', 2, 1); fm.enteredTurn = -1
    volley(g, 'Firebolts', 3)
    expect(fm.damage, 'magic-protected minion takes no damage from the magic projectile').toBe(0)
    expect(g.prompts.length, 'and is never even offered as a target').toBe(0)
  })

  it('a NON-magic projectile (a unit shot) still hits the Failed Mutation', () => {
    const g = laneGame()
    const fm = summonCard(g, 1, 'Failed Mutation', 2, 1); fm.enteredTurn = -1
    volley(g, 'Stygian Archers') // a Minion, not a Magic → protection does not apply
    expect(fm.damage, 'non-magic damage is unaffected by magic protection').toBe(1)
  })

  it('Magic Missiles (default filter) also cannot hit a Failed Mutation', () => {
    const g = laneGame()
    const fm = summonCard(g, 1, 'Failed Mutation', 2, 1); fm.enteredTurn = -1
    volley(g, 'Magic Missiles', 3)
    expect(fm.damage, 'magic-protected minion takes no damage from Magic Missiles').toBe(0)
    expect(g.prompts.length).toBe(0)
  })

  it('Firebolts still hits an unprotected enemy', () => {
    const g = laneGame()
    const enemy = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); enemy.enteredTurn = -1
    volley(g, 'Firebolts')
    expect(enemy.damage, 'ordinary enemies are still hit').toBe(1)
  })
})
