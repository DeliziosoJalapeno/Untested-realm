// Vivien "has the printed abilities of all Avatars and Spellcasters in the realm" — including the
// Elementalist's "You have an additional 🜁🜃🜂🜄". That grant is an `affinityBonus` DATA field read by
// card name (not a function hook), so — exactly like a masked Imposter — Vivien's ability-copying
// forwarders skipped it and she provided none of the copied affinity. She should now supply it,
// even when the Elementalist is the OPPONENT's avatar (its own +affinity only helps its own seat).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { affinity, type UnitState } from '../src'

const ELEMS = ['air', 'earth', 'fire', 'water'] as const
const makeSpellcaster = (u: UnitState) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'spellcaster', duration: 'permanent', turn: 0, sourcePlayer: 0 } as any)

describe('Vivien copies an Elementalist avatar', () => {
  it("grants VIVIEN's controller +1 each element from the opponent's Elementalist", () => {
    const g: any = newGame(); keepBoth(g)
    g.units[g.players[1].avatarUnitId].name = 'Elementalist' // opponent is the Elementalist

    const before = affinity(g, 0) // no Vivien yet → opponent's Elementalist does nothing for seat 0
    const viv = summonCard(g, 0, 'Vivien the Enchantress', 0, 1); viv.enteredTurn = -5
    const after = affinity(g, 0)

    for (const e of ELEMS) {
      expect(after[e], `${e} should gain +1 via Vivien copying the Elementalist`).toBe(before[e] + 1)
    }
  })

  it('a silenced Vivien copies nothing', () => {
    const g: any = newGame(); keepBoth(g)
    g.units[g.players[1].avatarUnitId].name = 'Elementalist'
    const base = affinity(g, 0)
    const viv = summonCard(g, 0, 'Vivien the Enchantress', 0, 1); viv.enteredTurn = -5
    viv.silenced = true
    const after = affinity(g, 0)
    for (const e of ELEMS) expect(after[e], `${e} unchanged while Vivien is silenced`).toBe(base[e])
  })

  it("doesn't double-count when two copies of a spellcaster source are present", () => {
    // Vivien has each printed ability ONCE, however many copies of the source are in play. Two
    // spellcaster Blacksmith Family (fire affinityBonus) should lend Vivien +1 fire, not +2.
    const g: any = newGame(); keepBoth(g)
    for (const [x, y] of [[2, 2], [3, 2]] as const) {
      const bf = summonCard(g, 0, 'Blacksmith Family', x, y); bf.enteredTurn = -5; makeSpellcaster(bf)
    }
    const noViv = affinity(g, 0) // the two units each grant their own fire affinity already
    const viv = summonCard(g, 0, 'Vivien the Enchantress', 0, 1); viv.enteredTurn = -5
    const withViv = affinity(g, 0)
    // Vivien's copy of the (identically-named) source adds fire exactly once, not once per copy.
    expect(withViv.fire - noViv.fire, 'Vivien copies the shared fire affinity once').toBe(1)
  })
})
