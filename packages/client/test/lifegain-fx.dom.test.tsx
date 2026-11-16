// An Avatar's life gain (flow.lifeGains) floats a green "+N" from its card; other units show none.
import { describe, it, expect, afterEach } from 'vitest'
import { GameHarness } from './harness'
import { sweepBoardBase } from './domaudit'
import '../../../packages/shared/src/cards/scripts/index'

let active: GameHarness | null = null
afterEach(() => { active?.unmount(); active = null })

describe('life-gain numbers', () => {
  it('a new gain floats +N above the gaining Avatar only', () => {
    const g = sweepBoardBase() as any
    const h = new GameHarness(g).mount(); active = h
    const av0 = g.players[0].avatarUnitId
    const av1 = g.players[1].avatarUnitId
    const fx = (uid: string) => h.container.querySelector(`[data-unit="${uid}"] [data-lifegain]`)
    expect(fx(av0), 'nothing before a gain').toBeNull()

    g.flow = g.flow ?? {}
    g.flow.lifeGainSeq = (g.flow.lifeGainSeq ?? 0) + 1
    g.flow.lifeGains = [...(g.flow.lifeGains ?? []), { unitId: av0, amount: 3, seq: g.flow.lifeGainSeq }]
    h.rerender()
    expect(fx(av0)?.textContent).toBe('+3')
    expect(fx(av1), 'the other Avatar shows nothing').toBeNull()
  })
})
