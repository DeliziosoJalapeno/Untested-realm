// "Target site" and "target location" share the caster's region (rule fix, reported by waffles): a surface
// caster reaches every site and every SITED location (not the void, not a subsurface); a void caster only the
// void; a subsurface caster only sites/locations of its own kind (underground → land, underwater → water).
// Distance and every other restriction are unchanged. The legal sets offered to the client follow suit.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, injectToHand, waiveThreshold } from './helpers'
import { avatarOf, getScript, legalTargetsFor, targetRefId, applyAction, type GameState, type UnitState } from '../src'

function board() {
  const g = newGame(); keepBoth(g)
  const land = placeSite(g, 0, 'Rustic Village', 1, 1)
  const water = placeSite(g, 0, 'Stream', 3, 1)
  // (2,1) and every other square stay siteless — the void
  return { g, land, water }
}
const legal = (g: GameState, card: string, caster: UnitState) => {
  const script = getScript(card)
  return legalTargetsFor(g, { script, specs: script!.targets!, caster, player: 0, magic: true, source: card }, []).map(targetRefId)
}
const casterIn = (g: GameState, region: UnitState['region'], x: number, y: number) =>
  ({ ...avatarOf(g, 0), x, y, region }) as UnitState

describe('target site is region-locked to the caster', () => {
  it('a surface caster can target every site', () => {
    const { g, land, water } = board()
    expect(legal(g, 'Craterize', casterIn(g, 'surface', 1, 1))).toEqual(expect.arrayContaining([land.id, water.id]))
  })
  it('an underground caster only land sites, an underwater one only water sites', () => {
    const { g, land, water } = board()
    const under = legal(g, 'Craterize', casterIn(g, 'underground', 1, 1))
    expect(under).toContain(land.id); expect(under).not.toContain(water.id)
    const sub = legal(g, 'Craterize', casterIn(g, 'underwater', 3, 1))
    expect(sub).toContain(water.id); expect(sub).not.toContain(land.id)
  })
  it('a void caster can target no site', () => {
    const { g } = board()
    expect(legal(g, 'Craterize', casterIn(g, 'void', 2, 1))).toEqual([])
  })
})

describe('target location is region-locked to the caster', () => {
  it("a surface caster can't throw Lightning Bolt into the void", () => {
    const { g } = board()
    const sq = legal(g, 'Lightning Bolt', casterIn(g, 'surface', 1, 1))
    expect(sq).toEqual(expect.arrayContaining(['sq:1,1', 'sq:3,1']))
    expect(sq, 'no siteless square is offered').not.toContain('sq:2,1')
    expect(sq.length).toBe(2)
  })
  it('a void caster hits only the void; a subsurface caster only under its own kind of site', () => {
    const { g } = board()
    const v = legal(g, 'Lightning Bolt', casterIn(g, 'void', 2, 1))
    expect(v).toContain('sq:2,1'); expect(v).not.toContain('sq:1,1'); expect(v).not.toContain('sq:3,1')
    const ug = legal(g, 'Lightning Bolt', casterIn(g, 'underground', 1, 1))
    expect(ug).toEqual(['sq:1,1'])
    const uw = legal(g, 'Lightning Bolt', casterIn(g, 'underwater', 3, 1))
    expect(uw).toEqual(['sq:3,1'])
  })
  it('the engine rejects a cast into the void (not just the highlights)', () => {
    const { g } = board()
    const av = avatarOf(g, 0); av.x = 1; av.y = 1; av.region = 'surface'
    waiveThreshold(g, 0)
    const cardId = injectToHand(g, 0, 'Lightning Bolt'); g.players[0].mana += 20
    const res = applyAction(g, 0, { t: 'castSpell', cardId, casterId: av.id, targets: ['sq:2,1'] } as any)
    expect(res.ok).toBe(false)
    expect(String(res.error)).toMatch(/same region/)
    castMagic(g, 0, 'Lightning Bolt', { targets: ['sq:3,1'] }) // a sited location is still fine
  })
})
