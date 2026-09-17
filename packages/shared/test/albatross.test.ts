// Accursed Albatross: "when a UNIT kills it, kill that unit's OTHER nearby allied minions."
// Regression: the Albatross has power 1, so it strikes BACK at its killer — and that retaliation
// overwrote the global flow.lastHitBy, so the deathrite could no longer find its killer and did
// nothing. Fixed by a per-victim killer record (flow.killerByVictim).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'

describe('Accursed Albatross deathrite', () => {
  it("kills the killer's nearby allies (not the killer itself)", () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const attacker = summonCard(g, 0, 'Stygian Archers', 2, 2, 'surface'); attacker.enteredTurn = 0 // 3/3, survives the 1 strike-back
    attacker.modifiers.push({ kind: 'keyword', keyword: 'airborne' } as any) // only Airborne can attack the Albatross
    const alba = summonCard(g, 1, 'Accursed Albatross', 2, 2, 'surface'); alba.enteredTurn = 0    // 1/1, Airborne
    const ally = summonCard(g, 0, 'Stygian Archers', 2, 1, 'surface'); ally.enteredTurn = 0        // nearby the killer

    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: alba.id } })
    let guard = 0
    while (g.prompts.length && guard++ < 8) { const p = g.prompts[0]; answer(g, p.kind === 'defend' ? [] : null) }

    expect(g.units[alba.id], 'the Albatross died').toBeUndefined()
    expect(g.units[ally.id], "the killer's nearby ally is cursed to death").toBeUndefined()
    expect(g.units[attacker.id], 'the killer itself is spared (only its OTHER allies die)').toBeTruthy()
  })

  it("curses the killer's allies EVEN IF the killer dies in the same trade", () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const attacker = summonCard(g, 0, 'Stygian Archers', 2, 2, 'surface'); attacker.enteredTurn = 0
    attacker.modifiers.push({ kind: 'keyword', keyword: 'airborne' } as any)
    attacker.damage = 2 // the Albatross's 1-power retaliation now finishes it (2+1 ≥ 3 defence) → a trade
    const alba = summonCard(g, 1, 'Accursed Albatross', 2, 2, 'surface'); alba.enteredTurn = 0
    const ally = summonCard(g, 0, 'Stygian Archers', 2, 1, 'surface'); ally.enteredTurn = 0

    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: alba.id } })
    let guard = 0
    while (g.prompts.length && guard++ < 8) { const p = g.prompts[0]; answer(g, p.kind === 'defend' ? [] : null) }

    expect(g.units[alba.id], 'the Albatross died').toBeUndefined()
    expect(g.units[attacker.id], 'the killer ALSO died (trade)').toBeUndefined()
    expect(g.units[ally.id], "the dead killer's nearby ally is STILL cursed").toBeUndefined()
  })
})
