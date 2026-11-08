// Review 3 (THEIRS_12H #61-#72, plus the Bodach Bogeyman targeting ruling): regression guards.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, act, actFail, settlePrompts, castMagic, waiveThreshold } from './helpers'
import { summonToken, reconcileSummonTax, checkStateBased, makeCtx, getScript, runDamageEvent } from '../src'
import { effKeywords, hasRegionKeyword } from '../src/engine/statics'
import { enterSite } from '../src/engine/casting'
import '../src/cards/scripts/index'

describe("Bodach Bogeyman's pick-up is targeting (owner ruling)", () => {
  const board = () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const bodach = summonCard(g, 0, 'Bodach Bogeyman', 2, 1); bodach.enteredTurn = -5
    return { g, bodach }
  }
  it("a Stealthed enemy can't be picked up", () => {
    const { g, bodach } = board()
    const sneak = summonCard(g, 1, 'Bone Jumble', 2, 2); sneak.stealth = true
    const plain = summonCard(g, 1, 'Bone Jumble', 2, 2)
    act(g, 0, { t: 'activate', sourceId: bodach.id, ability: 'snatch' })
    expect(g.prompts[0].data.candidates).toEqual([plain.id])
  })
  it("a warded enemy's Ward breaks instead", () => {
    const { g, bodach } = board()
    const warded = summonCard(g, 1, 'Cave Trolls', 2, 2); warded.ward = true // not Evil: an Evil minion can't hold a Ward
    act(g, 0, { t: 'activate', sourceId: bodach.id, ability: 'snatch' })
    act(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: [warded.id] })
    expect(g.units[warded.id].ward).toBeFalsy()
    expect(g.units[warded.id].carriedBy ?? null, 'not picked up').toBeNull()
  })
})

describe("12H #61: Mock Court's (1) is owed at the summon", () => {
  it('a Skeleton summoned into a Bottomless Pit still costs (1)', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Mock Court', 2, 0); placeSite(g, 0, 'Bottomless Pit', 2, 2)
    g.players[0].mana = 2
    summonToken(g, 'Skeleton', 0, 2, 2)
    checkStateBased(g)
    expect(Object.values(g.units).some((u: any) => u.name === 'Skeleton'), 'the Pit killed it').toBe(false)
    reconcileSummonTax(g)
    expect(g.players[0].mana).toBe(1)
  })
  it("an end-of-turn Foot Soldier (Invasion) pays from this turn's mana and stays", () => {
    const g: any = newGame(42, 0); keepBoth(g)
    placeSite(g, 1, 'Mock Court', 0, 3); placeSite(g, 1, 'Steppe', 2, 2)
    const cardId = `ci${g.nextId++}`; g.cards[cardId] = { id: cardId, name: 'Invasion', owner: 0 }
    g.auras.inv = { id: 'inv', cardId, name: 'Invasion', controller: 0, owner: 0, anchor: { x: 2, y: 2 }, squares: [{ x: 2, y: 2 }], counters: { turns: 3 } }
    g.players[0].mana = 2
    act(g, 0, { t: 'endTurn' }); settlePrompts(g)
    const soldier = (Object.values(g.units) as any[]).find((u) => u.name === 'Foot Soldier')
    expect(soldier, 'the Foot Soldier arrived').toBeTruthy()
    expect(g.log.some((l: any) => /Pays 1 to the Court/.test(l.msg))).toBe(true)
  })
})

describe("12H #62/#63: Monks of Kobalsa can't gain a carried artifact's abilities", () => {
  it('All-terrain Vestments give the Monks no Burrowing / Submerge / Voidwalk', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1)
    const monks = summonCard(g, 0, 'Monks of Kobalsa', 2, 1)
    const wolves = summonCard(g, 0, 'Grey Wolves', 2, 1)
    giveArtifact(g, monks, 'All-terrain Vestments'); giveArtifact(g, wolves, 'All-terrain Vestments')
    const kw = effKeywords(g, monks)
    expect(kw.burrowing || kw.submerge || kw.voidwalk).toBeFalsy()
    expect(hasRegionKeyword(g, monks, 'voidwalk')).toBe(false)
    expect(effKeywords(g, wolves).voidwalk, 'control').toBeTruthy()
  })
  it("Flaming Sword doesn't splash for the Monks", () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const monks = summonCard(g, 0, 'Monks of Kobalsa', 2, 1); monks.enteredTurn = -5
    giveArtifact(g, monks, 'Flaming Sword')
    const a = summonCard(g, 1, 'Grey Wolves', 2, 2); const b = summonCard(g, 1, 'Grey Wolves', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: monks.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: a.id } })
    settlePrompts(g)
    expect(g.units[a.id]).toBeUndefined()
    expect(g.units[b.id], 'no splash').toBeTruthy()
  })
})

