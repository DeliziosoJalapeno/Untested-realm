import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, answer, waiveThreshold } from './helpers'
import { avatarOf, dealDamage, type GameState } from '../src'

// a bare ground artifact (uncarried) on a square
function groundArt(g: GameState, name: string, x: number, y: number, owner: 0 | 1 = 0): string {
  const cardId = `ctest${g.nextId++}`
  g.cards[cardId] = { id: cardId, name, owner }
  const artId = `atest${g.nextId++}`
  g.artifacts[artId] = { id: artId, cardId, name, conjuredBy: owner, x, y, region: 'surface', carriedBy: null, tapped: false }
  return artId
}
function cemeteryMinion(g: GameState, player: 0 | 1, name = 'Foot Soldier'): string {
  const id = `ctest${g.nextId++}`
  g.cards[id] = { id, name, owner: player }
  g.players[player].cemetery.push(id)
  return id
}
function mortalSoilAura(g: GameState, controller: 0 | 1, squares: { x: number; y: number }[]): string {
  const cardId = `ctest${g.nextId++}`
  g.cards[cardId] = { id: cardId, name: 'Mortal Soil', owner: controller }
  const auraId = `rtest${g.nextId++}`
  ;(g.auras as any)[auraId] = { id: auraId, cardId, name: 'Mortal Soil', controller, squares }
  return auraId
}

describe('Blasphemy: per-minion artifact destruction (no arbitrary pick)', () => {
  it('prompts the minion’s controller when its square has MORE artifacts than minions', () => {
    const g = newGame(); keepBoth(g); waiveThreshold(g, 0)
    summonCard(g, 0, 'Foot Soldier', 2, 2)
    const a1 = groundArt(g, 'Excalibur', 2, 2)
    const a2 = groundArt(g, 'Onyx Core', 2, 2)
    castMagic(g, 0, 'Blasphemy')
    // 1 minion, 2 artifacts → a choice: which one this minion destroys
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(p?.data.kind).toBe('artifact')
    expect(new Set(p!.data.candidates)).toEqual(new Set([a1, a2]))
    answer(g, [a1])
    expect(g.artifacts[a1]).toBeUndefined() // chosen one destroyed
    expect(g.artifacts[a2]).toBeTruthy()    // the other survives
  })

  it('skips the prompt when minions >= artifacts (all are destroyed anyway)', () => {
    const g = newGame(); keepBoth(g); waiveThreshold(g, 0)
    summonCard(g, 0, 'Foot Soldier', 2, 2)
    summonCard(g, 1, 'Foot Soldier', 2, 2)
    const a1 = groundArt(g, 'Excalibur', 2, 2)
    const a2 = groundArt(g, 'Onyx Core', 2, 2)
    castMagic(g, 0, 'Blasphemy')
    expect(g.prompts.length).toBe(0) // no choice — 2 minions cover 2 artifacts
    expect(g.artifacts[a1]).toBeUndefined()
    expect(g.artifacts[a2]).toBeUndefined()
  })
})

describe('Mortal Soil: choose WHICH cemetery minion to banish (async, no auto-pick)', () => {
  function setup(minions: number) {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Rustic Village', 1, 1) // player 0's site, affected
    mortalSoilAura(g, 0, [{ x: 1, y: 1 }])
    const ids = Array.from({ length: minions }, () => cemeteryMinion(g, 0))
    return { g, site, ids, lifeBefore: avatarOf(g, 0).life! }
  }

  it('prompts when 2+ minions are in the cemetery; the chosen one is banished and the site spared', () => {
    const { g, site, ids, lifeBefore } = setup(2)
    dealDamage(g, { site: site.id }, 3, 1) // player 1 strikes the affected site
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseCards')
    expect(p?.player).toBe(0)
    answer(g, [1]) // banish the SECOND cemetery minion
    expect(g.players[0].banished).toContain(ids[1])
    expect(g.players[0].cemetery).toContain(ids[0]) // the other stays
    expect(avatarOf(g, 0).life).toBe(lifeBefore) // damage prevented
  })

  it('auto-banishes the sole minion with no prompt (nothing to choose)', () => {
    const { g, site, ids, lifeBefore } = setup(1)
    dealDamage(g, { site: site.id }, 3, 1)
    expect(g.prompts.length).toBe(0)
    expect(g.players[0].banished).toContain(ids[0])
    expect(avatarOf(g, 0).life).toBe(lifeBefore)
  })

  it('with no minion to feed it, the soil dispels and the damage goes through', () => {
    const { g, site, lifeBefore } = setup(0)
    const auraCount = Object.keys(g.auras).length
    dealDamage(g, { site: site.id }, 3, 1)
    expect(g.prompts.length).toBe(0)
    expect(Object.keys(g.auras).length).toBe(auraCount - 1) // Mortal Soil dispelled
    expect(avatarOf(g, 0).life).toBe(lifeBefore - 3)         // damage applied
  })
})
