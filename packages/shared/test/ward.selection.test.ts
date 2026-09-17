import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, answer, waiveThreshold } from './helpers'
import { makeCtx } from '../src/engine/effects'
import { getScript } from '../src/cards/scripts/registry'

// The player must SELECT which Wards to break/steal/move — never an arbitrary engine pick —
// and warded SITES count alongside warded units everywhere a "Ward" is referenced.

describe('Divine Lance: choose which allied Wards to break (units AND sites)', () => {
  function setup() {
    const g = newGame(42, 0); keepBoth(g); waiveThreshold(g, 0)
    const myUnit = summonCard(g, 0, 'Escyllion Cyclops', 0, 0); myUnit.ward = true; myUnit.enteredTurn = 0
    const mySite = placeSite(g, 0, 'Great Wall', 4, 3); mySite.ward = true
    const tgtSite = placeSite(g, 1, 'Great Wall', 2, 2)
    const enemy = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); enemy.enteredTurn = 0 // 6/6, survives 3
    return { g, myUnit, mySite, tgtSite, enemy }
  }

  it('offers each allied warded unit AND site as a selectable target (not a count)', () => {
    const { g, myUnit, mySite, tgtSite } = setup()
    castMagic(g, 0, 'Divine Lance', { targets: [tgtSite.id] })
    const p = g.prompts[0]
    expect(p?.kind, 'a real target selection, not a chooseOption count').toBe('chooseTargets')
    expect(p?.data?.kind).toBe('unitOrSite')
    expect(new Set(p!.data.candidates)).toEqual(new Set([myUnit.id, mySite.id]))
  })

  it('breaking BOTH deals 1 + 2 = 3', () => {
    const { g, myUnit, mySite, enemy, tgtSite } = setup()
    castMagic(g, 0, 'Divine Lance', { targets: [tgtSite.id] })
    answer(g, [myUnit.id, mySite.id])
    expect(g.units[myUnit.id]?.ward ?? false).toBe(false)
    expect(g.sites[mySite.id]?.ward ?? false).toBe(false)
    expect(g.units[enemy.id]?.damage).toBe(3)
  })

  it('breaking only the SITE deals 1 + 1 = 2 and leaves the unit Warded', () => {
    const { g, myUnit, mySite, enemy, tgtSite } = setup()
    castMagic(g, 0, 'Divine Lance', { targets: [tgtSite.id] })
    answer(g, [mySite.id])
    expect(g.sites[mySite.id]?.ward ?? false).toBe(false)
    expect(g.units[myUnit.id]?.ward).toBe(true)
    expect(g.units[enemy.id]?.damage).toBe(2)
  })
})

describe('Heretics of Seth: pick which nearby Ward to steal (unit or site)', () => {
  it('prompts when 2+ nearby Wards, and can steal a SITE Ward', () => {
    const g = newGame(42, 0); keepBoth(g)
    const heretics = summonCard(g, 0, 'Heretics of Seth', 3, 3); heretics.enteredTurn = 0
    const enemyUnit = summonCard(g, 1, 'Escyllion Cyclops', 3, 2); enemyUnit.ward = true; enemyUnit.enteredTurn = 0
    const enemySite = placeSite(g, 1, 'Great Wall', 2, 3); enemySite.ward = true
    getScript('Heretics of Seth')!.genesis!(makeCtx(g, heretics.id, 0, []))
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(new Set(p!.data.candidates)).toEqual(new Set([enemyUnit.id, enemySite.id]))
    answer(g, [enemySite.id])
    expect(g.sites[enemySite.id]?.ward ?? false).toBe(false) // the site's Ward is stolen
    expect(g.units[heretics.id]?.ward).toBe(true)            // the thief now holds it
    expect(g.units[enemyUnit.id]?.ward).toBe(true)           // the other Ward is untouched
  })

  it('a lone nearby Ward is taken directly (single candidate → no prompt)', () => {
    const g = newGame(42, 0); keepBoth(g)
    const heretics = summonCard(g, 0, 'Heretics of Seth', 3, 3); heretics.enteredTurn = 0
    const enemySite = placeSite(g, 1, 'Great Wall', 2, 3); enemySite.ward = true
    getScript('Heretics of Seth')!.genesis!(makeCtx(g, heretics.id, 0, []))
    expect(g.prompts.length).toBe(0)
    expect(g.sites[enemySite.id]?.ward ?? false).toBe(false)
    expect(g.units[heretics.id]?.ward).toBe(true)
  })
})

describe('Seraphim: a warded SITE is a valid Ward source and a site a valid recipient', () => {
  it('lifts a nearby site Ward and bestows it on another nearby site', () => {
    const g = newGame(42, 0); keepBoth(g)
    const seraphim = summonCard(g, 0, 'Seraphim', 3, 3); seraphim.enteredTurn = 0
    const srcSite = placeSite(g, 0, 'Great Wall', 3, 2); srcSite.ward = true
    const dstSite = placeSite(g, 0, 'Great Wall', 2, 3)
    getScript('Seraphim')!.endOfTurn!(makeCtx(g, seraphim.id, 0, []))
    const p1 = g.prompts[0]
    expect(p1?.kind).toBe('chooseTargets')
    expect(p1!.data.candidates).toContain(srcSite.id)
    answer(g, [srcSite.id])
    const p2 = g.prompts[0]
    expect(p2!.data.candidates).toContain(dstSite.id)
    answer(g, [dstSite.id])
    expect(g.sites[srcSite.id]?.ward ?? false).toBe(false)
    expect(g.sites[dstSite.id]?.ward).toBe(true)
  })
})

describe('Holy Nova: an allied SITE Ward can be broken to re-center', () => {
  it('offers a warded allied site as a break target', () => {
    const g = newGame(42, 0); keepBoth(g); waiveThreshold(g, 0)
    const mySite = placeSite(g, 0, 'Great Wall', 0, 0); mySite.ward = true
    castMagic(g, 0, 'Holy Nova', {})
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(p!.data.candidates).toContain(mySite.id)
    answer(g, [mySite.id])
    expect(g.sites[mySite.id]?.ward ?? false).toBe(false)
  })
})
