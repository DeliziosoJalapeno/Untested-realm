// A masked Imposter must provide its MASK's elemental affinity. Elementalist grants +1 to every
// element (affinityBonus), but that's a data field read by card name — so a masked Imposter was
// getting NO thresholds from it. It should get the full +🜁🜃🜂🜄 the moment it dons the mask.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { affinity } from '../src'

describe('Imposter masked as Elementalist gains its affinity', () => {
  it('grants +1 to each element once the Elementalist mask is worn', () => {
    const g: any = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    av.name = 'Imposter'

    const before = affinity(g, 0) // unmasked Imposter contributes no elemental affinity
    g.flow = g.flow ?? {}
    g.flow.imposterMask = { 0: 'Elementalist' }
    const after = affinity(g, 0)

    for (const e of ['air', 'earth', 'fire', 'water'] as const) {
      expect(after[e], `${e} should gain +1 from the Elementalist mask`).toBe(before[e] + 1)
    }
  })

  it('an UNmasked Imposter provides no elemental affinity', () => {
    const g: any = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    av.name = 'Imposter'
    const a = affinity(g, 0)
    expect([a.air, a.earth, a.fire, a.water]).toEqual([0, 0, 0, 0])
  })
})
