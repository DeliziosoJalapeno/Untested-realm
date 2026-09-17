// Hillock Basilisk / Stone-gaze Gorgons disable OTHER minions "at rest". A minion PARTAKING in a
// battle is NOT at rest until the fight is over and damage is allocated — so it must keep its
// abilities (and be able to strike back), even one the disabler had frozen. flow.battleUnits marks
// the current combatants; disablesOnlyAtRest sources skip them.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer } from './helpers'
import { isDisabled, checkStateBased, applyAction } from '../src'

describe('at-rest disablers spare battle participants', () => {
  it('a Gorgons-disabled minion is un-disabled while it is in flow.battleUnits', () => {
    const g: any = newGame(); keepBoth(g)
    summonCard(g, 1, 'Stone-gaze Gorgons', 2, 2).enteredTurn = -5 // disables OTHER minions at/adjacent
    const victim = summonCard(g, 0, 'Bone Jumble', 2, 2); victim.enteredTurn = -5 // shares its square
    checkStateBased(g)
    expect(isDisabled(g, g.units[victim.id]), 'at rest next to the Gorgons → disabled').toBe(true)

    g.flow = g.flow ?? {}
    g.flow.battleUnits = [victim.id] // now partaking in a battle
    expect(isDisabled(g, g.units[victim.id]), 'in a battle → NOT disabled').toBe(false)

    g.flow.battleUnits = undefined // battle over, damage allocated
    expect(isDisabled(g, g.units[victim.id]), 'comes to rest → disabled again').toBe(true)
  })

  it('a defender the Basilisk had frozen still strikes back in the battle', () => {
    const g: any = newGame(); keepBoth(g)
    for (let y = 0; y < 3; y++) placeSite(g, 0, 'Spire', 2, y) // a lane to attack along
    // player 1 Basilisk at (2,2): disables its square + one step "in front" (toward player 0 = y-1 = (2,1))
    summonCard(g, 1, 'Hillock Basilisk', 2, 2).enteredTurn = -5
    const def = summonCard(g, 1, 'Stygian Archers', 2, 1); def.enteredTurn = -5 // frozen in front of the Basilisk (3/3, trades)
    const atk = summonCard(g, 0, 'Stygian Archers', 2, 0); atk.enteredTurn = -5 // OUTSIDE the Basilisk's range
    checkStateBased(g)
    expect(isDisabled(g, g.units[def.id]), 'the defender is frozen at rest before the fight').toBe(true)
    expect(isDisabled(g, g.units[atk.id]), 'the attacker is clear of the Basilisk').toBe(false)

    // move onto the defender's square and attack it; resolve any defend prompt with no extra defenders
    const res = applyAction(g, 0, { t: 'moveAttack', unitId: atk.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: def.id } })
    expect(res.ok).toBe(true)
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : (g.prompts[0].data as any).squares?.[0] ?? [])

    // the defender was un-frozen for the fight and struck back → a 3/3 trade kills the attacker
    expect(g.units[atk.id], 'the disabled defender struck back and traded').toBeUndefined()
  })

  it('a Basilisk-disabled minion still cannot JOIN a battle as a defender (only un-disables if attacked)', () => {
    const g: any = newGame(); keepBoth(g)
    for (const [x, y] of [[2, 1], [2, 2], [2, 3], [3, 2]] as const) placeSite(g, 0, 'Spire', x, y)
    const basilisk = summonCard(g, 1, 'Hillock Basilisk', 2, 2); basilisk.enteredTurn = -5 // disables (2,2) + front (2,1)
    const frozen = summonCard(g, 1, 'Bone Jumble', 2, 1); frozen.enteredTurn = -5 // disabled, would-be defender
    const free = summonCard(g, 1, 'Bone Jumble', 3, 2); free.enteredTurn = -5 // clear, CAN defend
    const atk = summonCard(g, 0, 'Bone Jumble', 2, 3); atk.enteredTurn = -5
    checkStateBased(g)
    expect(isDisabled(g, g.units[frozen.id])).toBe(true)

    // attack the Basilisk itself → its controller gets a defend window
    const res = applyAction(g, 0, { t: 'moveAttack', unitId: atk.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: basilisk.id } })
    expect(res.ok).toBe(true)
    const defend = g.prompts.find((p: any) => p.kind === 'defend')
    expect(defend, 'a defend window opened').toBeTruthy()
    const cands: string[] = (defend!.data as any).candidates
    expect(cands, 'the un-frozen minion is offered').toContain(free.id)
    expect(cands, 'the Basilisk-frozen minion is NOT offered as a defender').not.toContain(frozen.id)
  })
})
