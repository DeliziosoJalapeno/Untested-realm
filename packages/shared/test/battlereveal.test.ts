// After a battle resolves, the engine records a two-sided reveal in flow.battleReveal (synced to
// both seats): the attacker-side and defender-side affected units (with damage taken / died), the
// site it was fought at, and every log line the battle emitted. The client shows it for 5s.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'

describe('battle reveal', () => {
  it('a 3/3 trade records both sides, the site, deaths, and the battle log', () => {
    const g: any = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2)
    const attacker = summonCard(g, 0, 'Stygian Archers', 2, 2, 'surface'); attacker.enteredTurn = 0
    const target = summonCard(g, 1, 'Stygian Archers', 2, 2, 'surface'); target.enteredTurn = 0

    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: target.id } })
    if (g.prompts.length) answer(g, []) // no allied defenders → don't defend; the target fights

    const rev = g.flow.battleReveal
    expect(rev, 'battleReveal was written').toBeTruthy()
    expect(rev.seq).toBeGreaterThan(0)
    expect(rev.site, 'title site name').toBe(site.name)
    // both 3/3s trade → each side shows one dead unit
    expect(rev.attackers.length, 'attacker side has the attacker').toBe(1)
    expect(rev.attackers[0].died, 'the attacker died in the trade').toBe(true)
    expect(rev.defenders.length, 'defender side has the target').toBe(1)
    expect(rev.defenders[0].died, 'the target died in the trade').toBe(true)
    expect(rev.logs.length, 'the battle log was captured').toBeGreaterThan(0)
    expect(rev.logs.join('\n')).toMatch(/attacks/i)
  })

  it('a SECOND battle bumps the reveal seq (so the client re-fires)', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    const a1 = summonCard(g, 0, 'Stygian Archers', 2, 2, 'surface'); a1.enteredTurn = 0
    const t1 = summonCard(g, 1, 'Stygian Archers', 2, 2, 'surface'); t1.enteredTurn = 0
    const a2 = summonCard(g, 0, 'Stygian Archers', 3, 2, 'surface'); a2.enteredTurn = 0
    const t2 = summonCard(g, 1, 'Stygian Archers', 3, 2, 'surface'); t2.enteredTurn = 0

    act(g, 0, { t: 'moveAttack', unitId: a1.id, path: [], attack: { unit: t1.id } })
    if (g.prompts.length) answer(g, [])
    const seq1 = g.flow.battleReveal.seq

    act(g, 0, { t: 'moveAttack', unitId: a2.id, path: [], attack: { unit: t2.id } })
    if (g.prompts.length) answer(g, [])
    const seq2 = g.flow.battleReveal.seq

    expect(seq1).toBeGreaterThan(0)
    expect(seq2, 'the second battle produced a NEW reveal').toBeGreaterThan(seq1)
  })

  it('a survivor shows the damage it took (not death)', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    // Escyllion Cyclops (6/6) does not strike back when defending → the attacker survives, the
    // Cyclops takes the attacker's blow. Use a beefy attacker that lives.
    const attacker = summonCard(g, 0, 'Escyllion Cyclops', 2, 2, 'surface'); attacker.enteredTurn = 0
    const target = summonCard(g, 1, 'Stygian Archers', 2, 2, 'surface'); target.enteredTurn = 0

    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: target.id } })
    if (g.prompts.length) answer(g, [])

    const rev = g.flow.battleReveal
    expect(rev, 'battleReveal written').toBeTruthy()
    const atk = rev.attackers[0]
    expect(atk.died, 'the 6/6 attacker survived').toBe(false)
    // it took the Archers' 3 power (Cyclops has no strike-back, so it eats the defender's strike)
    expect(atk.dmg, 'the survivor shows the damage it took').toBe(3)
  })
})
