import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, giveMana, waiveThreshold, act } from './helpers'
import { avatarOf, makeCtx, effectSummonUnit, getScript, isWaterSite } from '../src'
import { getCard } from '../src/cards/db'

// ---- Gnome Hollows: entry restriction applies to TELEPORT (Blink/Teleport), not just moves ----
describe('Gnome Hollows blocks forced entry too', () => {
  it("a 3-power minion can't be teleported into Gnome Hollows; a 2-power one can", () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Gnome Hollows', 2, 2)
    placeSite(g, 0, 'Rustic Village', 1, 2)
    const heavy = summonCard(g, 1, 'Cave Trolls', 1, 2) // 3/3 → too strong to enter
    const light = summonCard(g, 1, 'Foot Soldier', 1, 2) // 1/1 → fine
    const ctx = makeCtx(g, heavy.id, 0, [])
    ctx.teleport(heavy.id, 2, 2, 'surface')
    expect([g.units[heavy.id].x, g.units[heavy.id].y], 'heavy stays out').toEqual([1, 2])
    ctx.teleport(light.id, 2, 2, 'surface')
    expect([g.units[light.id].x, g.units[light.id].y], 'light gets in').toEqual([2, 2])
  })
})

// ---- Siege Giant: may hurl a weaker ALLIED UNIT, including the avatar (not only minions) ----
describe('Siege Giant hurls allied units', () => {
  it('the allied avatar is a legal throw target', () => {
    const g: any = newGame(); keepBoth(g)
    const av = avatarOf(g, 0)
    const giant = summonCard(g, 0, 'Siege Giant', av.x, av.y) // 4/4, co-located with the (weaker) avatar
    giant.enteredTurn = -1; giant.tapped = false
    act(g, 0, { t: 'activate', sourceId: giant.id, ability: 'hurl' })
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(p.data.candidates, 'the avatar is throwable').toContain(av.id)
  })
})

// ---- Browse: peeked cards ride the prompt ctx, never leaked into synced flow ----
describe('Browse does not leak to the opponent', () => {
  it('flow.browse is never set; the pool rides the hidden prompt ctx', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    for (let i = 0; i < 10; i++) g.players[0].spellbook.push(`bk${i}`), (g.cards[`bk${i}`] = { id: `bk${i}`, name: 'Lightning Bolt', owner: 0 })
    castMagic(g, 0, 'Browse')
    expect(g.flow?.browse, 'no leak via synced flow').toBeUndefined()
    expect((g.prompts[0]?.ctx as any)?.pool?.length, 'the peeked pool is in the hidden ctx').toBe(7)
  })
})

// ---- Pathfinder: blaze adjacency wraps under Magellan Globe ----
describe('Pathfinder blaze is Magellan-aware', () => {
  it('at the west edge, Magellan Globe lets it blaze to the east edge', () => {
    const g: any = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.name = 'Pathfinder'; g.cards[av.cardId].name = 'Pathfinder'
    av.x = 0; av.y = 1; av.tapped = false; av.enteredTurn = -1
    g.cards['gl'] = { id: 'gl', name: 'Magellan Globe', owner: 0 }
    g.artifacts['gl'] = { id: 'gl', cardId: 'gl', name: 'Magellan Globe', conjuredBy: 0, x: 0, y: 0, region: 'surface', tapped: false }
    g.cards['at'] = { id: 'at', name: 'Rustic Village', owner: 0 }; g.players[0].atlas.unshift('at')
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'blaze' })
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    expect(p.data.squares, 'wraps to the opposite (east) edge').toContainEqual({ x: 4, y: 1 })
  })
})

// ---- The Great Drowning of Men: floods rubble → Submerge minions survive, others drown ----
describe('The Great Drowning of Men spares Submerge minions', () => {
  it('a Submerge minion ends up underwater alive; a landlubber drowns', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const nixie = summonCard(g, 0, 'Coy Nixie', 2, 2) // Submerge
    const soldier = summonCard(g, 0, 'Foot Soldier', 2, 2) // no Submerge → drowns
    const auraId = 'dr'
    g.cards[auraId] = { id: auraId, name: 'The Great Drowning of Men', owner: 0 }
    g.auras[auraId] = { id: auraId, cardId: auraId, name: 'The Great Drowning of Men', conjuredBy: 0, controller: 0, squares: [{ x: 2, y: 2 }] }
    getScript('The Great Drowning of Men')!.startOfTurn!(makeCtx(g, auraId, 0, []))
    expect(g.units[nixie.id], 'the Submerge Nixie survives').toBeTruthy()
    expect(g.units[nixie.id]?.region, 'and is now underwater').toBe('underwater')
    expect(g.units[soldier.id], 'the Foot Soldier drowned').toBeFalsy()
    // sanity: the flooded rubble is now a water site
    const rubble = Object.values(g.sites).find((s: any) => s.x === 2 && s.y === 2) as any
    expect(isWaterSite(g, rubble, getCard), 'flooded rubble reads as water').toBe(true)
  })
})

// ---- Silent Hills: a minion entering a silenced nearby site fires NO Genesis ----
describe('Silent Hills blocks the Genesis of minions entering nearby', () => {
  const mkLookout = (g: any, x: number, y: number) => {
    const id = `lk${x}${y}`
    g.cards[id] = { id, name: 'Lookout', owner: 0 }
    return effectSummonUnit(g, { id, cardId: id, name: 'Lookout', owner: 0, controller: 0, isAvatar: false,
      x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} })
  }
  it("a Lookout summoned nearby is silenced and its hand-peek Genesis does not fire", () => {
    const g: any = newGame(); keepBoth(g)
    const hills = placeSite(g, 0, 'Silent Hills', 2, 2)
    g.flow = g.flow ?? {}; g.flow.silentHills = [{ siteId: hills.id, player: 0, turn: g.turn }]
    placeSite(g, 0, 'Rustic Village', 2, 3) // nearby, in the hush
    placeSite(g, 0, 'Rustic Village', 0, 0) // far away, control

    const near = mkLookout(g, 2, 3)
    expect(near?.silenced, 'the nearby Lookout is hushed').toBeTruthy()
    expect(g.handReveals && Object.keys(g.handReveals).length ? true : false, 'its Genesis peek was blocked').toBe(false)

    // control: the same minion far from the hills DOES fire its Genesis (reveals the hand)
    mkLookout(g, 0, 0)
    expect(Object.keys(g.handReveals ?? {}).length, 'the far Lookout peeked the hand').toBeGreaterThan(0)
  })
})
