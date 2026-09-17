import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { getScript } from '../src/cards/scripts/registry'
import { makeCtx } from '../src/engine/effects'

// Regression: several card scripts (discards, mills, dispelled auras, spent
// artifacts) used a RAW players[owner].cemetery.push, bypassing toCemetery — so
// with an ODD number of Mismanaged Mortuaries up (which route the dead into the
// OPPONENT's cemetery) those cards landed in the WRONG pile. This asserts a
// converted discard path now routes through toCemetery and is swapped.

/** stand up an ODD number of Mismanaged Mortuaries and register them in flow. */
function withOddMortuaries(g: ReturnType<typeof newGame>, n: number): void {
  g.flow = g.flow ?? {}
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const s = placeSite(g, 0, 'Mismanaged Mortuary', 2 + i, 2)
    ids.push(s.id)
  }
  g.flow.mortuaries = [...(g.flow.mortuaries ?? []), ...ids]
}

describe('converted card-script cemetery pushes route through toCemetery (Mortuary swap)', () => {
  it('a discarded spell files into the OPPONENT cemetery while an odd Mortuary count stands', () => {
    const g = newGame(42, 0); keepBoth(g)
    withOddMortuaries(g, 1) // odd → swap active

    // inject a P0-owned spell into P0's hand, then discard it via Chorus of
    // Condemnation's 'condemn' cont — one of the paths converted to toCemetery.
    const id = 'discardX'
    g.cards[id] = { id, name: 'Immolation', owner: 0 } as any
    g.players[0].hand.push(id)

    const ctx = makeCtx(g, g.players[0].avatarUnitId, 0, [])
    getScript('Chorus of Condemnation')!.conts!.condemn(ctx, { pid: 0 }, 'Immolation')

    expect(g.players[0].hand).not.toContain(id)
    // odd Mortuary count → the discard lands in the OPPONENT's (players[1]) pile.
    expect(g.players[1].cemetery, 'discard swapped into opponent pile').toContain(id)
    expect(g.players[0].cemetery).not.toContain(id)
  })

  it('with an EVEN Mortuary count the discard stays in the owner cemetery (no swap)', () => {
    const g = newGame(42, 0); keepBoth(g)
    withOddMortuaries(g, 2) // even → no swap

    const id = 'discardY'
    g.cards[id] = { id, name: 'Immolation', owner: 0 } as any
    g.players[0].hand.push(id)

    const ctx = makeCtx(g, g.players[0].avatarUnitId, 0, [])
    getScript('Chorus of Condemnation')!.conts!.condemn(ctx, { pid: 0 }, 'Immolation')

    expect(g.players[0].cemetery, 'no swap → owner pile').toContain(id)
    expect(g.players[1].cemetery).not.toContain(id)
  })
})
