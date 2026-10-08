// Real engine tests for the game-related questions on the official Level 1 judge test.
// Each test asserts the OFFICIALLY CORRECT answer, so a failing test = a genuine engine gap.
// Convention: every unit stands on a real site (bare squares are void); plain Foot Soldiers are
// used wherever a vanilla body suffices, so no card effect muddies the result.
import { describe, it, expect } from 'vitest'
import {
  newGame, keepBoth, summonCard, placeSite, giveArtifact, castMagic, castMagicFail, act, answer, waiveThreshold,
} from './helpers'
import { makeCtx, getScript } from '../src'
import { isDisabled, terrainAt } from '../src/engine/statics'
import '../src/cards/scripts/index'

/** resolve the whole prompt chain with sensible defaults */
function drain(g: any, opts: { dir?: string } = {}) {
  let guard = 0
  while (g.prompts.length && guard++ < 40) {
    const p: any = g.prompts[0]
    if (p.kind === 'defend') answer(g, [])
    else if (p.kind === 'allocateDamage') answer(g, { strikerId: p.data.strikerId, allocation: { [p.data.candidates[0]]: p.data.power } })
    else if (p.kind === 'chooseOption') answer(g, opts.dir ?? p.data.options[0])
    else if (p.kind === 'chooseTargets') answer(g, [p.data.candidates[0]])
    else if (p.kind === 'yesNo') answer(g, true)
    else answer(g, p.data?.options?.[0] ?? true)
  }
}

/** a vanilla Foot Soldiers (1/1) standing on its own fresh site */
function soldierOnSite(g: any, player: 0 | 1, x: number, y: number) {
  placeSite(g, player, 'Rustic Village', x, y)
  const u = summonCard(g, player, 'Foot Soldiers', x, y); u.enteredTurn = -1
  return u
}