describe("12H #64: Mover of Mountains' swap tells Vindictive Nation", () => {
  it('swapping two allied sites near the Nation costs 3 each', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Fertile Earth', 2, 1)
    placeSite(g, 1, 'Vindictive Nation', 3, 2)
    const a = placeSite(g, 1, 'Steppe', 2, 2); const b = placeSite(g, 1, 'Fertile Earth', 3, 1)
    const mover = summonCard(g, 0, 'Mover of Mountains', 2, 1); mover.enteredTurn = -5
    const av = g.units[g.players[0].avatarUnitId]; av.x = 0; av.y = 0
    const life = av.life
    act(g, 0, { t: 'activate', sourceId: mover.id, ability: 'heave', targets: [a.id, b.id] })
    settlePrompts(g)
    expect([a.x, a.y, b.x, b.y]).toEqual([3, 1, 2, 2])
    expect(life - av.life).toBe(6)
  })
})

describe("12H #65: surfacing on a site you were already under isn't entering it", () => {
  it("Old Mortimer's Den lets a Root Spider surface and fight", () => {
    const g: any = newGame(); keepBoth(g)
    const den = placeSite(g, 1, "Old Mortimer's Den", 2, 2)
    const spider = summonCard(g, 0, 'Root Spider', 2, 2, 'underground'); spider.enteredTurn = -5
    const wolves = summonCard(g, 1, 'Grey Wolves', 2, 2); wolves.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: spider.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: wolves.id } })
    settlePrompts(g)
    expect(g.units[spider.id], 'the Den did not kill it').toBeTruthy()
    expect(g.sites[den.id], 'the Den stays').toBeTruthy()
  })
  it('Briar Patch deals nothing to a minion surfacing from beneath it', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 1, 'Briar Patch', 2, 2)
    const spider = summonCard(g, 0, 'Root Spider', 2, 2, 'underground'); spider.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: spider.id, path: [{ x: 2, y: 2, region: 'surface' }] })
    settlePrompts(g)
    expect(g.units[spider.id].damage).toBe(0)
  })
})

describe('12H #66: one Gilded Aegis saves a Phantasmal Shade from only one of two deaths', () => {
  it('lethal strike healed by the Aegis, then "destroy it when struck" kills it', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const shade = summonCard(g, 0, 'Phantasmal Shade', 2, 1); shade.enteredTurn = -5
    const aegis = giveArtifact(g, shade, 'Gilded Aegis')
    const uni = summonCard(g, 1, 'Autumn Unicorn', 2, 2); uni.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: shade.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: uni.id } })
    settlePrompts(g)
    expect(g.units[uni.id]).toBeUndefined()
    expect(g.artifacts[aegis.id], 'the Aegis was spent').toBeUndefined()
    expect(g.units[shade.id], 'the second death kills it').toBeUndefined()
  })
})

describe('12H #67: Panpipes of Pnom raises damage a nearby unit deals with an ability', () => {
  it("Desecrator Kite's end-of-turn 1 damage to its site becomes 2", () => {
    const run = (pipes: boolean) => {
      const g: any = newGame(42, 0); keepBoth(g)
      placeSite(g, 0, 'Valley', 3, 0)
      const kite = summonCard(g, 0, 'Desecrator Kite', 3, 0); kite.enteredTurn = -5
      if (pipes) giveArtifact(g, kite, 'Panpipes of Pnom')
      const av = g.units[g.players[0].avatarUnitId]; const life = av.life
      act(g, 0, { t: 'endTurn' }); settlePrompts(g)
      return life - av.life
    }
    expect(run(false)).toBe(1)
    expect(run(true)).toBe(2)
  })
})

describe('12H #68: Postern Gate enters under the opponent even next to Smokestacks of Gnaak', () => {
  it('the Gate is the enemy\'s', () => {
    const g: any = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Smokestacks of Gnaak', 1, 0)
    const gateCard = `pg${g.nextId++}`; g.cards[gateCard] = { id: gateCard, name: 'Postern Gate', owner: 0 }
    enterSite(g, 0, gateCard, 1, 1)
    const gate = (Object.values(g.sites) as any[]).find((s) => s.name === 'Postern Gate')
    expect(gate.controller).toBe(1)
  })
})

