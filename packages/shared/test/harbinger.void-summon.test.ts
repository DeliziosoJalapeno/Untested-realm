// Harbinger's portents let you cast a minion to a fated square even without your own site there — but
// the void-placement rule OUTRANKS that grant: a non-voidwalk minion still can't be summoned onto a
// void (siteless) portent square. Only the voidwalk requirement is waived by voidwalk itself.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { validateSummonAt } from '../src/engine/casting'
import { avatarOf } from '../src'
import '../src/cards/scripts/index'

describe('Harbinger + void placement priority', () => {
  it('a non-voidwalk minion cannot be cast onto a void portent square', () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); (av as any).name = 'Harbinger' // this seat's avatar IS the Harbinger
    g.flow = g.flow ?? {}
    g.flow.harbinger = { 0: [{ x: 1, y: 1 }] } as any // (1,1) has no site → it is void ground

    const err = validateSummonAt(g, 0, 'Foot Soldiers', { x: 1, y: 1, region: 'surface' })
    expect(err, 'the void rule blocks a non-voidwalk minion even on a portent').toMatch(/void/i)
  })
})
