// Review 3 (THEIRS_12H #1-#12): regression guards for rules issues reported by comparison with another engine.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, castMagic, waiveThreshold, summonCard, giveArtifact, act, actFail, settlePrompts } from './helpers'
import { effAttack, effKeywords } from '../src/engine/statics'
import { hushedByStatic } from '../src/engine/effects'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('12H #1: Acid Rain silences carried artifacts too', () => {
  it("a carried Mandrake Jars / Magnetic Muzzle / Truesight Crossbow under Acid Rain gives its bearer nothing", () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const a = summonCard(g, 0, 'Bone Jumble', 2, 2)
    const b = summonCard(g, 0, 'Bone Jumble', 2, 2)
    const c = summonCard(g, 0, 'Bone Jumble', 2, 2)
    giveArtifact(g, a, 'Mandrake Jars')
    giveArtifact(g, b, 'Magnetic Muzzle')
    giveArtifact(g, c, 'Truesight Crossbow')
    expect(effAttack(g, a)).toBe(2)
    expect(hushedByStatic(g, b)).toBe(true)
    expect(effKeywords(g, c).ranged).toBeTruthy()

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Acid Rain', { at: { x: 2, y: 2 } })
    expect(effAttack(g, a), 'silenced Jars: no +1').toBe(1)
    expect(hushedByStatic(g, b), 'silenced Muzzle: bearer not silenced').toBe(false)
    expect(effKeywords(g, c).ranged, 'silenced Crossbow: no Ranged').toBeFalsy()
  })
})

describe('12H #4: a defender killed by the site it enters never completes the Defend', () => {
  it('Troll Bridge kills the defending Bone Jumble on entry: the Trolls still fight the Monks', () => {
    const g: any = newGame(); keepBoth(g)
    for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) placeSite(g, 0, 'Spire', x, y)
    for (const s of Object.values(g.sites) as any[]) if (s.x === 2 && s.y === 2) delete g.sites[s.id]
    placeSite(g, 0, 'Troll Bridge', 2, 2)
    g.players[1].hand = []
    const trolls = summonCard(g, 0, 'Cave Trolls', 2, 1); trolls.enteredTurn = -5
    const monks = summonCard(g, 1, 'Monks of Kobalsa', 2, 2); monks.enteredTurn = -5
    const widow = summonCard(g, 1, 'Bone Jumble', 2, 3); widow.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: trolls.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: monks.id } })
    const p = g.prompts.find((q: any) => q.kind === 'defend')
    expect(p, 'defend window').toBeTruthy()
    act(g, 1, { t: 'prompt', promptId: p.id, choice: [{ unitId: widow.id, path: [{ x: 2, y: 2, region: 'surface' }] }] })
    settlePrompts(g)
    expect(g.units[widow.id], 'the bridge killed the defender').toBeUndefined()
    expect(g.units[monks.id]?.damage, 'the Monks were fought').toBe(3)
    expect(g.units[trolls.id], 'the Monks struck back').toBeUndefined()
  })
  it('Briar Patch kills the defending Bone Jumble on entry: the attacker still fights its target', () => {
    const g: any = newGame(); keepBoth(g)
    for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) placeSite(g, 0, 'Spire', x, y)
    for (const s of Object.values(g.sites) as any[]) if (s.x === 2 && s.y === 2) delete g.sites[s.id]
    placeSite(g, 0, 'Briar Patch', 2, 2)
    const trolls = summonCard(g, 0, 'Cave Trolls', 2, 2); trolls.enteredTurn = -5
    const monks = summonCard(g, 1, 'Monks of Kobalsa', 2, 2); monks.enteredTurn = -5
    const owl = summonCard(g, 1, 'Bone Jumble', 2, 3); owl.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: trolls.id, path: [], attack: { unit: monks.id } })
    const p = g.prompts.find((q: any) => q.kind === 'defend')
    expect(p, 'defend window').toBeTruthy()
    act(g, 1, { t: 'prompt', promptId: p.id, choice: [{ unitId: owl.id, path: [{ x: 2, y: 2, region: 'surface' }] }] })
    settlePrompts(g)
    expect(g.units[owl.id], 'the briars killed the defender').toBeUndefined()
    expect(g.units[monks.id]?.damage, 'the Monks were fought').toBe(3)
  })
})

describe('12H #5: a defender walking past the square in front of Hillock Basilisk is not at rest', () => {
  it('the Barging Barghest walks through the gazed square and defends', () => {
    const g: any = newGame(); keepBoth(g)
    for (let y = 0; y <= 3; y++) placeSite(g, 0, 'Spire', 2, y)
    const basilisk = summonCard(g, 0, 'Hillock Basilisk', 2, 0); basilisk.enteredTurn = -5
    const troll = summonCard(g, 1, 'Bosk Troll', 2, 1); troll.enteredTurn = -5
    const barghest = summonCard(g, 1, 'Barging Barghest', 2, 3); barghest.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: basilisk.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: troll.id } })
    const p = g.prompts.find((q: any) => q.kind === 'defend')
    expect(p?.data?.candidates, 'the Barghest may defend').toContain(barghest.id)
    act(g, 1, { t: 'prompt', promptId: p.id, choice: [{ unitId: barghest.id, path: [{ x: 2, y: 2, region: 'surface' }, { x: 2, y: 1, region: 'surface' }] }] })
    settlePrompts(g)
    expect(g.units[troll.id], 'the attacked Troll is not fought').toBeTruthy()
    expect(g.units[troll.id]?.damage ?? 0).toBe(0)
    expect(g.units[barghest.id], 'the Barghest defended and traded').toBeUndefined()
  })
})

