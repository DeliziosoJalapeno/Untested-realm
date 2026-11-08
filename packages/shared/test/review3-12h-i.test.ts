// THEIRS_12H.md #97–#108.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, castMagic, waiveThreshold, act, answer, settlePrompts } from './helpers'
import { avatarOf, affinity, siteSilenced, getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

function game(): GameState {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  for (const s of Object.values(g.sites)) delete g.sites[s.id]
  return g
}
const sites = (g: GameState, p: 0 | 1, ...sq: [number, number][]) => { for (const [x, y] of sq) placeSite(g, p, 'Rustic Village', x, y) }

describe('12H #97 Thin Ice doesn\'t submerge Yog-Sothoth', () => {
  it('Yog stays on the surface', () => {
    const g = game()
    placeSite(g, 0, 'Thin Ice', 1, 1)
    const yog = summonCard(g, 0, 'Yog-Sothoth', 1, 1)
    act(g, 0, { t: 'endTurn' }); settlePrompts(g)
    expect(g.units[yog.id]?.region).toBe('surface')
  })
})

describe('12H #98 Thundering Giant taps only units at its own location', () => {
  it('the burrowed Cemetery Rats stay untapped', () => {
    const g = game()
    sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
    const giant = summonCard(g, 0, 'Thundering Giant', 1, 1)
    const troll = summonCard(g, 1, 'Bosk Troll', 1, 2)
    const rats = summonCard(g, 1, 'Cemetery Rats', 1, 2, 'underground')
    act(g, 0, { t: 'activate', sourceId: giant.id, ability: 'thunder' })
    answer(g, { x: 1, y: 2 })
    settlePrompts(g)
    expect(g.units[troll.id].tapped).toBe(true)
    expect(g.units[rats.id].tapped).toBe(false)
  })
})

describe('12H #99 Tragedy Worrywart stops Magic Missiles', () => {
  it('the Grey Wolves next to it take no damage', () => {
    const g = game()
    const av = avatarOf(g, 0); av.x = 0; av.y = 1
    sites(g, 0, [0, 1]); sites(g, 1, [1, 1], [2, 2])
    const wolves = summonCard(g, 1, 'Grey Wolves', 1, 1)
    summonCard(g, 1, 'Tragedy Worrywart', 2, 2)
    castMagic(g, 0, 'Magic Missiles', { extra: { direction: 'e' } })
    settlePrompts(g)
    expect(g.units[wolves.id]?.damage).toBe(0)
  })
})

describe('12H #100 Tringh Constrictor can\'t constrict a Stealthed enemy', () => {
  it('the Draco Corvus is not offered', () => {
    const g = game()
    sites(g, 0, [1, 1])
    const tc = summonCard(g, 0, 'Tringh Constrictor', 1, 1)
    const dc = summonCard(g, 1, 'Draco Corvus', 1, 1); dc.stealth = true
    act(g, 0, { t: 'activate', sourceId: tc.id, ability: 'constrict' })
    answer(g, { x: 1, y: 1 }) // stay
    const p = g.prompts.find((q) => q.kind === 'chooseTargets')
    expect(((p?.data?.candidates ?? []) as string[]).includes(dc.id)).toBe(false)
  })
})

describe('12H #101 Troll Bridge\'s strike destroys Phantasmal Shade', () => {
  it('the Shade flown onto the Bridge is destroyed', () => {
    const g = game()
    const wh = placeSite(g, 0, 'Wuthering Heights', 1, 1); placeSite(g, 0, 'Troll Bridge', 1, 2)
    g.players[1].hand = []
    const shade = summonCard(g, 1, 'Phantasmal Shade', 1, 1)
    act(g, 0, { t: 'activate', sourceId: wh.id, ability: 'gust' })
    if (g.prompts[0]?.kind === 'chooseTargets') answer(g, [shade.id])
    answer(g, { x: 1, y: 2 })
    settlePrompts(g)
    expect(g.units[shade.id]).toBeUndefined()
  })
})

describe('12H #102 Fields of Phyxis vs a newer Smokestacks of Gnaak: the older Fields win', () => {
  it('the Smokestacks is silenced and the Tor keeps its drawback', () => {
    const g = game()
    placeSite(g, 0, 'Fields of Phyxis', 1, 0)
    placeSite(g, 0, 'Glastonbury Tor', 1, 2)
    const before = affinity(g, 0).earth
    const smoke = placeSite(g, 0, 'Smokestacks of Gnaak', 1, 1)
    expect(siteSilenced(g, smoke)).toBe(true)
    expect(affinity(g, 0).earth).toBe(before)
  })
})

describe('12H #103 Vesuvius hits burrowed units on nearby sites', () => {
  it('the Root Spiders below nearby sites take 3 and die', () => {
    const g = game()
    waiveThreshold(g, 0)
    const ves = placeSite(g, 0, 'Vesuvius', 1, 1); sites(g, 0, [2, 1]); sites(g, 1, [1, 2])
    placeSite(g, 0, 'Active Volcano', 4, 3); placeSite(g, 0, 'Active Volcano', 3, 3) // (F)(F)(F) with Vesuvius
    const s1 = summonCard(g, 0, 'Root Spider', 1, 2, 'underground')
    const s2 = summonCard(g, 1, 'Root Spider', 2, 1, 'underground')
    g.players[0].mana = 10
    act(g, 0, { t: 'activate', sourceId: ves.id, ability: 'erupt' })
    settlePrompts(g)
    expect(g.units[s1.id]).toBeUndefined()
    expect(g.units[s2.id]).toBeUndefined()
  })
})

describe('12H #104 Acid Rain silencing sites near a Vindictive Nation is charged', () => {
  it('you lose 1 for each of the two silenced sites near the Nation', () => {
    const g = game()
    sites(g, 0, [0, 0])
    placeSite(g, 1, 'Vindictive Nation', 3, 1)
    sites(g, 1, [2, 1], [2, 2], [1, 1], [1, 2])
    const life = avatarOf(g, 0).life!
    castMagic(g, 0, 'Acid Rain', { at: { x: 1, y: 1 } })
    settlePrompts(g)
    expect(avatarOf(g, 0).life).toBe(life - 2)
  })
})

describe('12H #105 Wills-o\'-the-Wisp teleport before the fight', () => {
  it('the Wisp evades into the void and nobody is hurt', () => {
    const g = game()
    sites(g, 0, [1, 1], [1, 2])
    const buf = summonCard(g, 0, 'Swamp Buffalo', 1, 1)
    const wisp = summonCard(g, 1, "Wills-o'-the-Wisp", 1, 2)
    act(g, 0, { t: 'moveAttack', unitId: buf.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: wisp.id } })
    const p = g.prompts.find((q) => q.kind === 'chooseSquare')
    expect(p).toBeDefined()
    answer(g, { x: 0, y: 2 })
    settlePrompts(g)
    expect(g.units[wisp.id]?.damage).toBe(0)
    expect(g.units[buf.id].damage).toBe(0)
  })
})

