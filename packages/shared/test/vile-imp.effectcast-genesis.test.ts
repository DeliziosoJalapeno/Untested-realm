// A minion cast by an EFFECT (Toolbox "cast an Ordinary spell from your collection", Silver Bullet,
// the Malleus, a Chaoswish copy…) must still get to fire its Genesis — INCLUDING picking the Genesis's
// target. The effect-cast path only prompted for the summon square and finished with NO targets, so a
// targeted Genesis (Vile Imp: "May deal 2 damage to target adjacent unit") did nothing. Regression test.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { applyAction } from '../src'
import { effectCastSpell } from '../src/engine/casting'

describe('effect-cast minion still fires its targeted Genesis (Vile Imp via Toolbox et al.)', () => {
  it('Vile Imp cast from an effect prompts for its Genesis target and deals the 2 damage', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 2)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 2) // 6/6 — survives, so we can read the damage
    foe.enteredTurn = -1

    // cast Vile Imp as an effect (free copy — cost is irrelevant to the Genesis bug)
    effectCastSpell(g, 0, 'Vile Imp')

    // 1) "summon where?" → land it at (1,2), adjacent to the Cyclops
    let p = g.prompts[0]
    expect(p?.kind, 'first prompt is the summon square').toBe('chooseSquare')
    applyAction(g, p!.player, { t: 'prompt', promptId: p!.id, choice: { x: 1, y: 2 } })

    // 2) Genesis target prompt — the effect-cast path must now offer the adjacent-unit choice
    p = g.prompts[0]
    expect(p?.kind, "Vile Imp's Genesis target is now prompted (the bug: it wasn't)").toBe('chooseTargets')
    applyAction(g, p!.player, { t: 'prompt', promptId: p!.id, choice: [foe.id] })

    // the minion entered AND its Genesis dealt 2 damage
    expect(Object.values(g.units).some((u: any) => u.name === 'Vile Imp' && u.controller === 0), 'Vile Imp entered the realm').toBe(true)
    expect(g.units[foe.id]?.damage, 'the adjacent Cyclops took 2 Genesis damage').toBe(2)
  })
})