describe("12H #6: Flaming Sword's splash from a Lethal bearer is lethal", () => {
  it('Lake Afanc with the Sword kills the Greater Blood Demon with the splash', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const afanc = summonCard(g, 0, 'Lake Afanc', 2, 1); afanc.enteredTurn = -5
    giveArtifact(g, afanc, 'Flaming Sword')
    const huntress = summonCard(g, 1, 'Sherwood Huntress', 2, 2); huntress.enteredTurn = -5
    const demon = summonCard(g, 1, 'Greater Blood Demon', 2, 2); demon.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: afanc.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: huntress.id } })
    settlePrompts(g)
    expect(g.units[huntress.id]).toBeUndefined()
    expect(g.units[demon.id], 'the Lethal splash kills the Demon').toBeUndefined()
  })
})

describe('12H #7: a Lethal strike kills only after the simultaneous strikes', () => {
  const board = () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    return g
  }
  it("Sacred Scarabs' Deathrite hits the Saint whose Ward their strike already broke", () => {
    const g = board()
    const scarabs = summonCard(g, 0, 'Sacred Scarabs', 2, 1); scarabs.enteredTurn = -5
    const saint = summonCard(g, 1, 'Saint of Redemption', 2, 2); saint.enteredTurn = -5; saint.tapped = false
    giveArtifact(g, saint, 'Poisonous Dagger')
    act(g, 0, { t: 'moveAttack', unitId: scarabs.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: saint.id } })
    settlePrompts(g)
    expect(g.units[scarabs.id]).toBeUndefined()
    expect(g.units[saint.id], 'the Deathrite kills the unwarded Saint').toBeUndefined()
  })
  it('Fourberie Knot still sees the Megalurker\'s 6 power when the Lethal strike kills it', () => {
    const g = board()
    const puffer = summonCard(g, 0, 'Porcupine Pufferfish', 2, 1); puffer.enteredTurn = -5
    giveArtifact(g, puffer, 'Fourberie Knot')
    const lurker = summonCard(g, 1, 'Megalurker', 2, 2); lurker.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: puffer.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: lurker.id } })
    settlePrompts(g)
    expect(g.units[lurker.id]).toBeUndefined()
    expect(g.units[puffer.id], 'the Knot prevented the 6 damage').toBeTruthy()
  })
  it("Grim Reaper killed by a Lethal strike still banishes the minion its simultaneous strike killed", () => {
    const g = board()
    const puffer = summonCard(g, 0, 'Porcupine Pufferfish', 2, 1); puffer.enteredTurn = -5
    const reaper = summonCard(g, 1, 'Grim Reaper', 2, 2); reaper.enteredTurn = -5
    const card = puffer.cardId
    act(g, 0, { t: 'moveAttack', unitId: puffer.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: reaper.id } })
    settlePrompts(g)
    expect(g.units[puffer.id]).toBeUndefined()
    expect(g.units[reaper.id]).toBeUndefined()
    expect(g.players[0].cemetery, 'banished, not in the cemetery').not.toContain(card)
  })
})

describe('12H #7 controls: Grim Reaper trades', () => {
  const board = () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    return g
  }
  it('a non-Lethal attacker that trades with the Reaper is banished', () => {
    const g = board()
    const merc = summonCard(g, 0, 'Cave Trolls', 2, 1); merc.enteredTurn = -5
    const reaper = summonCard(g, 1, 'Grim Reaper', 2, 2); reaper.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: merc.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: reaper.id } })
    settlePrompts(g)
    expect(g.units[merc.id]).toBeUndefined()
    expect(g.players[0].cemetery).not.toContain(merc.cardId)
    expect(g.players[0].banished).toContain(merc.cardId)
  })
  it('a Lethal Pufferfish the Reaper attacks is banished', () => {
    const g = board()
    g.activePlayer = 1
    const puffer = summonCard(g, 0, 'Porcupine Pufferfish', 2, 2); puffer.enteredTurn = -5
    const reaper = summonCard(g, 1, 'Grim Reaper', 2, 1); reaper.enteredTurn = -5
    act(g, 1, { t: 'moveAttack', unitId: reaper.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: puffer.id } })
    settlePrompts(g)
    expect(g.units[puffer.id]).toBeUndefined()
    expect(g.players[0].banished).toContain(puffer.cardId)
  })
})

describe('12H #8: Begone! (no "target") may pick Failed Mutation', () => {
  it('banishes the Failed Mutation', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const fm = summonCard(g, 1, 'Failed Mutation', 2, 2)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Begone!', { targets: [fm.id] })
    expect(g.units[fm.id]).toBeUndefined()
    expect(g.players[1].banished).toContain(fm.cardId)
  })
})

