// Review 3 (THEIRS_12H #13-#24): regression guards for rules issues reported by comparison with another engine.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, act, actFail, settlePrompts, castMagic, waiveThreshold } from './helpers'
import { makeCtx, checkStateBased } from '../src'
import { reachableLocations } from '../src/engine/movement'
import '../src/cards/scripts/index'

describe('12H #14: a disabled Key to the City bearer no longer ignores site abilities', () => {
  it('the Grey Wolves carrying the Key over a burrowed Root Spider fall into the Pit', () => {
    const g: any = newGame(42, 0); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Bottomless Pit', 2, 1)
    const spider = summonCard(g, 0, 'Root Spider', 2, 1, 'underground'); spider.enteredTurn = -1
    const wolves = summonCard(g, 0, 'Grey Wolves', 4, 3); wolves.enteredTurn = -1
    giveArtifact(g, wolves, 'Key to the City')
    makeCtx(g, wolves.id, 0, []).teleport(wolves.id, 2, 1, 'surface')
    checkStateBased(g)
    expect(g.units[wolves.id], 'disabled, so the Key gives nothing').toBeFalsy()
  })
})

describe('12H #15: a Sister Stefánia silenced by Bower of Bliss silences no one, whatever the entry order', () => {
  it('the Ghost that entered before her keeps its Stealth', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Bower of Bliss', 2, 1); placeSite(g, 1, 'Spire', 2, 2)
    const ghost = summonCard(g, 1, 'Gossamer Ghost', 2, 2); ghost.stealth = true
    const stef = summonCard(g, 0, 'Sister Stefánia', 2, 1)
    checkStateBased(g)
    expect(g.units[stef.id].silenced, 'the Bower silences the Mortal Stefánia').toBeTruthy()
    expect(g.units[ghost.id].silenced).toBeFalsy()
    expect(g.units[ghost.id].stealth).toBe(true)
  })
})
describe('12H #15 control', () => {
  it('without the Bower, Stefánia silences the Ghost', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 1, 'Spire', 2, 2)
    const ghost = summonCard(g, 1, 'Gossamer Ghost', 2, 2); ghost.stealth = true
    summonCard(g, 0, 'Sister Stefánia', 2, 1)
    checkStateBased(g)
    expect(g.units[ghost.id].silenced).toBeTruthy()
  })
})

describe('12H #16: a site claimed by Land Deed returns when no one bears the Deed', () => {
  it('the Courser dies: the Steppe is mine again', () => {
    const g: any = newGame(); keepBoth(g)
    const steppe = placeSite(g, 0, 'Steppe', 2, 1)
    const courser = summonCard(g, 1, 'Fine Courser', 2, 1)
    giveArtifact(g, courser, 'Land Deed')
    checkStateBased(g)
    expect(steppe.controller).toBe(1)
    courser.damage = 5
    checkStateBased(g)
    expect(g.units[courser.id]).toBeUndefined()
    expect(steppe.controller, 'back to me').toBe(0)
  })
})

describe('12H #17: a Stealthed bearer that deals damage with Bull Whip loses Stealth', () => {
  it('the Midnight Rogue whips an adjacent enemy and is revealed', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const rogue = summonCard(g, 0, 'Midnight Rogue', 2, 1); rogue.enteredTurn = -5; rogue.stealth = true
    const whip = giveArtifact(g, rogue, 'Bull Whip')
    const foe = summonCard(g, 1, 'Cave Trolls', 2, 2)
    act(g, 0, { t: 'activate', sourceId: whip.id, ability: 'crack', targets: [foe.id] })
    settlePrompts(g)
    expect(g.units[foe.id].damage).toBe(1)
    expect(g.units[rogue.id].stealth).toBeFalsy()
  })
})

describe('12H #18: a Stealthed minion that strikes outside its own attack loses Stealth', () => {
  it('Blaze of Glory: the Stealthed Poachers strike back and are revealed', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const wolves = summonCard(g, 0, 'Grey Wolves', 2, 1)
    const poachers = summonCard(g, 1, 'Kingswood Poachers', 2, 2); poachers.stealth = true
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Blaze of Glory', { targets: [wolves.id] })
    settlePrompts(g)
    expect(g.units[poachers.id]?.damage, 'the fight happened').toBeGreaterThan(0)
    expect(g.units[poachers.id].stealth).toBeFalsy()
  })
  it("Sturmgeist's triggered strike breaks its Stealth, so the next shard hits it", () => {
    const g: any = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]
    for (let y = 0; y <= 3; y++) placeSite(g, 0, 'Spire', av.x, y)
    placeSite(g, 0, 'Spire', av.x + 1, av.y)
    const sturm = summonCard(g, 1, 'Sturmgeist', av.x + 1, av.y); sturm.tapped = true; sturm.stealth = true
    waiveThreshold(g, 0)
    const life = av.life
    castMagic(g, 0, 'Ice Shards', { extra: { direction: 'e' } })
    settlePrompts(g)
    expect(av.life, 'Sturmgeist struck the Avatar').toBeLessThan(life)
    expect(g.units[sturm.id]?.stealth ?? false).toBeFalsy()
  })
})

