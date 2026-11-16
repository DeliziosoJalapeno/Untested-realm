import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { gainLife } from '../src/engine/effects'

// Every life gain records a flow.lifeGains entry (Avatar unit id, amount actually gained, seq) so the client
// can float a green "+N" above that Avatar.
describe('life-gain floats are recorded', () => {
  it('records the amount gained on the gaining Avatar', () => {
    const g: any = newGame(7); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    av.life = 10
    gainLife(g, 0, 3)
    expect(g.flow.lifeGains.at(-1)).toMatchObject({ unitId: av.id, amount: 3 })
  })

  it('records only what was actually gained under the life cap, and nothing at full life', () => {
    const g: any = newGame(7); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    const max = av.counters?.maxLife ?? 20
    av.life = max - 1
    gainLife(g, 0, 5)
    expect(g.flow.lifeGains.at(-1)).toMatchObject({ unitId: av.id, amount: 1 })
    const seq = g.flow.lifeGainSeq
    gainLife(g, 0, 2)
    expect(g.flow.lifeGainSeq, 'no entry at full life').toBe(seq)
  })
})
