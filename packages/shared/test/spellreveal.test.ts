// The cast reveal (flow.areaReveal, synced to both seats) carries the caster + spell name plus
// EITHER a numbered damage grid (area spells) OR the red-glowing affected sites (single-target
// spells). The client draws a golden caster, red sites / numbered grid, and the name, then fades.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, castMagic, placeSite, giveMana, waiveThreshold, answer } from './helpers'
import { avatarOf } from '../src'

describe('spell-cast reveal', () => {
  it('a single-target square spell (Lightning Bolt) → caster + name + one red site, no grid', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    placeSite(g, 0, 'Rustic Village', 3, 2)
    castMagic(g, 0, 'Lightning Bolt', { targets: ['sq:3,2'] })
    const rev = g.flow.areaReveal
    expect(rev.name, 'spell name captured').toBe('Lightning Bolt')
    expect(rev.casterId, 'the caster (avatar) captured').toBe(av.id)
    expect(rev.redSites, 'the targeted square glows red').toEqual([{ x: 3, y: 2 }])
    expect(rev.cells.length, 'no numbered grid for a single-target spell').toBe(0)
    expect(rev.seq).toBeGreaterThan(0)
  })

  it('Rain of Arrows (no explicit target) glows every site where a unit was damaged', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', 1, 1)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    const mk = (id: string, x: number, y: number) => {
      g.cards[id] = { id, name: 'Foot Soldier', owner: 1 }
      g.units[id] = { id, cardId: id, name: 'Foot Soldier', owner: 1, controller: 1, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: -1, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} }
    }
    mk('e1', 1, 1); mk('e2', 3, 2)
    castMagic(g, 0, 'Rain of Arrows')
    const rev = g.flow.areaReveal
    expect(rev.name).toBe('Rain of Arrows')
    expect(rev.casterId).toBe(av.id)
    expect(rev.redSites, 'both damaged sites glow').toContainEqual({ x: 1, y: 1 })
    expect(rev.redSites).toContainEqual({ x: 3, y: 2 })
  })

  it('Witching Hour (buffs, no damage/target) glows the sites of the units it affects', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    // an allied Spellcaster is buffed by Witching Hour (airborne + power); a plain minion is NOT
    const mk = (id: string, x: number, y: number, mods: any[]) => {
      g.cards[id] = { id, name: 'Foot Soldier', owner: 0 }
      g.units[id] = { id, cardId: id, name: 'Foot Soldier', owner: 0, controller: 0, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: -1, modifiers: mods, carrying: [], carryingUnits: [], usedThisTurn: {} }
    }
    mk('w1', 2, 2, [{ kind: 'keyword', keyword: 'spellcaster' }]) // Spellcaster → buffed
    mk('w2', 0, 0, [])                                            // plain → untouched
    castMagic(g, 0, 'Witching Hour')
    const rev = g.flow.areaReveal
    expect(rev.name).toBe('Witching Hour')
    expect(rev.redSites, 'the buffed Spellcaster’s site glows').toContainEqual({ x: 2, y: 2 })
    expect(rev.redSites, 'the untouched minion’s site does NOT glow').not.toContainEqual({ x: 0, y: 0 })
  })

  it('an area spell (Lava Flow) → caster + name + a numbered grid, no red sites', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    for (const x of [0, 1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 0)
    castMagic(g, 0, 'Lava Flow')
    answer(g, 'e')
    const rev = g.flow.areaReveal
    expect(rev.name).toBe('Lava Flow')
    expect(rev.casterId).toBe(av.id)
    expect(rev.cells.length, 'the numbered grid is populated').toBeGreaterThanOrEqual(2)
    expect(rev.redSites.length, 'a directional area spell has no red-site targets').toBe(0)
  })

  it('a SUMMON spell (Border Militia) glows the sites where minions appear', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 2) // mine, borders the enemy site → gets a Foot Soldier
    placeSite(g, 1, 'Rustic Village', 2, 3) // enemy site it borders
    castMagic(g, 0, 'Border Militia')
    const rev = g.flow.areaReveal
    expect(rev.name).toBe('Border Militia')
    expect(rev.spell, 'flagged as a spell cast').toBe(true)
    expect(rev.redSites, 'the summon site glows').toContainEqual({ x: 2, y: 2 })
  })

  it('a magic that affects NOTHING still fires (golden caster + name)', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    castMagic(g, 0, 'Rain of Arrows') // no minions on the board → hits nothing
    const rev = g.flow.areaReveal
    expect(rev.name).toBe('Rain of Arrows')
    expect(rev.casterId).toBe(av.id)
    expect(rev.spell).toBe(true)
    expect(rev.seq, 'sealed so the caster animation fires anyway').toBeGreaterThan(0)
    expect(rev.cells.length + rev.redSites.length, 'nothing was affected').toBe(0)
  })
})
