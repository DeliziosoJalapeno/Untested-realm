import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, answer } from './helpers'
import { summonToken, reconcileSummonTax } from '../src'

const summon3 = (g: any) => {
  summonToken(g, 'Foot Soldier', 0, 1, 1)
  summonToken(g, 'Frog', 0, 1, 1)
  summonToken(g, 'Skeleton', 0, 1, 1)
}
const countTokens = (g: any) => Object.values(g.units).filter((u: any) => ['Foot Soldier', 'Frog', 'Skeleton'].includes(u.name)).length

describe('Mock Court summon tax — batched, pay-if-able, prompt only when short', () => {
  it('affordable: all tokens summon and you pay for every one (no prompt)', () => {
    const g: any = newGame(); keepBoth(g); placeSite(g, 0, 'Mock Court', 2, 0)
    g.players[0].mana = 5
    summon3(g); reconcileSummonTax(g)
    expect(g.players[0].mana).toBe(2)
    expect(countTokens(g)).toBe(3)
    expect(g.prompts.length).toBe(0)
  })

  it("can't afford all: prompt to keep as many as you can pay for; the rest never arrive", () => {
    const g: any = newGame(); keepBoth(g); placeSite(g, 0, 'Mock Court', 2, 0)
    g.players[0].mana = 1 // can pay for exactly ONE of the three
    summon3(g)
    const ids = Object.values(g.units).filter((u: any) => ['Foot Soldier', 'Frog', 'Skeleton'].includes(u.name)).map((u: any) => u.id)
    reconcileSummonTax(g)
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(p.data.count, 'may keep only what 1 mana buys').toBe(1)
    expect(p.data.candidates.length).toBe(3)
    answer(g, [ids[1]]) // keep the Frog
    expect(g.units[ids[1]], 'the paid-for token stays').toBeTruthy()
    expect(g.units[ids[0]], 'unpaid token gone').toBeFalsy()
    expect(g.units[ids[2]], 'unpaid token gone').toBeFalsy()
    expect(g.players[0].mana, 'paid 1').toBe(0)
  })

  it("can't afford any: no prompt, none of the tokens arrive", () => {
    const g: any = newGame(); keepBoth(g); placeSite(g, 0, 'Mock Court', 2, 0)
    g.players[0].mana = 0
    summon3(g); reconcileSummonTax(g)
    expect(g.prompts.length).toBe(0)
    expect(countTokens(g)).toBe(0)
  })
})
