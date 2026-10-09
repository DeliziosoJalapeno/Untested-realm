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
    hook()(makeCtx(g, sk.id, 0, []), sk, { x: -1, y: -1, region: 'offboard' as any }, 'move', true)
    expect(g.prompts.length, 'no volley on the initial cast').toBe(0)
  })

  it('a BASIC move offers the volley once it ENDS (final step), as an origin choice', () => {
    const g = newGame(); keepBoth(g)
    const sk = summonCard(g, 0, 'Skirmishers of Mu', 2, 2)
    // mid-march (non-final) step: just accumulates the path, no prompt yet
    hook()(makeCtx(g, sk.id, 0, []), sk, { x: 2, y: 1, region: 'surface' }, 'move', false)
    expect(g.prompts.length, 'no prompt mid-march').toBe(0)
    // the final step ends the move → offer "shoot from which square on your march?"
    hook()(makeCtx(g, sk.id, 0, []), sk, { x: 2, y: 1, region: 'surface' }, 'move', true)
    expect(g.prompts.length, 'a volley origin is offered when the march ends').toBe(1)
    expect(g.prompts[0]?.kind, 'the player picks the origin square along the path').toBe('chooseSquare')
    // the start square (2,1) and squares entered (2,2) are both offered as origins
    const squares = (g.prompts[0] as any).data.squares as { x: number; y: number }[]
    expect(squares.some((s) => s.x === 2 && s.y === 1), 'the starting square is a legal origin').toBe(true)
  })

  it('a FORCED relocation (Wuthering Heights / teleport) offers NO volley', () => {
    const g = newGame(); keepBoth(g)
    const sk = summonCard(g, 0, 'Skirmishers of Mu', 2, 2)
    // direct hook call with via='forced'
    hook()(makeCtx(g, sk.id, 0, []), sk, { x: 2, y: 1, region: 'surface' }, 'forced', true)
    expect(g.prompts.length, 'no volley on a forced move').toBe(0)
    // and end-to-end: a real teleport (the Wuthering Heights path) must not trigger it either
    placeSite(g, 0, 'Rustic Village', 3, 2)
    makeCtx(g, sk.id, 0, []).teleport(sk.id, 3, 2, 'surface')
    expect(g.prompts.length, 'teleport is not basic movement → no volley').toBe(0)
  })
})
