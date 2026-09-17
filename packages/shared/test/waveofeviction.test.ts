// Wave of Eviction: an allied water site overflows in a cardinal direction, flooding the sites in that
// line and carrying each flooded site's enemies one step onward. It starts AT the origin water site
// (its enemies are carried too), and per the FAQ the wave CONTINUES ACROSS A VOID — a siteless square
// is passed over (not flooded, no push into it), and sites beyond the gap are still flooded and their
// enemies carried.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, answer } from './helpers'
import { getScript, makeCtx } from '../src'

describe('Wave of Eviction', () => {
  it('carries origin-site enemies, and continues across a void (a2→e2, c2 void)', () => {
    const g = newGame(); keepBoth(g)
    // row 2 (y=1): a2 b2 [c2 VOID] d2 e2 — the wave surges east from a2
    const a2 = placeSite(g, 0, 'Rustic Village', 0, 1); a2.flooded = true // the allied WATER site (origin)
    placeSite(g, 0, 'Rustic Village', 1, 1) // b2
    placeSite(g, 0, 'Rustic Village', 3, 1) // d2
    placeSite(g, 0, 'Rustic Village', 4, 1) // e2
    // (2,1) c2 is deliberately left siteless → a void
    const onA2 = summonCard(g, 1, 'Escyllion Cyclops', 0, 1) // enemy on the origin site
    const onD2 = summonCard(g, 1, 'Escyllion Cyclops', 3, 1) // enemy past the void

    getScript('Wave of Eviction')!.onCast!(makeCtx(g, g.players[0].avatarUnitId, 0, [{ site: a2.id }], undefined, undefined, { kind: 'magic', name: 'Wave of Eviction' }))
    answer(g, 'e') // surge east

    // origin enemy is carried, but piles up at b2 (can't be pushed into the c2 void)
    expect([onA2.x, onA2.y], 'a2 enemy carried to b2').toEqual([1, 1])
    // the wave crosses the void and still sweeps the d2 enemy onward to e2
    expect([onD2.x, onD2.y], 'd2 enemy carried to e2').toEqual([4, 1])
  })

  it('does not carry the caster’s own minions', () => {
    const g = newGame(); keepBoth(g)
    const a2 = placeSite(g, 0, 'Rustic Village', 0, 1); a2.flooded = true
    placeSite(g, 0, 'Rustic Village', 1, 1)
    const ally = summonCard(g, 0, 'Escyllion Cyclops', 0, 1) // the caster's OWN minion

    getScript('Wave of Eviction')!.onCast!(makeCtx(g, g.players[0].avatarUnitId, 0, [{ site: a2.id }], undefined, undefined, { kind: 'magic', name: 'Wave of Eviction' }))
    answer(g, 'e')

    expect([ally.x, ally.y], 'allied minions ride out the flood in place').toEqual([0, 1])
  })
})
