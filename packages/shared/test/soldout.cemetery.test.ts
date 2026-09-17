// Sold-out Cemetery: "Whenever Undead enter this site, push another Undead here away one step." In a
// Move & Attack this must resolve BETWEEN the move and the attack: the mover enters, the SITE's
// controller pushes an Undead out (never the one just entering), and only THEN is the attack declared —
// so a target that was pushed away can no longer be hit, and the attacker instead picks a new co-located
// target (or ends its movement). The GUI still declares the attack up front; the engine defers it.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'

describe('Sold-out Cemetery vs Move & Attack', () => {
  it('pushes the target out before the attack, then lets the attacker retarget', () => {
    const g = newGame(); keepBoth(g)
    g.activePlayer = 0
    placeSite(g, 1, 'Sold-out Cemetery', 2, 2) // player 1 controls the cemetery
    placeSite(g, 0, 'Rustic Village', 2, 1)     // the attacker's starting square
    placeSite(g, 1, 'Rustic Village', 2, 3)     // where a pushed Undead can shamble to
    const victim = summonCard(g, 1, 'Barrow Wight', 2, 2); victim.enteredTurn = -5 // the DECLARED target
    const bystander = summonCard(g, 1, 'Bone Jumble', 2, 2); bystander.enteredTurn = -5 // another Undead here
    const attacker = summonCard(g, 0, 'Crawler', 2, 1); attacker.enteredTurn = -5 // 3/3 Undead

    // Move & Attack: move into the cemetery and (as declared up front) attack the Barrow Wight.
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: victim.id } })

    // 1) the entering Undead triggered the cemetery → the SITE controller (player 1) is asked which
    //    Undead to push out. The entering attacker is NOT a candidate — only the OTHER Undead here.
    let p = g.prompts[0]
    expect(p?.player, 'the site controller chooses whom to push').toBe(1)
    expect(([...(p!.data as any).candidates] as string[]).sort(), 'only the other Undead, never the mover')
      .toEqual([victim.id, bystander.id].sort())
    answer(g, [victim.id]) // player 1 evacuates the Barrow Wight (dodging the attack)

    // 2) it can shamble to (2,1) or (2,3) → the pushed unit's controller picks the direction
    p = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    answer(g, { x: 2, y: 3, region: 'surface' })

    // the attack step now resolves: the Barrow Wight is gone from the square, so the attacker is
    // re-prompted to declare a new target among what's still here (the Bone Jumble).
    p = g.prompts[0]
    expect(p?.player, 'the attacker declares a new target').toBe(0)
    expect(([...(p!.data as any).candidates] as string[])).toEqual([bystander.id])
    answer(g, [bystander.id])
    answer(g, []) // the Bone Jumble's controller declines to defend it

    expect([victim.x, victim.y], 'the Barrow Wight escaped the cemetery').toEqual([2, 3])
    expect(victim.damage ?? 0, 'the declared target was never struck (it dodged)').toBe(0)
    expect(g.units[bystander.id], 'the retargeted Bone Jumble was struck down (3 vs 1)').toBeFalsy()
    expect(attacker.tapped && attacker.x === 2 && attacker.y === 2, 'the attacker completed its move').toBe(true)
  })

  it('can decline the retarget (end movement with no attack)', () => {
    const g = newGame(); keepBoth(g)
    g.activePlayer = 0
    placeSite(g, 1, 'Sold-out Cemetery', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    placeSite(g, 1, 'Rustic Village', 2, 3)
    const victim = summonCard(g, 1, 'Barrow Wight', 2, 2); victim.enteredTurn = -5
    const bystander = summonCard(g, 1, 'Bone Jumble', 2, 2); bystander.enteredTurn = -5
    const attacker = summonCard(g, 0, 'Crawler', 2, 1); attacker.enteredTurn = -5

    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: victim.id } })
    answer(g, [victim.id])                 // push the target out
    answer(g, { x: 2, y: 3, region: 'surface' })
    answer(g, [])                          // decline to retarget → no attack

    expect(g.units[bystander.id]?.damage ?? 0, 'declining means nothing is attacked').toBe(0)
    expect(victim.damage ?? 0).toBe(0)
  })
})
