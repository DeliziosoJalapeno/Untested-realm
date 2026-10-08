// Batch 2 of the Level 1 judge-test engine checks: Q16 (Free City self-defense), Q19 (a carried
// avatar when its mount burrows), Q32 (a site caster choosing which region a region-dependent magic
// hits). Each asserts the REAL correct answer read from the graded form.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, act, answer, waiveThreshold, giveArtifact } from './helpers'
import { syncCarried } from '../src/engine/carrying'
import { checkStateBased } from '../src/engine/effects'
import { avatarOf } from '../src'
import '../src/cards/scripts/index'

function drain(g: any, opts: { dir?: string; region?: string } = {}) {
  let guard = 0
  while (g.prompts.length && guard++ < 40) {
    const p: any = g.prompts[0]
    if (p.kind === 'defend') answer(g, [])
    else if (p.kind === 'allocateDamage') answer(g, { strikerId: p.data.strikerId, allocation: { [p.data.candidates[0]]: p.data.power } })
    else if (p.kind === 'chooseOption') {
      const opts2: string[] = p.data.options
      const pick = (opts.region && opts2.includes(opts.region)) ? opts.region : (opts.dir && opts2.includes(opts.dir) ? opts.dir : opts2[0])
      answer(g, pick)
    } else if (p.kind === 'chooseTargets') answer(g, [p.data.candidates[0]])
    else if (p.kind === 'yesNo') answer(g, true)
    else answer(g, p.data?.options?.[0] ?? true)
  }
}