describe("12H #69: protection from damage by 'units' covers a unit's ability damage too", () => {
  it("The Faerie Queene shields her Faeries from the Hellstar's start-of-turn blast", () => {
    const g: any = newGame(42, 1); keepBoth(g)
    for (let x = 1; x <= 3; x++) placeSite(g, 0, 'Spire', x, 1)
    const queen = summonCard(g, 0, 'The Faerie Queene', 3, 1)
    const sprites = summonCard(g, 0, 'Hyter Sprites', 3, 1)
    const hell = summonCard(g, 1, 'Hellstar', 2, 1)
    runDamageEvent(g, () => getScript('Hellstar')!.startOfTurn!(makeCtx(g, hell.id, 1, [])))
    expect(g.units[queen.id]?.damage ?? -1).toBe(0)
    expect(g.units[sprites.id]?.damage ?? -1).toBe(0)
  })
  it('Fourberie Knot / Sling Pixies / Sir Galahad stop ability damage from a qualifying unit', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1)
    const nomads = summonCard(g, 0, 'Rimland Nomads', 2, 1); giveArtifact(g, nomads, 'Fourberie Knot')
    const pixies = summonCard(g, 0, 'Sling Pixies', 2, 1)
    const galahad = summonCard(g, 0, 'Sir Galahad', 2, 1)
    const big = summonCard(g, 1, 'Megalurker', 4, 3) // 6 power
    const undead = summonCard(g, 1, 'Bone Jumble', 4, 3) // Undead
    makeCtx(g, big.id, 1, []).dealDamage({ unit: nomads.id }, 2)
    makeCtx(g, big.id, 1, []).dealDamage({ unit: pixies.id }, 2)
    makeCtx(g, undead.id, 1, []).dealDamage({ unit: galahad.id }, 2)
    expect([nomads.damage, pixies.damage, galahad.damage]).toEqual([0, 0, 0])
  })
})
describe("12H #69 (strike back): Sir Galahad takes nothing from a Spirit's strike back", () => {
  it('Galahad attacks a Phantasmal Shade', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const galahad = summonCard(g, 0, 'Sir Galahad', 2, 1); galahad.enteredTurn = -5
    const shade = summonCard(g, 1, 'Phantasmal Shade', 2, 2); shade.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: galahad.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: shade.id } })
    settlePrompts(g)
    expect(g.units[galahad.id]?.damage).toBe(0)
  })
})

describe('12H #70: Pudge Butcher may fight an allied unit it hooks', () => {
  it('hooks its own Avatar and is asked whether to fight it', () => {
    const g: any = newGame(); keepBoth(g)
    for (let y = 0; y <= 2; y++) placeSite(g, 0, 'Spire', 2, y)
    const av = g.units[g.players[0].avatarUnitId]; av.x = 2; av.y = 0
    const pudge = summonCard(g, 0, 'Pudge Butcher', 2, 2); pudge.enteredTurn = -5
    const life = av.life
    act(g, 0, { t: 'activate', sourceId: pudge.id, ability: 'hook' })
    act(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: 's' })
    settlePrompts(g, 10)
    expect([av.x, av.y]).toEqual([2, 2])
    expect(av.life, 'Pudge fought it').toBeLessThan(life)
  })
})

describe("12H #71: Realm-Eater's strike on a City of Souls lands before the site is destroyed", () => {
  it('declining the redirect: the opponent still loses 1', () => {
    const g: any = newGame(); keepBoth(g)
    const city = placeSite(g, 1, 'City of Souls', 2, 2)
    placeSite(g, 1, 'Valley', 3, 3) // earth for the City's threshold
    const av = g.units[g.players[0].avatarUnitId]; av.name = 'Realm-Eater'; g.cards[av.cardId].name = 'Realm-Eater'
    av.x = 2; av.y = 2; av.tapped = false
    const opp = g.units[g.players[1].avatarUnitId]; const life = opp.life
    act(g, 0, { t: 'moveAttack', unitId: av.id, path: [], attack: { site: city.id } })
    const kinds: string[] = []
    for (let i = 0; i < 10 && g.prompts.length; i++) {
      const q = g.prompts[0]; kinds.push(q.kind)
      act(g, q.player, { t: 'prompt', promptId: q.id, choice: q.kind === 'yesNo' ? false : [] })
    }
    expect(kinds, 'the redirect was offered').toContain('yesNo')
    expect(opp.life).toBe(life - 1)
    expect(g.sites[city.id]?.isRubble ?? true, 'and the City was devoured').toBe(true)
  })
})

describe('12H #72: Red Rock of Ravannis pulls along the other closer square when one is a void', () => {
  it('the Townsfolk and its Sword and Shield go to the site one step closer', () => {
    const g: any = newGame(42, 0); keepBoth(g)
    placeSite(g, 1, 'Steppe', 3, 2); placeSite(g, 1, 'Steppe', 2, 1); placeSite(g, 1, 'Steppe', 2, 2) // (3,1) is a void
    const cardId = `rr${g.nextId++}`; g.cards[cardId] = { id: cardId, name: 'Red Rock of Ravannis', owner: 1 }
    g.artifacts.rr = { id: 'rr', cardId, name: 'Red Rock of Ravannis', conjuredBy: 1, x: 3, y: 2, region: 'surface', carriedBy: null, tapped: false }
    const folk = summonCard(g, 1, 'Serava Townsfolk', 2, 1)
    const sword = giveArtifact(g, folk, 'Sword and Shield')
    act(g, 0, { t: 'endTurn' }); settlePrompts(g)
    expect([folk.x, folk.y]).toEqual([2, 2])
    expect(g.artifacts[sword.id].carriedBy).toBe(folk.id)
  })
})
