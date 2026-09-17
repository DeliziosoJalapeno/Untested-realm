import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, waiveThreshold } from './helpers'
import { getScript } from '../src/cards/scripts/registry'
import { makeCtx, killUnit } from '../src/engine/effects'

// Mismanaged Mortuary: "Treat your opponent's cemetery as yours, and vice versa."
// The genesis swaps the two cemetery ARRAY references; deaths route through
// toCemetery which counter-swaps so a card lands in its OWNER's owned pile (FAQ:
// "you always put your cards into the cemetery you own"). Bug: spells, discards and
// mills pushed straight to players[owner].cemetery, bypassing that counter-swap —
// so with a Mortuary up they landed in the WRONG pile (looked un-swapped).

/** stand up one Mortuary and fire its (site) genesis, like the cast path does. */
function withMortuary() {
  const g = newGame(42, 0); keepBoth(g)
  const site = placeSite(g, 0, 'Mismanaged Mortuary', 2, 2)
  getScript('Mismanaged Mortuary')!.genesis!(makeCtx(g, site.id, 0, []))
  // after the swap, player 0's OWNED pile (nearby their deck) is the array that
  // players[1].cemetery now references; a P0-owned card going to cemetery must land there.
  return g
}

describe('Mismanaged Mortuary swaps magic/mill/discard, not just existing cards', () => {
  it('a minion death is swapped (control — this already worked)', () => {
    const g = withMortuary()
    const x = summonCard(g, 0, 'Bone Jumble', 2, 2)
    killUnit(g, x.id)
    expect(g.players[1].cemetery, 'P0 death lands in P0’s owned pile (players[1] ref)').toContain(x.cardId)
    expect(g.players[0].cemetery).not.toContain(x.cardId)
  })

  it('a milled spell is swapped the same way', () => {
    const g = withMortuary()
    // inject a P0-owned spell on top of P0's spellbook, then mill 1
    const id = 'spellX'
    g.cards[id] = { id, name: 'Immolation', owner: 0 } as any
    g.players[0].spellbook.unshift(id)
    makeCtx(g, g.players[0].avatarUnitId, 0, []).mill!(0, 'spellbook', 1)
    expect(g.players[1].cemetery, 'milled spell lands in P0’s owned pile').toContain(id)
    expect(g.players[0].cemetery).not.toContain(id)
  })

  it('a resolved magic spell is swapped (the reported bug)', () => {
    const g = withMortuary()
    // put an enemy minion on the avatar's own square so Immolation's "nearby" resolves,
    // and cast from the avatar (the spellcaster) with thresholds waived
    const av = g.units[g.players[0].avatarUnitId]
    const foe = summonCard(g, 1, 'Bone Jumble', av.x, av.y)
    waiveThreshold(g, 0)
    const before = new Set(g.players[1].cemetery)
    castMagic(g, 0, 'Immolation', { targets: [foe.id] })
    // the Immolation card (owned by P0) must have filed into P0's owned pile (players[1] ref)
    const added = g.players[1].cemetery.filter((c) => !before.has(c))
    const spell = added.map((cid) => g.cards[cid]).find((c) => c?.name === 'Immolation')
    expect(spell, 'resolved Immolation filed into P0’s owned (swapped) pile').toBeTruthy()
    expect(g.players[0].cemetery.some((cid) => g.cards[cid]?.name === 'Immolation')).toBe(false)
  })
})
