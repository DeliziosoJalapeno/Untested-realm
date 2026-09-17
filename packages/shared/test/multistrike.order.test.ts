import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx } from '../src'

// #6: every "strike each enemy" effect strikes its targets SIMULTANEOUSLY (rulebook/FAQ) —
// no prompt, no chosen order. Wraetannis Titan's "Genesis → strike each enemy here" is one.
describe('multi-strike effects strike simultaneously (no order prompt)', () => {
  it('Wraetannis Titan genesis strikes two co-located enemies at once', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    const titan = summonCard(g, 0, 'Wraetannis Titan', 2, 2); titan.enteredTurn = 0
    const e1 = summonCard(g, 1, 'Conqueror Worm', 2, 2); e1.enteredTurn = 0 // 8/8, survives one strike
    const e2 = summonCard(g, 1, 'Conqueror Worm', 2, 2); e2.enteredTurn = 0
    getScript('Wraetannis Titan')!.genesis!(makeCtx(g, titan.id, 0, []))

    expect(g.prompts.length, 'no order prompt — simultaneous').toBe(0)
    expect(g.units[e1.id]?.damage, 'e1 struck').toBeGreaterThan(0)
    expect(g.units[e2.id]?.damage, 'e2 struck').toBeGreaterThan(0)
  })
})