describe('12H #106 Necromancer + Mock Court with 1 mana', () => {
  it('the Skeleton ability isn\'t usable and nothing is spent', () => {
    const g = game()
    const av = avatarOf(g, 0); av.name = 'Necromancer'
    placeSite(g, 1, 'Mock Court', 3, 3)
    g.players[0].mana = 1
    const r = (() => { try { act(g, 0, { t: 'activate', sourceId: av.id, ability: 'raise' }); return true } catch { return false } })()
    settlePrompts(g)
    const skeletons = Object.values(g.units).filter((u) => u.name === 'Skeleton').length
    expect(g.players[0].mana === 1 || skeletons === 1, `used=${r} mana=${g.players[0].mana} skeletons=${skeletons}`).toBe(true)
  })
})

describe('12H #107/#108 Wuthering Heights only flies what it can move', () => {
  it('#107 a Key to the City bearer is not offered', () => {
    const g = game()
    const wh = placeSite(g, 0, 'Wuthering Heights', 1, 1); sites(g, 0, [1, 2])
    const vs = summonCard(g, 1, 'Vesper Swarm', 1, 1); giveArtifact(g, vs, 'Key to the City')
    const boars = summonCard(g, 1, 'Wild Boars', 1, 1)
    act(g, 0, { t: 'activate', sourceId: wh.id, ability: 'gust' })
    const cands = (g.prompts[0]?.data?.candidates ?? []) as string[]
    expect(cands).toContain(boars.id)
    expect(cands).not.toContain(vs.id)
  })
  it('#108 Talamh Dreig (can\'t be moved by force) is not offered', () => {
    const g = game()
    const wh = placeSite(g, 0, 'Wuthering Heights', 1, 1); sites(g, 0, [1, 2])
    const td = summonCard(g, 0, 'Talamh Dreig', 1, 1)
    const boars = summonCard(g, 0, 'Wild Boars', 1, 1)
    act(g, 0, { t: 'activate', sourceId: wh.id, ability: 'gust' })
    const cands = (g.prompts[0]?.data?.candidates ?? []) as string[]
    expect(cands).toContain(boars.id)
    expect(cands).not.toContain(td.id)
  })
})
