import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, giveArtifact, placeSite } from './helpers'
import { makeCtx, checkStateBased, fireVolleyProjectiles } from '../src'

// Poisonous Dagger grants the bearer Lethal. Lethal makes ANY damage the unit
// deals — as itself — enough to destroy: its strike, its Ranged shot, AND its
// activated abilities (Sparkmage's spark, Flamecaller's flame). It does NOT make
// spells the bearer merely casts lethal. 'Ancient Dragon' (defence 6) is the guinea
// pig: 1 point of damage never kills it normally, so a death proves lethality.

describe('Poisonous Dagger — Lethal applies to a unit ability (ctx.dealDamage)', () => {
  it('1 damage from a bearer ability kills a defence-6 minion', () => {
    const g = newGame(); keepBoth(g)
    const mage = summonCard(g, 0, 'Sparkmage', 1, 1)
    giveArtifact(g, mage, 'Poisonous Dagger')
    const foe = summonCard(g, 1, 'Ancient Dragon', 2, 1)

    makeCtx(g, mage.id, 0, []).dealDamage({ unit: foe.id }, 1)
    checkStateBased(g)

    expect(g.units[foe.id], 'the poisoned spark was lethal').toBeUndefined()
  })

  it('WITHOUT the dagger, the same 1 damage leaves it alive (control)', () => {
    const g = newGame(); keepBoth(g)
    const mage = summonCard(g, 0, 'Sparkmage', 1, 1)
    const foe = summonCard(g, 1, 'Ancient Dragon', 2, 1)

    makeCtx(g, mage.id, 0, []).dealDamage({ unit: foe.id }, 1)
    checkStateBased(g)

    expect(g.units[foe.id], 'survives without Lethal').toBeTruthy()
    expect(g.units[foe.id].damage).toBe(1)
  })
})

describe('Poisonous Dagger — Lethal applies to a unit-fired projectile ability', () => {
  it("a bearer's flame volley is lethal", () => {
    const g = newGame(); keepBoth(g)
    // sites along the ray so the projectile can travel (a void ends its flight)
    placeSite(g, 0, 'Spire', 1, 1); placeSite(g, 0, 'Spire', 2, 1)
    const shooter = summonCard(g, 0, 'Flamecaller', 0, 1)
    giveArtifact(g, shooter, 'Poisonous Dagger')
    const foe = summonCard(g, 1, 'Ancient Dragon', 2, 1)

    fireVolleyProjectiles(g, {
      player: 0, ox: 0, oy: 1, region: 'surface', dir: 'e',
      volleys: 1, damage: 1, filter: 'notStealth', excludeId: shooter.id, srcName: 'Flamecaller',
    })

    expect(g.units[foe.id], 'the unit-fired projectile was lethal').toBeUndefined()
  })

  it('a SPELL projectile is NOT lethal even if the caster bears the dagger (control)', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 1, 1); placeSite(g, 0, 'Spire', 2, 1)
    const caster = summonCard(g, 0, 'Sparkmage', 0, 1)
    giveArtifact(g, caster, 'Poisonous Dagger')
    const foe = summonCard(g, 1, 'Ancient Dragon', 2, 1)

    // srcName is a Magic card (Firebolts) → the spell deals the damage, not the unit
    fireVolleyProjectiles(g, {
      player: 0, ox: 0, oy: 1, region: 'surface', dir: 'e',
      volleys: 1, damage: 1, filter: 'notStealth', excludeId: caster.id, srcName: 'Firebolts',
    })

    expect(g.units[foe.id], 'a cast spell does not inherit the bearer Lethal').toBeTruthy()
    expect(g.units[foe.id].damage).toBe(1)
  })
})
