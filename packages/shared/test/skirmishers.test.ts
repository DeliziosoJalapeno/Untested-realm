// Skirmishers of Mu's volley fires ONLY during BASIC movement (their own Move / Move-and-Attack),
// never on the initial cast nor on a FORCED relocation (blown by Wuthering Heights, teleported…).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx } from '../src'

const hook = () => getScript('Skirmishers of Mu')!.onUnitEntersSquare!

describe('Skirmishers of Mu — volley only during basic movement', () => {
  it('entering the realm from offboard (summon/cast) offers NO volley', () => {
    const g = newGame(); keepBoth(g)
    const sk = summonCard(g, 0, 'Skirmishers of Mu', 2, 2)
    hook()(makeCtx(g, sk.id, 0, []), sk, { x: -1, y: -1, region: 'offboard' as any }, 'move')
    expect(g.prompts.length, 'no volley on the initial cast').toBe(0)
  })

  it('a BASIC move DOES offer a volley', () => {
    const g = newGame(); keepBoth(g)
    const sk = summonCard(g, 0, 'Skirmishers of Mu', 2, 2)
    hook()(makeCtx(g, sk.id, 0, []), sk, { x: 2, y: 1, region: 'surface' }, 'move')
    expect(g.prompts.length, 'a mid-march volley is offered').toBe(1)
  })

  it('a FORCED relocation (Wuthering Heights / teleport) offers NO volley', () => {
    const g = newGame(); keepBoth(g)
    const sk = summonCard(g, 0, 'Skirmishers of Mu', 2, 2)
    // direct hook call with via='forced'
    hook()(makeCtx(g, sk.id, 0, []), sk, { x: 2, y: 1, region: 'surface' }, 'forced')
    expect(g.prompts.length, 'no volley on a forced move').toBe(0)
    // and end-to-end: a real teleport (the Wuthering Heights path) must not trigger it either
    placeSite(g, 0, 'Rustic Village', 3, 2)
    makeCtx(g, sk.id, 0, []).teleport(sk.id, 3, 2, 'surface')
    expect(g.prompts.length, 'teleport is not basic movement → no volley').toBe(0)
  })
})
