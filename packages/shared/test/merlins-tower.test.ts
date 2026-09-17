// Merlin's Tower: "(A)(A)(A) Genesis → this turn gains Spellcaster and its next magic costs 3 less."
// The gate reads true AFFINITY (bonuses included); the tower becomes a legal caster; and the discount
// is tied to the tower ("ITS next magic"), not any magic the avatar casts. Also: sites can be printed
// Spellcasters (River of Flame — a Fire Spellcaster), which is what makes casting through them matter
// (a projectile magic fires from the site, not the avatar).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { affinity, applyJudge, type GameState, type PlayerId } from '../src'
import { canCast, effectiveCost, resolveCaster } from '../src/engine/casting'
import { makeCtx } from '../src/engine/effects'
import { getScript } from '../src/cards/scripts/registry'

const fireGenesis = (g: GameState, seat: PlayerId) => {
  const t = Object.values(g.sites).find((s) => s.name === "Merlin's Tower")!
  getScript("Merlin's Tower")!.genesis!(makeCtx(g, t.id, seat, []) as any)
}
const addMagic = (g: GameState, seat: PlayerId, name: string): string => {
  const id = `m_${name.replace(/\W/g, '')}`
  ;(g.cards as any)[id] = { id, name, owner: seat }
  g.players[seat].hand.push(id)
  return id
}

describe("Merlin's Tower — affinity gate", () => {
  it('fires on 3 Air AFFINITY even when the third Air is a bonus (Elementalist)', () => {
    const g = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]!; av.name = 'Elementalist'; g.cards[av.cardId].name = 'Elementalist'
    applyJudge(g, 0, { k: 'placeSite', name: 'Updraft Ridge', player: 0, x: 0, y: 0 })
    applyJudge(g, 0, { k: 'placeSite', name: "Merlin's Tower", player: 0, x: 4, y: 0 })
    expect(affinity(g as GameState, 0).air).toBe(3) // 1 site + tower + Elementalist bonus
    fireGenesis(g as GameState, 0)
    expect((g.flow?.spellDiscounts ?? []).some((d: any) => d.amount === 3)).toBe(true)
  })
  it('does NOT fire below 3 Air affinity', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'placeSite', name: 'Updraft Ridge', player: 0, x: 0, y: 0 })
    applyJudge(g, 0, { k: 'placeSite', name: "Merlin's Tower", player: 0, x: 4, y: 0 })
    fireGenesis(g as GameState, 0)
    expect(g.flow?.spellDiscounts ?? []).toHaveLength(0)
  })
})

describe("Merlin's Tower — site Spellcaster + tied discount", () => {
  it('the tower is a legal caster, and its 3-off discount applies THROUGH it, not via the avatar', () => {
    const g = newGame(); keepBoth(g)
    g.flow = g.flow ?? {}; (g.flow as any).judgeThresh = { 0: { air: 5, earth: 5, fire: 5, water: 5 } }
    g.players[0].mana = 20
    applyJudge(g, 0, { k: 'placeSite', name: "Merlin's Tower", player: 0, x: 2, y: 0 })
    fireGenesis(g as GameState, 0)
    const boltId = addMagic(g as GameState, 0, 'Lightning Bolt')
    const tower = Object.values(g.sites).find((s) => s.name === "Merlin's Tower")!
    const towerCaster = resolveCaster(g as GameState, tower.id, 0)!
    const avatar = g.units[g.players[0].avatarUnitId]!
    expect(towerCaster, 'the tower resolves to a caster').toBeTruthy()
    expect(canCast(g as GameState, 0, boltId, tower.id).ok, 'tower is a legal caster').toBe(true)
    const base = effectiveCost(g as GameState, 0, 'Lightning Bolt', avatar, undefined, boltId)
    const viaTower = effectiveCost(g as GameState, 0, 'Lightning Bolt', towerCaster, undefined, boltId)
    expect(base, 'the avatar pays full price (discount is tied to the tower)').toBeGreaterThan(0)
    expect(viaTower, 'the tower gets 3 off (cost floors at 0)').toBe(Math.max(0, base - 3))
    expect(viaTower, 'and that is cheaper than the avatar').toBeLessThan(base)
  })
})

describe('River of Flame — printed Fire Spellcaster site', () => {
  it('resolves as a caster and can cast only Fire spells', () => {
    const g = newGame(); keepBoth(g)
    g.flow = g.flow ?? {}; (g.flow as any).judgeThresh = { 0: { air: 5, earth: 5, fire: 5, water: 5 } }
    g.players[0].mana = 20
    applyJudge(g, 0, { k: 'placeSite', name: 'River of Flame', player: 0, x: 1, y: 0 })
    const river = Object.values(g.sites).find((s) => s.name === 'River of Flame')!
    expect(resolveCaster(g as GameState, river.id, 0), 'River of Flame is a Spellcaster site').toBeTruthy()
    const airId = addMagic(g as GameState, 0, 'Lightning Bolt') // Air
    const fireId = addMagic(g as GameState, 0, 'Fireball') // Fire
    const airRes = canCast(g as GameState, 0, airId, river.id)
    expect(airRes.ok, 'cannot cast a non-Fire spell').toBe(false)
    expect(airRes.reason ?? '').toMatch(/fire/i)
    expect(canCast(g as GameState, 0, fireId, river.id).ok, 'can cast a Fire spell').toBe(true)
  })
})