describe("12H #19: a summoning-sick bearer can't be tapped for its artifact's Tap ability", () => {
  it('Holy Water on a bearer summoned this turn is not usable', () => {
    const g: any = newGame(); keepBoth(g); g.turn = 3
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const troll = summonCard(g, 0, 'Bosk Troll', 2, 1); troll.enteredTurn = g.turn
    const water = giveArtifact(g, troll, 'Holy Water')
    summonCard(g, 1, 'Skeleton', 2, 2)
    expect(actFail(g, 0, { t: 'activate', sourceId: water.id, ability: 'splash' })).toBeTruthy()
    expect(g.units[troll.id].tapped).toBeFalsy()
    troll.enteredTurn = 1 // not sick any more
    act(g, 0, { t: 'activate', sourceId: water.id, ability: 'splash' })
    expect(g.units[troll.id].tapped).toBe(true)
  })
})

describe("12H #20: Ormund Harpooneers' Tap ability can't be used with no legal target", () => {
  it('refused, and the Harpooneers stay untapped', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1)
    const h = summonCard(g, 0, 'Ormund Harpooneers', 2, 1); h.enteredTurn = -5
    expect(actFail(g, 0, { t: 'activate', sourceId: h.id, ability: 'harpoon' })).toBeTruthy()
    expect(g.units[h.id].tapped).toBeFalsy()
  })
})

describe('12H #21: Tide Naiads moving onto Bedrock tap nobody', () => {
  it("the flood fails and the Apostles stay untapped", () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Bedrock', 2, 2)
    const naiads = summonCard(g, 0, 'Tide Naiads', 2, 1); naiads.enteredTurn = -5
    const apostles = summonCard(g, 1, 'Apostles of Thamariel', 2, 2); apostles.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: naiads.id, path: [{ x: 2, y: 2, region: 'surface' }] })
    expect(g.units[naiads.id].y).toBe(2)
    expect(g.units[apostles.id].tapped).toBeFalsy()
  })
})

describe("12H #22: the non-active player's curse resolves before the active player's damage trigger", () => {
  it('Accursed Albatross kills the Skeleton the Army left behind, not the one its damage makes', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 1); placeSite(g, 0, 'Spire', 2, 2)
    const ea = g.units[g.players[1].avatarUnitId]; ea.x = 2; ea.y = 2; ea.region = 'surface'
    const army = summonCard(g, 0, 'Army of the Dead', 2, 1); army.enteredTurn = -5
    const bird = summonCard(g, 1, 'Accursed Albatross', 2, 2); bird.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: army.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: ea.id } })
    const p = g.prompts.find((q: any) => q.kind === 'defend')
    expect(p?.data?.candidates).toContain(bird.id)
    act(g, 1, { t: 'prompt', promptId: p.id, choice: [bird.id] })
    settlePrompts(g)
    expect(g.units[bird.id]).toBeUndefined()
    expect(g.units[army.id]?.damage, 'struck by the Albatross and the Avatar').toBe(2)
    const skels = (Object.values(g.units) as any[]).filter((u) => u.name === 'Skeleton')
    expect(skels.map((s) => [s.x, s.y]), "only the damage Skeletons on the Army's square survive").toEqual([[2, 2], [2, 2]])
  })
})