describe('12H #10: a minion the Bodach Bogeyman picks up enters its square', () => {
  it('the snatched enemy enters your Troll Bridge and is struck', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Troll Bridge', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    g.players[1].hand = []
    const bodach = summonCard(g, 0, 'Bodach Bogeyman', 2, 1); bodach.enteredTurn = -5
    const prey = summonCard(g, 1, 'Cave Trolls', 2, 2); prey.enteredTurn = -5
    act(g, 0, { t: 'activate', sourceId: bodach.id, ability: 'snatch' })
    settlePrompts(g)
    expect(g.units[prey.id], 'the Bridge struck the 3/3 for 3').toBeUndefined()
  })
})

describe("12H #11: Rhongomyniad's piercing throw hits one unit at each location", () => {
  it('two enemies sharing a square: only the chosen one takes 3; an enemy on the thrower\'s square is hit too', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const hyena = summonCard(g, 0, 'Bone Jumble', 2, 1); hyena.enteredTurn = -5
    const lance = giveArtifact(g, hyena, 'Rhongomyniad')
    const knight = summonCard(g, 1, 'Cave Trolls', 2, 1); knight.enteredTurn = -5
    const a = summonCard(g, 1, 'Cave Trolls', 2, 2); a.enteredTurn = -5
    const b = summonCard(g, 1, 'Cave Trolls', 2, 2); b.enteredTurn = -5
    act(g, 0, { t: 'activate', sourceId: lance.id, ability: 'hurl' })
    act(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: 'n' })
    settlePrompts(g)
    expect(g.units[knight.id], 'the enemy at the start location is hit').toBeUndefined()
    expect([g.units[a.id], g.units[b.id]].filter((u) => !u).length, 'only one of the two is hit').toBe(1)
    expect([g.artifacts[lance.id].x, g.artifacts[lance.id].y, g.artifacts[lance.id].carriedBy]).toEqual([2, 2, null])
  })
})

describe('12H #12: a projectile with two valid units must hit one of them', () => {
  it("Cherubim's shot refuses an empty answer to 'which unit is hit?'", () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1)
    const cherub = summonCard(g, 0, 'Cherubim', 2, 1); cherub.enteredTurn = -5
    const a = summonCard(g, 1, 'Bone Jumble', 2, 1); a.tapped = true
    const b = summonCard(g, 1, 'Bone Jumble', 2, 1); b.tapped = true
    act(g, 0, { t: 'activate', sourceId: cherub.id, ability: 'bolt' })
    act(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: 'n' })
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(actFail(g, 0, { t: 'prompt', promptId: p.id, choice: [] })).toMatch(/choose/i)
    act(g, 0, { t: 'prompt', promptId: p.id, choice: [b.id] })
    expect(g.units[b.id]).toBeUndefined()
    expect(g.units[a.id]).toBeTruthy()
  })
})

describe('12H #3: choices without "target" neither break Ward nor skip Stealth', () => {
  it('Wuthering Heights flies a warded enemy and it keeps its Ward', () => {
    const g: any = newGame(); keepBoth(g)
    const heights = placeSite(g, 0, 'Wuthering Heights', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const cherub = summonCard(g, 1, 'Cherubim', 2, 1); cherub.enteredTurn = -5; cherub.ward = true
    act(g, 0, { t: 'activate', sourceId: heights.id, ability: 'gust' })
    act(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: [cherub.id] })
    act(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: { x: 2, y: 2 } })
    expect([g.units[cherub.id].x, g.units[cherub.id].y]).toEqual([2, 2])
    expect(g.units[cherub.id].ward, 'Ward intact').toBeTruthy()
  })
  it("Persecutor's brand leaves the Ward and may pick a Stealthed enemy", () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    const av = g.units[g.players[0].avatarUnitId]; av.name = 'Persecutor'; g.cards[av.cardId].name = 'Persecutor'
    const cherub = summonCard(g, 1, 'Cherubim', 2, 2); cherub.ward = true
    const sneak = summonCard(g, 1, 'Bone Jumble', 2, 2); sneak.stealth = true
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'zeal' })
    act(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: 'brands an enemy as Evil' })
    expect(g.prompts[0].data.candidates).toContain(sneak.id)
    act(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: [cherub.id] })
    expect(g.flow.branded?.unitId).toBe(cherub.id)
    expect(g.units[cherub.id].ward, 'Ward intact').toBeTruthy()
  })
  it('Doctor Demetrius may Ward a Stealthed adjacent enemy, but not himself', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const doc = summonCard(g, 0, 'Doctor Demetrius', 2, 1); doc.enteredTurn = -5
    const sneak = summonCard(g, 1, 'Cave Trolls', 2, 2); sneak.stealth = true
    act(g, 0, { t: 'activate', sourceId: doc.id, ability: 'ward', targets: [sneak.id] })
    expect(g.units[sneak.id].ward).toBeTruthy()
    expect(actFail(g, 0, { t: 'activate', sourceId: doc.id, ability: 'ward', targets: [doc.id] })).toBeTruthy()
  })
})
