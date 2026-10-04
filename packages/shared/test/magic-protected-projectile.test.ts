// Failed Mutation: "Can't be targeted or damaged by magic." It BLOCKS a magic projectile at its square
// — absorbing the shot, taking no damage, and stopping anything beyond from being hit — while staying an
// ordinary target for non-magic shots (Ranged minions, abilities).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { fireVolleyProjectiles, avatarOf, type GameState } from '../src'
import '../src/cards/scripts/index'

function laneGame(): GameState {
  const g = newGame(42, 0) as GameState; keepBoth(g)
  // a 4-square lane of sites so projectiles can travel east and units can stand on it
  for (const x of [0, 1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 1)
  const av = avatarOf(g, 0); av.x = 0; av.y = 1
  return g
}
const volley = (g: GameState, srcName: string, volleys = 1) =>
  fireVolleyProjectiles(g, {
    player: 0, ox: 0, oy: 1, region: 'surface', dir: 'e', volleys, damage: 1,
    filter: 'notStealth', excludeId: avatarOf(g, 0).id, srcName,
  })

describe('magic projectiles are blocked by a magic-protected minion', () => {
  it('Firebolts is absorbed by a Failed Mutation — no damage, and a unit behind it is safe', () => {
    const g = laneGame()
    const fm = summonCard(g, 1, 'Failed Mutation', 2, 1); fm.enteredTurn = -1
    const behind = summonCard(g, 1, 'Escyllion Cyclops', 3, 1); behind.enteredTurn = -1
    volley(g, 'Firebolts', 3)
    expect(fm.damage, 'the magic-protected blocker takes no damage').toBe(0)
    expect(behind.damage, 'and the enemy behind it is shielded — the shot is blocked').toBe(0)
    expect(g.prompts.length).toBe(0)
  })

  it('Magic Missiles is likewise blocked', () => {
    const g = laneGame()
    const fm = summonCard(g, 1, 'Failed Mutation', 2, 1); fm.enteredTurn = -1
    const behind = summonCard(g, 1, 'Escyllion Cyclops', 3, 1); behind.enteredTurn = -1
    volley(g, 'Magic Missiles', 3)
    expect(fm.damage).toBe(0)
    expect(behind.damage).toBe(0)
  })

  it('a NON-magic shot still hits the Failed Mutation (it is an ordinary target)', () => {
    const g = laneGame()
    const fm = summonCard(g, 1, 'Failed Mutation', 2, 1); fm.enteredTurn = -1
    volley(g, 'Stygian Archers') // a Minion, not a Magic → protection does not apply
    expect(fm.damage, 'non-magic damage is unaffected by magic protection').toBe(1)
  })

  it('Firebolts still hits an unprotected enemy', () => {
    const g = laneGame()
    const enemy = summonCard(g, 1, 'Escyllion Cyclops', 2, 1); enemy.enteredTurn = -1
    volley(g, 'Firebolts')
    expect(enemy.damage, 'ordinary enemies are still hit').toBe(1)
  })
})