describe('Judge L1 — engine conformance (batch 2)', () => {
  // Q16 — attacking a Free City site: it defends itself (strikes the attacker for its 3 power) AND
  // the attacker's damage to the site still costs its controller that much life.
  it('Q16: a Free City defends itself against a direct site attack', () => {
    const g = newGame(); keepBoth(g)
    const city = placeSite(g, 1, 'Free City', 2, 2)
    const attacker = summonCard(g, 0, 'Ancient Dragon', 2, 2); attacker.enteredTurn = -1 // 6/6, durable enough to survive & show the number
    const defLifeBefore = avatarOf(g, 1).life ?? 0

    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { site: city.id } })
    // commit ONLY the Free City as its own defender (the defending avatar is also offered, but we want
    // just the city here). Defending is optional, so we pick the city's pseudo-defender explicitly.
    { const p: any = g.prompts[0]; expect(p?.kind, 'a defend window was opened for the city').toBe('defend')
      const cityDef = p.data.candidates.find((id: string) => g.units[id]?.name === 'Free City')
      expect(cityDef, 'the Free City is offered as its own defender').toBeTruthy()
      answer(g, [cityDef]) }
    drain(g)

    expect(g.units[attacker.id]?.damage ?? 0, 'the Free City struck the attacker for 3').toBe(3)
    expect((avatarOf(g, 1).life ?? 0), 'the site took 6 → controller lost 6 life').toBe(defLifeBefore - 6)
  })

  // Q19 — a War Horse (granted Burrowing by Kingdom of Agartha) that burrows while carrying your
  // avatar DROPS the avatar: avatars can never leave the surface.
  it('Q19: a carried avatar is dropped (stays surface) when its mount burrows', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Kingdom of Agartha', 2, 2)
    const horse = summonCard(g, 0, 'War Horse', 2, 2); horse.enteredTurn = -1
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; av.region = 'surface'
    horse.carryingUnits = [av.id]; av.carriedBy = horse.id

    horse.region = 'underground' // the mount burrows
    syncCarried(g, horse); checkStateBased(g)

    expect(av.region, 'the avatar can never leave the surface').toBe('surface')
    expect(av.carriedBy ?? null, 'the avatar was dropped by the burrowing mount').toBeNull()
  })

  // Q32 — River of Flame (a site spellcaster) exists in BOTH surface and underground, so when it casts
  // a region-dependent blast you choose ONE region: hit the burrowed Bats OR the surface soldiers, not both.
  it('Q32: a site caster picks which region Minor Explosion hits', () => {
    const g = newGame(); keepBoth(g)
    const river = placeSite(g, 0, 'River of Flame', 2, 2)
    const bats = summonCard(g, 1, 'Palliburrie Bats', 2, 2, 'underground'); bats.enteredTurn = -1
    const soldier = summonCard(g, 1, 'Foot Soldiers', 2, 2); soldier.enteredTurn = -1

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Minor Explosion', { casterId: river.id, targets: ['sq:2,2,surface'] })
    drain(g, { region: 'underground' }) // choose to blast the subsurface

    expect(g.units[bats.id], 'the burrowed Bats were blasted').toBeUndefined()
    expect(g.units[soldier.id], 'the surface soldiers were spared (one region only)').toBeTruthy()
  })

  // Oversized/Rack-stretched caster: a distance-measured blast (Minor Explosion, "≤2 steps") is measured
  // from a CHOSEN occupied square. A target 2 steps from the far body but 4 from the near body is only
  // reachable when the caster fires from the far square.
  it('an oversized caster chooses which square a ranged blast measures from', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [0, 2, 3, 4]) placeSite(g, 0, 'Rustic Village', x, 0)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0; av.region = 'surface'
    ;(av as any).extraSquares = [{ x: 2, y: 0 }] // stretched so it also occupies (2,0)
    const foe = summonCard(g, 1, 'Foot Soldiers', 4, 0); foe.enteredTurn = -1 // 2 steps from (2,0), 4 from (0,0)

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Minor Explosion', { targets: ['sq:4,0,surface'] })
    // answer the origin prompt by firing from the far body square (2,0)
    { const p: any = g.prompts[0]; expect(p?.kind, 'an origin-square prompt was raised').toBe('chooseSquare'); answer(g, { x: 2, y: 0 }) }
    drain(g)

    expect(g.units[foe.id], 'reachable (2 steps) when fired from the far square').toBeUndefined()
  })

  // Same origin choice for a NON-magic projectile: a stretched shooter with a Ranged ability fires from
  // a chosen square. A foe 2 east of the far body (4 from the near body) is only hit from the far square.
  it('an oversized shooter picks the origin for its Ranged ability', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [0, 2, 3, 4]) placeSite(g, 0, 'Rustic Village', x, 0)
    const shooter = summonCard(g, 0, 'Foot Soldiers', 0, 0); shooter.enteredTurn = -1
    ;(shooter as any).extraSquares = [{ x: 2, y: 0 }]
    giveArtifact(g, shooter, 'Fail-not Bow') // Ranged 3
    const foe = summonCard(g, 1, 'Foot Soldiers', 4, 0); foe.enteredTurn = -1 // 2 east of (2,0); 4 east of (0,0)

    act(g, 0, { t: 'activate', sourceId: shooter.id, ability: 'ranged', extra: { direction: 'e' } })
    { const p: any = g.prompts[0]; expect(p?.kind, 'an origin-square prompt was raised for the shot').toBe('chooseSquare'); answer(g, { x: 2, y: 0 }) }
    drain(g)

    expect(g.units[foe.id], 'the shot reached the foe from the far body square').toBeUndefined()
  })

  // Regression: the region prompt must fire for EVERY magic a site caster casts, not just square-target
  // ones. Heat Ray is a PROJECTILE (no square target) — it still has to ask River of Flame which region
  // to fire from. A missed prompt would silently shoot along the surface.
  it('Q32b: a projectile magic (Heat Ray) via a site caster still prompts for region', () => {
    const g = newGame(); keepBoth(g)
    const river = placeSite(g, 0, 'River of Flame', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2); placeSite(g, 0, 'Rustic Village', 4, 2)
    const bat = summonCard(g, 1, 'Palliburrie Bats', 3, 2, 'underground'); bat.enteredTurn = -1
    const soldier = summonCard(g, 1, 'Foot Soldiers', 3, 2); soldier.enteredTurn = -1

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Heat Ray', { casterId: river.id, extra: { direction: 'e' } })
    expect(g.prompts[0]?.kind, 'a region prompt is raised even for a projectile spell').toBe('chooseOption')
    drain(g, { region: 'underground' }) // fire the ray through the subsurface

    expect(g.units[bat.id], 'the underground bat was hit by the subsurface ray').toBeUndefined()
    expect(g.units[soldier.id], 'the surface soldier was spared').toBeTruthy()
  })
})