describe('12H #23: Tufted Turtles fighting on a Basilisk square keep their prevention through the order question', () => {
  it('the attacking Turtles survive the defending Basilisk', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 1, 2); placeSite(g, 0, 'Spire', 2, 2)
    const turtles = summonCard(g, 0, 'Tufted Turtles', 1, 2); turtles.enteredTurn = -5
    const amazons = summonCard(g, 0, 'Amazon Warriors', 2, 2); amazons.enteredTurn = -5
    giveArtifact(g, amazons, 'Plate of the Whale')
    const monks = summonCard(g, 1, 'Monks of Kobalsa', 2, 2); monks.enteredTurn = -5
    summonCard(g, 1, 'Grim Reaper', 2, 2).enteredTurn = -5
    const basilisk = summonCard(g, 1, 'Hillock Basilisk', 2, 2); basilisk.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: turtles.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: monks.id } })
    const p = g.prompts.find((q: any) => q.kind === 'defend')
    expect(p?.data?.candidates).toContain(basilisk.id)
    act(g, 1, { t: 'prompt', promptId: p.id, choice: [basilisk.id] })
    const kinds: string[] = []
    for (let i = 0; i < 20 && g.prompts.length; i++) {
      const q = g.prompts[0]; kinds.push(q.kind)
      if (q.kind === 'stayInFight') act(g, q.player, { t: 'prompt', promptId: q.id, choice: false }) // the Monks step out: only the Basilisk strikes
      else settlePrompts(g, 1)
    }
    expect(g.units[basilisk.id]?.damage, 'the Turtles struck the Basilisk').toBe(2)
    expect(g.units[turtles.id], `the shell held (prompts: ${kinds.join(',')})`).toBeTruthy()
    expect(g.units[turtles.id].damage).toBe(0)
    expect(kinds, 'the Plate protects only its bearer: no order question').not.toContain('orderCards')
  })

  it('a warded Turtles is asked to order Ward and shell; the shell still works after the question', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 1, 2); placeSite(g, 0, 'Spire', 2, 2)
    const turtles = summonCard(g, 0, 'Tufted Turtles', 1, 2); turtles.enteredTurn = -5; turtles.ward = true
    const amazons = summonCard(g, 0, 'Amazon Warriors', 2, 2); amazons.enteredTurn = -5
    const monks = summonCard(g, 1, 'Monks of Kobalsa', 2, 2); monks.enteredTurn = -5
    summonCard(g, 1, 'Grim Reaper', 2, 2).enteredTurn = -5
    const basilisk = summonCard(g, 1, 'Hillock Basilisk', 2, 2); basilisk.enteredTurn = -5
    act(g, 0, { t: 'moveAttack', unitId: turtles.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: monks.id } })
    const p = g.prompts.find((q: any) => q.kind === 'defend')
    expect(p?.data?.candidates).toContain(basilisk.id)
    act(g, 1, { t: 'prompt', promptId: p.id, choice: [basilisk.id] })
    const kinds: string[] = []
    for (let i = 0; i < 20 && g.prompts.length; i++) {
      const q = g.prompts[0]; kinds.push(q.kind)
      if (q.kind === 'stayInFight') act(g, q.player, { t: 'prompt', promptId: q.id, choice: false }) // the Monks step out: only the Basilisk strikes
      else settlePrompts(g, 1)
    }
    expect(g.units[basilisk.id]?.damage, 'the Turtles struck the Basilisk').toBe(2)
    expect(g.units[turtles.id], `the shell held (prompts: ${kinds.join(',')})`).toBeTruthy()
    expect(g.units[turtles.id].damage).toBe(0)
    expect(kinds, 'the order question was asked').toContain('orderCards')
    expect(g.log.some((l: any) => /duck into their shells/.test(l.msg)), 'the shell took the blow after the question').toBe(true)
  })
})

describe('12H #24: an Acid Rain beside a Dalcean Phalanx changes nothing for it', () => {
  it('the Phalanx keeps the same moves into its next turn', () => {
    const moves = (rain: boolean) => {
      const g: any = newGame(42, 0); keepBoth(g)
      for (let x = 0; x <= 4; x++) for (let y = 0; y <= 3; y++) placeSite(g, 1, 'Steppe', x, y)
      for (const s of Object.values(g.sites) as any[]) if (s.x === 3 && s.y === 2) delete g.sites[s.id]
      placeSite(g, 0, 'Spire', 3, 2)
      const ph = summonCard(g, 1, 'Dalcean Phalanx', 2, 2); ph.enteredTurn = -5
      if (rain) {
        const cardId = `cr${g.nextId++}`; g.cards[cardId] = { id: cardId, name: 'Acid Rain', owner: 1 }
        g.auras.ar1 = { id: 'ar1', cardId, name: 'Acid Rain', controller: 1, owner: 1, anchor: { x: 3, y: 2 }, squares: [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 3 }] }
      }
      act(g, 0, { t: 'endTurn' }); settlePrompts(g)
      expect(g.activePlayer).toBe(1)
      expect(ph.tapped).toBeFalsy()
      return JSON.stringify(reachableLocations(g, ph))
    }
    expect(moves(true)).toBe(moves(false))
  })
})
