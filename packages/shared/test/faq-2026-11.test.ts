// Official FAQ / codex updates, Oct 23 – Nov 13 2026, applied to cards that already had scripts.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, answer, giveArtifact } from './helpers'
import {
  avatarOf, makeCtx, getScript, siteSilenced, checkStateBased, wardUnit, wardSite, enterSite, viewFor,
  type GameState, type PlayerId,
} from '../src'
import '../src/cards/scripts/index'

const me: PlayerId = 0
const foe: PlayerId = 1

describe('Khamaseen Mummy / Fenvale Muse — you control the Genesis you trigger (FAQ reversal, Nov 2026)', () => {
  it("Khamaseen Mummy on an opponent's Vast Desert: the Mummy's controller picks the site to scour", () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, foe, 'Vast Desert', 2, 1)
    const target = placeSite(g, foe, 'Accursed Tower', 2, 2)
    const victim = summonCard(g, foe, 'Escyllion Cyclops', 2, 2) // 6/6, survives
    const mummy = summonCard(g, me, 'Khamaseen Mummy', 2, 1)

    getScript('Khamaseen Mummy')!.onUnitEntersSquare!(makeCtx(g, mummy.id, me, []), mummy, { x: 2, y: 1, region: 'underground' })
    expect(g.prompts[0]?.player, 'the Mummy controller decides whether to trigger').toBe(me)
    answer(g, true)

    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    expect(g.prompts[0]?.player, "the opponent's Desert Genesis is controlled by the Mummy's controller").toBe(me)
    answer(g, [target.id])
    expect(g.units[victim.id].damage).toBe(1)
  })

  it("Fenvale Muse on an opponent's River: the Muse's controller looks at THEIR OWN next spell", () => {
    const g: GameState = newGame(); keepBoth(g)
    const river = placeSite(g, foe, 'Spring River', 2, 2)
    const muse = summonCard(g, me, 'Fenvale Muse', 2, 1)
    const myTop = g.players[me].spellbook[0]

    getScript('Fenvale Muse')!.onSpellCast!(makeCtx(g, muse.id, me, []), me, 'Some Spell', muse.id)
    expect(g.prompts[0]?.kind).toBe('chooseSquare')
    answer(g, { x: river.x, y: river.y })

    const pr = g.prompts[0]
    expect(pr?.player, 'the River Genesis is controlled by the Muse controller').toBe(me)
    expect(pr?.data?.reveal, "it's the Muse controller's own next spell").toBe(g.cards[myTop].name)
    answer(g, 'put on bottom')
    expect(g.players[me].spellbook.at(-1), "the Muse controller's spell went to the bottom").toBe(myTop)
  })
})

describe('Druid flip side — a silenced site keeps the granted thorns (FAQ reversal, Nov 2026)', () => {
  function setup(siteName: string) {
    const g: GameState = newGame(); keepBoth(g); g.turn = 5
    const av = avatarOf(g, me); av.name = 'Druid'; av.flipped = true; av.x = 1; av.y = 1; av.region = 'surface'
    const site = placeSite(g, me, siteName, 2, 1) // allied site adjacent to the flipped Druid
    return { g, av, site }
  }
  function enter(g: GameState, av: { id: string }, x: number, y: number) {
    const intruder = summonCard(g, foe, 'Stygian Archers', x, y)
    getScript('Druid')!.onUnitEntersSquare!(makeCtx(g, av.id, me, []), intruder, { x, y, region: 'surface' })
    return intruder
  }

  it('Smokestacks of Gnaak silences the site, but an entering enemy still takes 1 damage', () => {
    const { g, av, site } = setup('Spire')
    placeSite(g, foe, 'Smokestacks of Gnaak', 3, 1)
    expect(siteSilenced(g, site), 'the allied site is silenced').toBe(true)
    expect(enter(g, av, 2, 1).damage, 'silence only removes printed abilities').toBe(1)
  })

  it('Atlantean Fate (a silence) leaves the granted thorns in place', () => {
    const { g, av, site } = setup('City of Glass')
    g.cards['afc'] = { id: 'afc', name: 'Atlantean Fate', owner: foe } as any
    g.auras['af'] = { id: 'af', cardId: 'afc', name: 'Atlantean Fate', controller: foe, squares: [{ x: 2, y: 1 }] } as any
    expect(siteSilenced(g, site)).toBe(true)
    expect(enter(g, av, 2, 1).damage).toBe(1)
  })

  it("Bedrock can't be modified — it never gains the ability", () => {
    const { g, av } = setup('Bedrock')
    expect(enter(g, av, 2, 1).damage).toBe(0)
  })
})

