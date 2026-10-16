import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'
import '../src/cards/scripts/index'

// "Whenever Sea Raider attacks and kills an enemy, its controller discards their topmost spell. You
// may cast that spell once this turn, ignoring threshold." — "its controller" is the killed enemy's
// controller: the raider plunders the DEFEATED player's spellbook (like Captain Baldassare), not its
// own. Regression: the raider's controller discarded and cast their own topmost spell.
describe('Sea Raider plunders the enemy it killed', () => {
  it("takes the defeated player's topmost spell, castable this turn", () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 1, 'Rustic Village', 2, 0)
    const raider = summonCard(g, 0, 'Sea Raider', 2, 0); raider.enteredTurn = -1
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 0); foe.enteredTurn = -1
    const mine = [...g.players[0].spellbook]
    const theirs = [...g.players[1].spellbook]

    act(g, 0, { t: 'moveAttack', unitId: raider.id, path: [], attack: { unit: foe.id } })
    while (g.prompts.length) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage'
        ? { strikerId: p.data.strikerId, allocation: { [foe.id]: 3 } } : true)
    }

    expect(g.units[foe.id], 'the enemy died').toBeUndefined()
    expect(g.players[0].spellbook, "the raider's own spellbook is untouched").toEqual(mine)
    expect(g.players[1].spellbook, "the defeated player's topmost spell is gone").toEqual(theirs.slice(1))
    expect(g.players[0].hand, 'it is in the raider controller\'s hand to cast').toContain(theirs[0])
    expect(g.flow?.noThresholdCards ?? []).toContain(theirs[0])
  })
})
