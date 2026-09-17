import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act } from './helpers'
import { beginTurn } from '../src'

// Every source that PROVIDES mana records a flow.manaGains entry (x,y,region,amount,seq) so the
// client can float a "+n ◆" over it.
describe('mana-gain floats are recorded per source', () => {
  it('start-of-turn provision floats +1 over each of your sites', () => {
    const g: any = newGame(7); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0)
    placeSite(g, 0, 'Rustic Village', 3, 0)
    g.flow = g.flow ?? {}; g.flow.manaGains = []; g.flow.manaGainSeq = 0
    beginTurn(g, 0)
    const gains = g.flow.manaGains as { x: number; y: number; amount: number }[]
    expect(gains.some((m) => m.x === 2 && m.y === 0 && m.amount === 1), '+1 over site (2,0)').toBe(true)
    expect(gains.some((m) => m.x === 3 && m.y === 0 && m.amount === 1), '+1 over site (3,0)').toBe(true)
  })

  it('Field Laborers floats +2 over itself when tapped', () => {
    const g: any = newGame(7); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const laborers = summonCard(g, 0, 'Field Laborers', 2, 1)
    laborers.enteredTurn = -1; laborers.tapped = false
    g.flow = g.flow ?? {}; g.flow.manaGains = []; g.flow.manaGainSeq = 0
    const before = g.players[0].mana
    act(g, 0, { t: 'activate', sourceId: laborers.id, ability: 'toil' })
    expect(g.players[0].mana - before, 'gained 2 mana').toBe(2)
    const gains = g.flow.manaGains as { x: number; y: number; amount: number }[]
    expect(gains.some((m) => m.x === 2 && m.y === 1 && m.amount === 2), '+2 floats over the Laborers').toBe(true)
  })
})
