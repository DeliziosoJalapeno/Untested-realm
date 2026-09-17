// After a multi-location damage spell/ability resolves, the engine records the damaged grid in
// state.flow.areaReveal (synced to BOTH players) so the client can flash a numbered grid that
// fades. beginAreaReveal resets per cast/ability; recordAreaReveal appends + bumps seq.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, answer, giveMana, waiveThreshold } from './helpers'
import { avatarOf, beginAreaReveal, recordAreaReveal } from '../src'

describe('area-damage reveal', () => {
  it('Lava Flow records its 5/4/2 grid in flow.areaReveal', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    for (const x of [0, 1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 0)
    castMagic(g, 0, 'Lava Flow')
    answer(g, 'e') // flow east
    const rev = g.flow.areaReveal
    expect(rev, 'areaReveal is set after the cast resolves').toBeTruthy()
    expect(rev.cells.map((c: any) => c.dmg).sort((a: number, b: number) => a - b), 'the printed 5/4/2 grid').toEqual([2, 4, 5])
    expect(rev.seq, 'seq bumped so the client fires the reveal once').toBeGreaterThan(0)
  })

  it('beginAreaReveal resets (clears cells, keeps seq); recordAreaReveal only appends when open', () => {
    const g: any = newGame(); keepBoth(g)
    beginAreaReveal(g, 'fire')
    recordAreaReveal(g, [{ x: 1, y: 1, dmg: 5 }, { x: 1, y: 2, dmg: 3 }])
    expect(g.flow.areaReveal.cells.length).toBe(2)
    expect(g.flow.areaReveal.element).toBe('fire')
    const seqAfter = g.flow.areaReveal.seq
    // a new begin clears the cells (fresh capture) but preserves seq until damage lands again
    beginAreaReveal(g, 'earth')
    expect(g.flow.areaReveal.cells.length).toBe(0)
    expect(g.flow.areaReveal.seq).toBe(seqAfter)
    // an empty record is a no-op; a real one bumps seq
    recordAreaReveal(g, [])
    expect(g.flow.areaReveal.seq).toBe(seqAfter)
    recordAreaReveal(g, [{ x: 0, y: 0, dmg: 1 }])
    expect(g.flow.areaReveal.seq).toBe(seqAfter + 1)
  })
})
