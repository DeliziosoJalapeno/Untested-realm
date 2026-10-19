// Croaking Swamp — 'Genesis → You may pay (1) to summon a Frog token here.' The Frog has Submerge, and a
// summoned minion with Submerge may arrive underwater at a water site (casting.ts lets a cast one do so),
// so the token gets the same choice: on the surface or submerged.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, answer, placeSite } from './helpers'
import { makeCtx, getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

function genesis(g: GameState): string {
  g.players[0].mana = 1
  const site = placeSite(g, 0, 'Croaking Swamp', 2, 2)
  getScript('Croaking Swamp')!.genesis!(makeCtx(g, site.id, 0, []))
  return site.id
}
const frogs = (g: GameState) => Object.values(g.units).filter((u) => u.name === 'Frog')

describe('Croaking Swamp: the Frog may be summoned on the surface or submerged', () => {
  it('pays (1) and offers both regions', () => {
    const g = newGame(42, 0); keepBoth(g)
    genesis(g)
    answer(g, true)
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    expect(g.prompts[0]?.data?.options).toEqual(['On the surface', 'Submerged'])
  })

  it('summons a submerged Frog when asked', () => {
    const g = newGame(42, 0); keepBoth(g)
    genesis(g)
    answer(g, true)
    answer(g, 'Submerged')
    expect(frogs(g).map((u) => [u.x, u.y, u.region])).toEqual([[2, 2, 'underwater']])
    expect(g.players[0].mana).toBe(0)
  })

  it('summons the Frog on the surface when asked', () => {
    const g = newGame(42, 0); keepBoth(g)
    genesis(g)
    answer(g, true)
    answer(g, 'On the surface')
    expect(frogs(g).map((u) => [u.x, u.y, u.region])).toEqual([[2, 2, 'surface']])
    expect(g.players[0].mana).toBe(0)
  })

  it('declining summons nothing and costs nothing', () => {
    const g = newGame(42, 0); keepBoth(g)
    genesis(g)
    answer(g, false)
    expect(g.prompts).toHaveLength(0)
    expect(frogs(g)).toHaveLength(0)
    expect(g.players[0].mana).toBe(1)
  })
})