describe('Atlantean Fate is a silence (FAQ, Oct 2026)', () => {
  function castFate(g: GameState, squares: { x: number; y: number }[]) {
    g.cards['afc'] = { id: 'afc', name: 'Atlantean Fate', owner: foe } as any
    g.auras['af'] = { id: 'af', cardId: 'afc', name: 'Atlantean Fate', controller: foe, squares } as any
    getScript('Atlantean Fate')!.genesis!(makeCtx(g, 'af', foe, []))
  }

  it('a Vindictive Nation it silences still bills the caster ("as it becomes silenced, its ability triggers")', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    placeSite(g, me, 'Vindictive Nation', 2, 2)
    const life0 = avatarOf(g, foe).life!
    castFate(g, [{ x: 2, y: 2 }])
    expect(siteSilenced(g, { x: 2, y: 2 }), 'the Elite Nation is silenced').toBe(true)
    expect(avatarOf(g, foe).life).toBe(life0 - 1)
  })

  it("an unaffected Bedrock in the area isn't modified, so Vindictive Nation doesn't bill it", () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    placeSite(g, me, 'Vindictive Nation', 2, 2)
    const bedrock = placeSite(g, me, 'Bedrock', 2, 1)
    const life0 = avatarOf(g, foe).life!
    castFate(g, [{ x: 2, y: 1 }])
    expect(siteSilenced(g, bedrock)).toBe(false)
    expect(bedrock.flooded).toBeFalsy()
    expect(avatarOf(g, foe).life).toBe(life0)
  })

  it('a silenced site keeps its Ward mark', () => {
    const g: GameState = newGame(); keepBoth(g); g.turn = 3
    const city = placeSite(g, me, 'City of Glass', 2, 1)
    city.ward = true
    castFate(g, [{ x: 2, y: 1 }])
    checkStateBased(g)
    expect(siteSilenced(g, city)).toBe(true)
    expect(g.sites[city.id].ward, 'only a disable removes the mark').toBe(true)
  })
})

describe("Can't be Modified — no Stealth mark or Ward mark (codex, Nov 2026)", () => {
  it("The Doom of Dilmun can't be warded or keep a Stealth mark", () => {
    const g: GameState = newGame(); keepBoth(g)
    const doom = summonCard(g, me, 'The Doom of Dilmun', 2, 2)
    expect(wardUnit(g, doom)).toBe(false)
    makeCtx(g, doom.id, me, []).grantKeyword(doom.id, 'ward', 'permanent' as any)
    expect(doom.modifiers.some((m) => m.kind === 'keyword'), 'no Ward keyword granted either').toBe(false)
    doom.ward = true; doom.stealth = true // written by some effect directly
    checkStateBased(g)
    expect(doom.ward).toBeFalsy()
    expect(doom.stealth).toBeFalsy()
  })

  it('Monks of Kobalsa ("except by Wards") can be warded but never stealthed', () => {
    const g: GameState = newGame(); keepBoth(g)
    const monks = summonCard(g, me, 'Monks of Kobalsa', 2, 2)
    expect(wardUnit(g, monks)).toBe(true)
    monks.stealth = true
    checkStateBased(g)
    expect(monks.ward, 'the printed exception lets the Ward stay').toBe(true)
    expect(monks.stealth, "can't gain a stealth mark").toBeFalsy()
  })

  it('a unit pinned by Tabula Rasa has no "except by Wards" exception', () => {
    const g: GameState = newGame(); keepBoth(g)
    const monks = summonCard(g, me, 'Monks of Kobalsa', 2, 2)
    giveArtifact(g, monks, 'Tabula Rasa')
    expect(wardUnit(g, monks)).toBe(false)
  })

  it("Bedrock can't be warded", () => {
    const g: GameState = newGame(); keepBoth(g)
    const bedrock = placeSite(g, me, 'Bedrock', 2, 2)
    expect(wardSite(g, bedrock, foe)).toBe(false)
    expect(bedrock.ward).toBeFalsy()
    bedrock.ward = true
    checkStateBased(g)
    expect(g.sites[bedrock.id].ward).toBeFalsy()
  })
})

describe("Replace — if you can't replace the site, it isn't banished (codex, Nov 2026)", () => {
  it('Terraform leaves a site alone when its controller has no atlas', () => {
    const g: GameState = newGame(); keepBoth(g)
    const site = placeSite(g, foe, 'Spire', 2, 2)
    g.players[foe].atlas = []
    getScript('Terraform')!.onCast!(makeCtx(g, 'terraform', me, [], { x: 2, y: 0 }))
    expect(g.sites[site.id]?.name).toBe('Spire')
    expect(g.players[foe].banished.includes(site.cardId)).toBe(false)
  })

  it('Geomancer reclaim with an empty atlas leaves the Rubble in place', () => {
    const g: GameState = newGame(); keepBoth(g)
    const geo = summonCard(g, me, 'Geomancer', 2, 2)
    const rubble = placeSite(g, me, 'Rubble', 2, 3); rubble.isRubble = true
    g.players[me].atlas = []
    getScript('Geomancer')!.abilities!.find((a) => a.key === 'reclaim')!.effect(makeCtx(g, geo.id, me, []))
    expect(g.sites[rubble.id], 'the Rubble stays').toBeTruthy()
  })
})

describe('Zone — face-down Traps in the realm are hidden information (codex, Nov 2026)', () => {
  it("the opponent's view never carries a face-down trap's real card", () => {
    const g: GameState = newGame(); keepBoth(g)
    const cid = `ctrap${g.nextId++}`
    g.cards[cid] = { id: cid, name: 'Ember Ambush', owner: me } as any
    const siteId = enterSite(g, me, cid, 2, 2)
    expect(viewFor(g, me).sites[siteId].trap?.realName).toBe('Ember Ambush')
    for (const who of [foe, null] as const) {
      const v = viewFor(g, who)
      expect(v.sites[siteId].name).toBe('Wasteland')
      expect(JSON.stringify(v).includes('Ember Ambush')).toBe(false)
    }
  })
})