describe('Judge L1 — engine conformance', () => {
  // Q31 — a stealth minion attacking your SITE: it loses stealth, but only AFTER the attack,
  // so that attack itself cannot be defended. (User-confirmed intended behavior.)
  it('Q31: a stealth attacker on a site is undefendable, then loses stealth', () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 1, 'Rustic Village', 2, 2)
    const defender = summonCard(g, 1, 'Foot Soldiers', 2, 2); defender.enteredTurn = -1
    const atk = summonCard(g, 0, 'Foot Soldiers', 2, 2); atk.enteredTurn = -1; atk.stealth = true // stands on the enemy site

    const kinds: string[] = []
    act(g, 0, { t: 'moveAttack', unitId: atk.id, path: [], attack: { site: site.id } })
    while (g.prompts.length) { kinds.push(g.prompts[0].kind); answer(g, g.prompts[0].kind === 'defend' ? [] : true) }

    expect(kinds, 'no defend window was offered against a stealth attacker').not.toContain('defend')
    expect(g.units[atk.id]?.stealth ?? false, 'stealth is spent after the attack').toBe(false)
    expect(g.units[defender.id]?.tapped ?? false, 'the defender never got to defend (still untapped)').toBe(false)
  })

  // Q24 — a stealthed Infernal Legion that deals its end-of-turn damage loses stealth (attempting
  // to damage counts as interacting with the realm).
  it('Q24: Infernal Legion loses stealth after its end-of-turn damage', () => {
    const g = newGame(); keepBoth(g)
    const legion = summonCard(g, 0, 'Infernal Legion', 2, 2); legion.enteredTurn = -1; legion.stealth = true
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const foe = soldierOnSite(g, 1, 3, 2) // adjacent

    getScript('Infernal Legion')!.endOfTurn!(makeCtx(g, legion.id, 0, []))

    expect(g.units[foe.id], 'the adjacent foe took the hit').toBeUndefined()
    expect(g.units[legion.id]?.stealth ?? false, 'the Legion revealed itself by attacking').toBe(false)
  })

  // Q29 — Grapple Shot fired by a DISABLED ally (over a burrowed Root Spider) does nothing.
  it('Q29: Grapple Shot from a disabled ally fizzles (no drag)', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [2, 3, 4]) placeSite(g, 0, 'Rustic Village', x, 2)
    const spider = summonCard(g, 1, 'Root Spider', 2, 2, 'underground'); spider.enteredTurn = -1
    const ally = summonCard(g, 0, 'Foot Soldiers', 2, 2); ally.enteredTurn = -1
    summonCard(g, 1, 'Foot Soldiers', 4, 2).enteredTurn = -1
    expect(isDisabled(g, g.units[ally.id]), 'ally is disabled by the burrowed Root Spider').toBe(true)

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Grapple Shot', { targets: [ally.id] })
    drain(g, { dir: 'e' })

    expect(g.units[ally.id]?.x, 'the disabled ally never fired, so it did not move').toBe(2)
  })

  // Q17 — Minor Explosion's "two steps away" cannot cross a VOID square between two sites.
  it('Q17: Minor Explosion cannot reach across a void gap', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 0, 2) // caster site; (1,2) left as void
    const foe = soldierOnSite(g, 1, 2, 2)
    const av = g.units[g.players[0].avatarUnitId]; av.x = 0; av.y = 2

    waiveThreshold(g, 0)
    // (0,2)→(2,2) is blocked by the void at (1,2): with no site to step across, the location is NOT two
    // real steps away (it's unreachable), so the blast can't even target it — refused, not a fizzle.
    const err = castMagicFail(g, 0, 'Minor Explosion', { targets: ['sq:2,2,surface'] })
    expect(err, 'the blast could not cross the void to reach the foe').toMatch(/not a legal target/i)
    expect(g.units[foe.id]?.damage ?? 0).toBe(0)
  })

  // Q27 — a Ranged hit IS a strike, so the bearer's Flaming Sword splashes to co-located enemies.
  it('Q27: Flaming Sword splashes on a Ranged hit', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [0, 1, 2]) placeSite(g, 0, 'Rustic Village', x, 1)
    const shooter = summonCard(g, 0, 'Foot Soldiers', 0, 1); shooter.enteredTurn = -1
    giveArtifact(g, shooter, 'Fail-not Bow'); giveArtifact(g, shooter, 'Flaming Sword')
    const foeA = summonCard(g, 1, 'Foot Soldiers', 2, 1); foeA.enteredTurn = -1
    const foeB = summonCard(g, 1, 'Foot Soldiers', 2, 1); foeB.enteredTurn = -1

    act(g, 0, { t: 'activate', sourceId: shooter.id, ability: 'ranged', extra: { direction: 'e' } })
    drain(g)

    expect(g.units[foeA.id], 'the directly-hit enemy died').toBeUndefined()
    expect(g.units[foeB.id], 'Flaming Sword splashed onto the co-located enemy').toBeUndefined()
  })

  // Q30 — a unit holding MULTIPLE Lance tokens gets +1 PER lance, and all of them break.
  it('Q30: multiple Lance tokens each add +1 and all break', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0)
    const attacker = summonCard(g, 0, 'Foot Soldiers', 2, 0); attacker.enteredTurn = -1 // 1 power
    const l1 = giveArtifact(g, attacker, 'Lance'); const l2 = giveArtifact(g, attacker, 'Lance')
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 0); foe.enteredTurn = -1 // 6 defence, no strike-back — survives to show the number

    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: foe.id } })
    drain(g)

    expect(g.units[foe.id]?.damage ?? 0, '1 power + 2 lances = 3 damage').toBe(3)
    expect(g.artifacts[l1.id], 'first lance broke').toBeUndefined()
    expect(g.artifacts[l2.id], 'second lance broke').toBeUndefined()
  })

  // Q21 — REAL answer: an Aqueduct is a WATER site — you can Drown there, NOT Bury. (Engine is right.)
  it('Q21: Aqueduct is a water site — Drown works, Bury does not', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Aqueduct', 2, 2)
    const u = summonCard(g, 0, 'Foot Soldiers', 2, 2); u.enteredTurn = -1
    expect(terrainAt(g, 2, 2), 'Aqueduct is water terrain').toBe('water')

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Bury', { targets: [u.id] })
    drain(g)
    expect(g.units[u.id]?.region, 'Bury does nothing on a water site').toBe('surface')

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Drown', { targets: [u.id] })
    drain(g)
    expect(g.units[u.id]?.region ?? 'gone', 'Drown DOES affect it (submerged/drowned) — unlike Bury').not.toBe('surface')
  })
})
