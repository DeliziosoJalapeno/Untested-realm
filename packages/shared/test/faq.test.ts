// Interaction tests derived from official FAQ rulings (sorcery-rag docs,
// source='faq'). Each test names its card and encodes the ruling as a real
// game-state scenario.

import { describe, it, expect } from 'vitest'
import {
  newGame, act, actFail, keepBoth, answer, fetchToHand, giveMana,
  injectToHand, summonCard, giveArtifact, castMagic, castMagicFail, placeSite, waiveThreshold,
} from './helpers'
import {
  avatarOf, siteAt, summonToken, effAttack, effKeywords, effDefence,
  validateSummonAt, dealDamageToUnit, unitsAt, occupiedSquares, getScript, makeCtx, effSubtypes,
  reachableLocations, tapUnit, beginAttack, moveAttack, isDisabled, affinity, loseLife, gainLife, killUnit, destroySite, isEvilUnit, emitUnitEnters,
  getCard, checkStateBased, isWaterSite, isLegalStep, playSite, canCast, findPath, canTap, siteCantBeMoved,
  siteCantBeModified, applyFlood, siteSilenced, viewFor, endTurn, beginTurn, wardUnit, effectCastSpell, castFromCollection, grantedAbilities,
  effectiveCost, allCards, projectileCanHit, strikeSite, reconcileSummonTax,
} from '../src'
import type { GameState } from '../src'

/** mid-game board: mulligans done, p0 owns sites at (2,0)+(3,0), fresh main phase */
function board(): GameState {
  const g = newGame()
  keepBoth(g)
  const v1 = fetchToHand(g, 0, 'Rustic Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
  if (g.prompts.length) answer(g, false)
  avatarOf(g, 0).tapped = false
  const v2 = fetchToHand(g, 0, 'Simple Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v2, x: 3, y: 0 })
  if (g.prompts.length) answer(g, false)
  return g
}

describe('Legion of Gall: banish-from-collection shows the collection as a grid', () => {
  it('offers the looked-at collection as a clickable grid and banishes three', () => {
    const g = board()
    g.players[0].collection = { Fireball: 2, 'Giant Shark': 1, Drown: 1 }
    const legion = summonToken(g, 'Legion of Gall', 0, 2, 0)!
    getScript('Legion of Gall')!.genesis!(makeCtx(g, legion.id, 0, []))
    expect(g.prompts[0]?.kind).toBe('chooseOption') // whose collection
    answer(g, 'yours')
    const p: any = g.prompts[0]
    expect(p.kind).toBe('nameCard')
    expect(p.data.fromCollection).toBe(true) // renders as the collection grid, not free text
    expect([...p.data.names].sort()).toEqual(['Drown', 'Fireball', 'Giant Shark'])
    answer(g, 'Fireball')
    expect([...(g.prompts[0] as any).data.names].sort()).toEqual(['Drown', 'Giant Shark']) // banished one drops out
    answer(g, 'Giant Shark')
    answer(g, 'Drown')
    expect(g.prompts.length).toBe(0) // nothing left → done
    expect([...(g.flow as any).collectionBans[0]].sort()).toEqual(['Drown', 'Fireball', 'Giant Shark'])
  })
})

describe('Pith Imp steals only spells, never a site', () => {
  it('filches the spell from a hand of [spell + site], and the spell count drops (not sites)', () => {
    const g = board()
    g.players[1].hand = [] // control the victim's hand exactly
    const spell = injectToHand(g, 1, 'Fireball')
    injectToHand(g, 1, 'Floodplain') // a Site in hand — must NOT be stealable
    const beforeSpells = viewFor(g, 1).players[1].handCounts.spells
    const beforeSites = viewFor(g, 1).players[1].handCounts.sites
    const imp = summonToken(g, 'Pith Imp', 0, 2, 0)!
    getScript('Pith Imp')!.genesis!(makeCtx(g, imp.id, 0, []))
    const stolen = (g.flow as any).stolen ?? []
    expect(stolen.length).toBe(1)
    expect(stolen[0].cardId).toBe(spell) // the Fireball, not the Floodplain
    const v = viewFor(g, 1)
    expect(v.players[1].handCounts.spells).toBe(beforeSpells - 1) // a spell left the count
    expect(v.players[1].handCounts.sites).toBe(beforeSites) // sites untouched
  })

  it('a hand containing only sites yields no theft', () => {
    const g = board()
    g.players[1].hand = []
    injectToHand(g, 1, 'Floodplain')
    const imp = summonToken(g, 'Pith Imp', 0, 2, 0)!
    getScript('Pith Imp')!.genesis!(makeCtx(g, imp.id, 0, []))
    expect(((g.flow as any).stolen ?? []).length).toBe(0)
  })
})

describe('Hand counter excludes sealed (Pith Imp) and caster-locked (Omphalos) cards', () => {
  it('a Pith-Imp-stolen spell still shows in hand but is not counted (while the thief lives)', () => {
    const g = board()
    const c1 = injectToHand(g, 1, 'Fireball')
    const c2 = injectToHand(g, 1, 'Lightning Bolt')
    const before = viewFor(g, 1).players[1].handCounts.spells
    const thief = summonToken(g, 'Pith Imp', 0, 2, 0)! // p0's thief
    g.flow = { ...(g.flow ?? {}), stolen: [{ cardId: c1, unitId: thief.id }] } as any
    const v = viewFor(g, 1)
    expect(v.players[1].handCounts.spells).toBe(before - 1) // stolen one no longer counts
    expect(v.players[1].hand).toContain(c1) // ...but the owner still sees it (sealed) in hand
    expect(v.players[1].hand).toContain(c2)
    // if the thief dies, the seal lifts and it counts again
    killUnit(g, thief.id)
    expect(viewFor(g, 1).players[1].handCounts.spells).toBe(before)
  })

  it('a caster-locked (Omphalos/Morgana) card in hand is shown but not counted', () => {
    const g = board()
    const locked = injectToHand(g, 0, 'Fireball')
    const normal = injectToHand(g, 0, 'Lightning Bolt')
    const base = viewFor(g, 0).players[0].handCounts.spells
    g.flow = { ...(g.flow ?? {}), lockedCards: [{ cardId: locked, casterId: 'x', casterName: 'Omphalos' }] } as any
    const v = viewFor(g, 0)
    expect(v.players[0].handCounts.spells).toBe(base - 1) // locked one excluded
    expect(v.players[0].hand).toContain(locked) // still shown in your hand
    expect(v.players[0].hand).toContain(normal)
  })
})

describe('Online cheat-resistance: viewFor hides all opponent secret state', () => {
  it("an opponent's view exposes no hidden hand/deck cards, no card names, no RNG seed", () => {
    const g = board() // both players have starting hands (kept)
    expect(g.players[0].hand.length).toBeGreaterThan(0)
    expect(g.players[1].hand.length).toBeGreaterThan(0)

    const v = viewFor(g, 0) // what player 0's browser receives
    // opponent hand is placeholders only — no real ids
    expect(v.players[1].hand.every((x: string) => x === 'hidden')).toBe(true)
    // opponent hand/deck card OBJECTS (names) are absent from the cards map
    for (const id of g.players[1].hand) expect(v.cards[id]).toBeUndefined()
    for (const id of g.players[1].spellbook) expect(v.cards[id]).toBeUndefined()
    for (const id of g.players[1].atlas) expect(v.cards[id]).toBeUndefined()
    // decks are counts only — the ordered arrays are never sent (can't read/predict order)
    expect((v.players[1] as any).spellbook).toBeUndefined()
    expect((v.players[1] as any).atlas).toBeUndefined()
    expect(typeof v.players[1].spellbookCount).toBe('number')
    // opponent collection hidden; RNG seed stripped (future draws unpredictable)
    expect(v.players[1].collection).toEqual({})
    expect((v as any).seed).toBeUndefined()

    // ...but player 0 fully sees their OWN hand
    expect(v.players[0].hand).toEqual(g.players[0].hand)
    for (const id of g.players[0].hand) expect(v.cards[id]?.name).toBeTruthy()
  })
})

describe('Sites with a delayed one-time effect', () => {
  it('Dark Alley: the first minion to enter gains Stealth — via SUMMON too, once, even if flooded', () => {
    const g = board()
    const alley = placeSite(g, 0, 'Dark Alley', 1, 1)
    alley.flooded = true // the old code wrongly skipped granting when flooded
    const m1 = summonToken(g, 'Foot Soldier', 0, 1, 1)! // summoned onto the alley (not walked in)
    expect(m1.stealth).toBe(true)
    const m2 = summonToken(g, 'Foot Soldier', 0, 1, 1)! // second minion — one-time, no stealth
    expect(m2.stealth).toBeFalsy()
  })

  it('Darkest Dungeon: the next time an ally strikes an Avatar this turn, both are dragged here', () => {
    const g = board()
    const dungeon = placeSite(g, 0, 'Darkest Dungeon', 1, 1)
    placeSite(g, 0, 'Rustic Village', 2, 2) // the fight happens here
    getScript('Darkest Dungeon')!.genesis!(makeCtx(g, dungeon.id, 0, [])) // arm it (Genesis)
    const attacker = summonCard(g, 0, 'Foot Soldier', 2, 2)
    const av = avatarOf(g, 1)
    av.x = 2; av.y = 2; av.region = 'surface' // enemy avatar shares the square, so the ally can strike it
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: av.id } })
    let guard = 0
    while (g.prompts.length && guard++ < 20) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'stayInFight' ? true : p.kind === 'allocateDamage' ? { strikerId: p.data.strikerId, allocation: {} } : null)
    }
    // the delayed one-time effect fired: the avatar was dragged into the dungeon at (1,1)
    // (the 1/1 striker is dragged too, then dies to the avatar's simultaneous return strike)
    expect(avatarOf(g, 1).x).toBe(1)
    expect(avatarOf(g, 1).y).toBe(1)
    expect((g.flow as any).darkestDungeon).toBeFalsy() // consumed — one-time
  })
})

describe('"Enters here" site effects fire on SUMMON, not just movement (engine-wide)', () => {
  it("Old Mortimer's Den kills a minion SUMMONED onto it and returns to hand as Rubble", () => {
    const g = board()
    const den = placeSite(g, 0, "Old Mortimer's Den", 1, 1)
    const denCardId = den.cardId
    summonToken(g, 'Foot Soldier', 0, 1, 1) // summoned directly onto the Den (not walked in)
    expect(Object.values(g.units).some((u) => u.name === 'Foot Soldier')).toBe(false) // killed on entry
    expect(siteAt(g, 1, 1)?.isRubble).toBe(true) // left Rubble behind
    expect(g.players[0].hand).toContain(denCardId) // site returned to its owner's hand
  })
})

describe('Lookout: "Look at each opponent\'s hand"', () => {
  it('reveals the opponent hand face-up to the controller only, and only the cards seen', () => {
    const g = board()
    const a = injectToHand(g, 1, 'Foot Soldier')
    const b = injectToHand(g, 1, 'Fireball')
    const site = placeSite(g, 0, 'Lookout', 1, 1)
    getScript('Lookout')!.genesis!(makeCtx(g, site.id, 0, []))

    const me = viewFor(g, 0)
    expect(me.players[1].hand).toEqual(expect.arrayContaining([a, b]))
    expect(me.players[1].hand.includes('hidden')).toBe(false) // whole current hand seen
    expect(me.cards[a]?.name).toBe('Foot Soldier')
    expect(me.cards[b]?.name).toBe('Fireball')

    // a card the opponent draws AFTER the look stays hidden (you only saw what was there)
    const later = injectToHand(g, 1, 'Lightning Bolt')
    expect(viewFor(g, 0).players[1].hand.find((x: string) => x === later)).toBeUndefined()
    expect(viewFor(g, 0).cards[later]).toBeUndefined()

    // nobody else gains the info: a spectator and the opponent see p0/p1 hands hidden as usual
    expect(viewFor(g, null).players[1].hand.every((x: string) => x === 'hidden')).toBe(true)
    expect(viewFor(g, 1).players[0].hand.every((x: string) => x === 'hidden')).toBe(true)
  })
})

describe('FAQ: Abaddon Succubus', () => {
  it('a lured target already sharing the location still takes 2 and heals 2', () => {
    const g = board()
    const succubus = summonCard(g, 0, 'Abaddon Succubus', 2, 0)
    const prey = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    const lifeBefore = avatarOf(g, 0).life!
    avatarOf(g, 0).life = lifeBefore - 3 // leave healing room
    act(g, 0, { t: 'activate', sourceId: succubus.id, ability: 'lure', targets: [prey.id] })
    expect(g.units[prey.id]).toBeUndefined() // 2 damage kills the 1/1
    expect(avatarOf(g, 0).life).toBe(lifeBefore - 1)
  })
})

describe('FAQ: Angel Ascendant', () => {
  it('has +1 power and Airborne while warded, loses both when the ward breaks', () => {
    const g = board()
    const angel = summonCard(g, 0, 'Angel Ascendant', 2, 0)
    expect(effAttack(g, angel)).toBe(2)
    expect(effKeywords(g, angel).airborne).toBeFalsy()
    angel.ward = true
    expect(effAttack(g, angel)).toBe(3)
    expect(effKeywords(g, angel).airborne).toBe(true)
    // the ward eats a hit; bonuses fade with it
    dealDamageToUnit(g, angel, 1, 1)
    expect(angel.ward).toBeFalsy()
    expect(angel.damage).toBe(0)
    expect(effAttack(g, angel)).toBe(2)
  })

  it('strikes for 3 in a simultaneous fight (blows are computed before wards break)', () => {
    const g = board()
    const angel = summonCard(g, 0, 'Angel Ascendant', 2, 0)
    angel.ward = true
    const foe = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    foe.modifiers.push({ kind: 'power', amount: 2, duration: 'permanent', turn: 0, sourcePlayer: 1 })
    act(g, 0, { t: 'moveAttack', unitId: angel.id, path: [], attack: { unit: foe.id } })
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
    // warded angel struck for 3 → 3-toughness soldier dies; angel's ward broke
    // on the incoming strike, so it took no damage
    expect(g.units[foe.id]).toBeUndefined()
    expect(g.units[angel.id]?.damage).toBe(0)
    expect(g.units[angel.id]?.ward).toBeFalsy()
  })
})

describe('Silver Bullet: cast an Exceptional spell from your collection', () => {
  it('CASTS the fetched spell for real via the bearer — no token parked in hand', () => {
    const g = board()
    const bearer = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    const undead = summonCard(g, 0, 'Noxious Corpse', 3, 0) // nearby allied Undead — Necropotence's target
    giveArtifact(g, bearer, 'Silver Bullet')
    g.players[0].collection = { Necropotence: 1 }
    giveMana(g, 0, 5)
    waiveThreshold(g, 0)
    const basePow = effAttack(g, undead)
    const art = Object.values(g.artifacts).find((a) => a.name === 'Silver Bullet')!
    act(g, 0, { t: 'activate', sourceId: art.id, ability: 'fire' })
    expect(g.prompts[0]?.kind).toBe('nameCard')
    expect(g.prompts[0].data.names).toContain('Necropotence')
    answer(g, 'Necropotence')
    // it CASTS for real — Necropotence raises ITS OWN target prompt (a nearby Undead)
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    answer(g, [undead.id])
    expect(effAttack(g, undead)).toBe(basePow + 3) // the spell actually resolved
    // NOT parked as a loaded token in hand; no client-auto-open (offerCast) hack
    expect(g.players[0].hand.some((id) => g.cards[id].name === 'Necropotence')).toBe(false)
    expect((g.flow.offerCast ?? []).length).toBe(0)
    // collection copy spent, bullet sacrificed, bearer tapped
    expect(g.players[0].collection.Necropotence ?? 0).toBe(0)
    expect(g.artifacts[art.id]).toBeUndefined()
    expect(g.units[bearer.id].tapped).toBe(true)
  })

  it("won't offer a spell you can't pay for", () => {
    const g = board()
    const bearer = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    giveArtifact(g, bearer, 'Silver Bullet')
    g.players[0].collection = { Necropotence: 1 }
    g.players[0].mana = 0 // can't afford the (1) cost
    waiveThreshold(g, 0)
    const art = Object.values(g.artifacts).find((a) => a.name === 'Silver Bullet')!
    act(g, 0, { t: 'activate', sourceId: art.id, ability: 'fire' })
    // nothing to offer → no prompt, bullet not spent
    expect(g.prompts.length).toBe(0)
    expect(g.artifacts[art.id]).toBeDefined()
  })
})

describe('Summoning sickness', () => {
  it('lasts only through the summoning turn — the minion may tap to defend on the opponent\'s turn', () => {
    const g = board()
    const m = summonToken(g, 'Foot Soldier', 0, 2, 0)! // no Charge
    expect(canTap(g, m)).toBe(false) // sick the turn it entered
    g.turn += 1 // the opponent's turn begins (the turn counter advances each player-turn)
    expect(canTap(g, m)).toBe(true) // sickness is gone → it can tap to defend (rulebook:159)
  })
})

describe('Playing a site onto a voidwalk minion in the void', () => {
  it('lifts the void unit onto the surface, so a Frog gifted to it survives', () => {
    const g = board() // p0 controls sites at (2,0) and (3,0)
    const monitor = summonToken(g, 'Nommo Monitor', 0, 1, 0)! // Submerge, Voidwalk
    monitor.region = 'void' // sitting in the void at an empty square
    const siteCard = injectToHand(g, 0, 'Rustic Village')
    expect(playSite(g, 0, siteCard, 1, 0)).toBeNull() // legal: (1,0) is void, adjacent to (2,0)
    expect(g.units[monitor.id].region).toBe('surface') // placed atop the new site (no more void)
    // Gift of the Frog: a Frog (Submerge only) summoned to the monitor now lands on the
    // surface and is NOT insta-banished (before the fix it went into the void → banished)
    const frog = summonToken(g, 'Frog', 0, monitor.x, monitor.y, g.units[monitor.id].region)
    checkStateBased(g)
    expect(frog && g.units[frog.id]).toBeTruthy()
  })

  it('lifts a void unit whenever ANY site appears on its square (covers manual placements/moves)', () => {
    const g = board()
    const m = summonToken(g, 'Nommo Monitor', 0, 1, 0)!
    m.region = 'void'
    // simulate a site arriving by a non-playSite path (Frontier Settlers / Clay Golem / a site move)
    g.cards['ms_c'] = { id: 'ms_c', name: 'Rustic Village', owner: 0 }
    g.sites['ms'] = { id: 'ms', cardId: 'ms_c', name: 'Rustic Village', owner: 0, controller: 0, x: 1, y: 0, tapped: false, isRubble: false } as any
    checkStateBased(g)
    expect(g.units[m.id].region).toBe('surface') // state-based rule lifts it out of the now-impossible void
  })
})

describe('Polar Explorers: grants the top/bottom edge wrap to allies at its site', () => {
  it('an ally sharing the Explorers\' site can step between the top and bottom edges (not one elsewhere)', () => {
    const g = board() // controls a site at (2,0)
    // a landing site at the opposite edge of column 2
    g.cards['pe_s'] = { id: 'pe_s', name: 'Rustic Village', owner: 0 }
    g.sites['pe_site'] = { id: 'pe_site', cardId: 'pe_s', name: 'Rustic Village', owner: 0, controller: 0, x: 2, y: 3, tapped: false, isRubble: false } as any
    const explorers = summonToken(g, 'Polar Explorers', 0, 2, 0)!
    explorers.enteredTurn = -1
    const ally = summonToken(g, 'Foot Soldier', 0, 2, 0)! // shares the Explorers' site
    ally.enteredTurn = -1
    const wrap = { x: 2, y: 3, region: 'surface' as const }
    expect(isLegalStep(g, ally, { x: 2, y: 0, region: 'surface' }, wrap)).toBe(true)
    expect(reachableLocations(g, ally).some((s) => s.x === 2 && s.y === 3 && s.region === 'surface')).toBe(true)
    // an ally NOT at the Explorers' site gets no wrap
    const other = summonToken(g, 'Foot Soldier', 0, 3, 0)!
    other.enteredTurn = -1
    g.cards['o_s'] = { id: 'o_s', name: 'Rustic Village', owner: 0 }
    g.sites['o_site'] = { id: 'o_site', cardId: 'o_s', name: 'Rustic Village', owner: 0, controller: 0, x: 3, y: 3, tapped: false, isRubble: false } as any
    expect(isLegalStep(g, other, { x: 3, y: 0, region: 'surface' }, { x: 3, y: 3, region: 'surface' })).toBe(false)
  })
})

describe('Wall auras: placed on a border (site intersection)', () => {
  it('resolve to the chosen border directly when the side is supplied (edge-hotspot placement, no prompt)', () => {
    const g = board() // p0 controls a site at (2,0)
    const wall = injectToHand(g, 0, 'Wall of Air')
    giveMana(g, 0, 5)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: wall, casterId: avatarOf(g, 0).id, at: { x: 2, y: 0 }, extra: { wallSide: 'north' } })
    expect(g.prompts.length).toBe(0) // the border came from the click — no "which side?" prompt
    const aura = Object.values(g.auras).find((a: any) => a.name === 'Wall of Air') as any
    expect(aura).toBeTruthy()
    expect(aura.edge).toEqual({ a: { x: 2, y: 0 }, b: { x: 2, y: 1 } }) // north = y+1
  })
})

describe('Earthquake / site rearrange respects "can\'t be moved"', () => {
  it('Bedrock and a Bluecap Knockers site cannot be moved; normal sites can', () => {
    const g = board()
    const s1 = siteAt(g, 2, 0)!
    s1.name = 'Bedrock'
    g.cards[s1.cardId].name = 'Bedrock'
    expect(siteCantBeMoved(g, s1)).toBe(true) // Bedrock: immovableSite
    const s2 = siteAt(g, 3, 0)!
    expect(siteCantBeMoved(g, s2)).toBe(false)
    summonToken(g, 'Bluecap Knockers', 0, 3, 0) // its site is protected
    expect(siteCantBeMoved(g, s2)).toBe(true)
  })

  it('Earthquake rearranges movable sites via one permutation, never moving Bedrock', () => {
    const g = board() // sites at (2,0) and (3,0)
    const bed = siteAt(g, 2, 0)!
    bed.name = 'Bedrock'
    g.cards[bed.cardId].name = 'Bedrock'
    const A = siteAt(g, 3, 0)! // movable site A at (3,0)
    g.cards['qb'] = { id: 'qb', name: 'Rustic Village', owner: 0 } // movable site B at (2,1)
    g.sites['qsb'] = { id: 'qsb', cardId: 'qb', name: 'Rustic Village', owner: 0, controller: 0, x: 2, y: 1, tapped: false, isRubble: false } as any
    const B = g.sites['qsb']
    giveMana(g, 0, 5)
    waiveThreshold(g, 0)
    const quake = injectToHand(g, 0, 'Earthquake')
    act(g, 0, { t: 'castSpell', cardId: quake, casterId: avatarOf(g, 0).id })
    answer(g, { x: 2, y: 0 }) // pick the 2×2 area (2,0)Bedrock,(3,0)A,(2,1)B,(3,1)void
    // one permutation prompt, and Bedrock at (2,0) is NOT offered as movable
    const p = g.prompts[0] as any
    expect(p?.kind).toBe('sitePermutation')
    expect((p.data.movable as { x: number; y: number }[]).some((s) => s.x === 2 && s.y === 0)).toBe(false)
    // swap A(3,0) ↔ B(2,1); the immovable Bedrock and the void map to themselves
    answer(g, { placements: [
      { x: 2, y: 0, sx: 2, sy: 0 },
      { x: 3, y: 0, sx: 2, sy: 1 }, // (3,0) receives B
      { x: 2, y: 1, sx: 3, sy: 0 }, // (2,1) receives A
      { x: 3, y: 1, sx: 3, sy: 1 },
    ] })
    expect(siteAt(g, 3, 0)?.id).toBe(B.id)
    expect(siteAt(g, 2, 1)?.id).toBe(A.id)
    expect(siteAt(g, 2, 0)?.name).toBe('Bedrock') // Bedrock held its square
    expect(g.prompts.length).toBe(0)
  })

  it('Earthquake: a permutation that would strand Edge of the World is rejected wholesale (FAQ)', () => {
    const g = board()
    // 2×2 area (0,0): A at (0,0), Edge of the World at (1,0), B at (0,1), (1,1) void.
    const mk = (id: string, name: string, x: number, y: number) => {
      g.cards[id] = { id, name, owner: 0 } as any
      g.sites['s' + id] = { id: 's' + id, cardId: id, name, owner: 0, controller: 0, x, y, tapped: false, isRubble: false } as any
    }
    mk('eA', 'Rustic Village', 0, 0)
    mk('eW', 'Edge of the World', 1, 0) // legal start: neighbor (1,1) is void
    mk('eB', 'Rustic Village', 0, 1)
    giveMana(g, 0, 5)
    waiveThreshold(g, 0)
    const quake = injectToHand(g, 0, 'Earthquake')
    act(g, 0, { t: 'castSpell', cardId: quake, casterId: avatarOf(g, 0).id })
    answer(g, { x: 0, y: 0 }) // area (0,0)
    expect(g.prompts[0]?.kind).toBe('sitePermutation')
    // swap A(0,0) ↔ Edge(1,0): Edge lands at (0,0) whose neighbors (1,0),(0,1) are both sited → stranded
    answer(g, { placements: [
      { x: 0, y: 0, sx: 1, sy: 0 }, // (0,0) would receive Edge
      { x: 1, y: 0, sx: 0, sy: 0 }, // (1,0) would receive A
      { x: 0, y: 1, sx: 0, sy: 1 },
      { x: 1, y: 1, sx: 1, sy: 1 },
    ] })
    // the whole arrangement is rejected — everything stays put
    expect(siteAt(g, 0, 0)?.id).toBe('seA')
    expect(siteAt(g, 1, 0)?.id).toBe('seW')
    expect(g.log.some((l: any) => /rearranged|strand/i.test(l.msg ?? ''))).toBe(true)
    expect(g.prompts.length).toBe(0)
  })
})

describe('Bedrock: "can\'t be modified" (flood / silence)', () => {
  function bedrockBoard() {
    const g = board()
    const bed = siteAt(g, 2, 0)!
    bed.name = 'Bedrock'
    g.cards[bed.cardId].name = 'Bedrock'
    return { g, bed }
  }

  it('cannot be flooded; the wave still taps a non-submerge minion atop it', () => {
    const { g, bed } = bedrockBoard()
    summonToken(g, 'Bluecap Knockers', 0, 2, 0) // land dwarf, no submerge
    const dwarf = unitsAt(g, 2, 0, 'surface').find((u) => !u.isAvatar)!
    dwarf.tapped = false
    expect(siteCantBeModified(g, bed)).toBe(true)
    expect(applyFlood(g, bed, 1)).toBe(false) // opponent's flood washes off
    expect(bed.flooded).toBeFalsy()
    expect(dwarf.tapped).toBe(true) // knocked over by the wave (FAQ)
  })

  it('a normal site still floods (control)', () => {
    const g = board()
    const s = siteAt(g, 3, 0)!
    expect(applyFlood(g, s, 0)).toBe(true)
    expect(s.flooded).toBe(true)
  })

  it('cannot be silenced by a nearby silence source; a normal site can', () => {
    const { g } = bedrockBoard()
    const normal = siteAt(g, 3, 0)! // will be silenced as a control (nearby of the source)
    g.flow = { ...(g.flow ?? {}), siteSilences: [{ siteId: normal.id }] } as any
    // source silences its own nearby squares — (2,0) Bedrock and (2,1) are nearby (3,0)
    expect(siteSilenced(g, { x: 2, y: 0 })).toBe(false) // Bedrock is immune
    // move the source next to a normal site to prove the mechanism otherwise fires
    const other = siteAt(g, 2, 0)!
    other.name = 'Rustic Village'
    g.cards[other.cardId].name = 'Rustic Village'
    expect(siteSilenced(g, { x: 2, y: 0 })).toBe(true) // now a normal site there — silenced
  })
})

describe('Lucky Charm: bend random outcomes (stacking across bearers)', () => {
  // three enemy 1/1s share (2,0); Lightning Bolt hits a random one there
  function setup(charms: { x: number; y: number }[]) {
    const g = board()
    giveMana(g, 0, 5)
    waiveThreshold(g, 0)
    const victims = [summonToken(g, 'Foot Soldier', 1, 2, 0)!, summonToken(g, 'Foot Soldier', 1, 2, 0)!, summonToken(g, 'Foot Soldier', 1, 2, 0)!]
    for (const c of charms) {
      const bearer = summonToken(g, 'Foot Soldier', 0, c.x, c.y)!
      giveArtifact(g, bearer, 'Lucky Charm')
    }
    const bolt = injectToHand(g, 0, 'Lightning Bolt')
    act(g, 0, { t: 'castSpell', cardId: bolt, casterId: avatarOf(g, 0).id, targets: ['sq:2,0'] })
    return { g, victims }
  }

  it('no Lucky Charm → resolves randomly with NO prompt', () => {
    const { g, victims } = setup([])
    expect(g.prompts.length).toBe(0)
    expect(victims.filter((v) => !g.units[v.id]).length).toBe(1) // exactly one 1/1 died to the 3 damage
  })

  it('one Lucky Charm → choose from 2, and the chosen unit takes the hit', () => {
    const { g } = setup([{ x: 3, y: 0 }])
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    const opts = (g.prompts[0] as any).ctx.__opts as string[]
    expect(opts.length).toBe(2)
    answer(g, [0]) // pick the first candidate
    expect(g.units[opts[0]]).toBeUndefined() // it took 3 and died
    expect(g.units[opts[1]]).toBeDefined() // the other candidate untouched
  })

  it('two Lucky Charms on different units → choose from 3 (they stack)', () => {
    const { g } = setup([{ x: 3, y: 0 }, { x: 3, y: 1 }])
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    expect(((g.prompts[0] as any).ctx.__opts as string[]).length).toBe(3)
  })
})

describe('Deck reordering (full order, not approximated)', () => {
  it('Observatory: puts the top three spells back in the exact chosen order', () => {
    const g = board() // controls a site at (2,0)
    const [a, b, c] = g.players[0].spellbook.slice(0, 3)
    const obs = injectToHand(g, 0, 'Observatory')
    expect(playSite(g, 0, obs, 1, 0)).toBeNull() // genesis fires → orderCards prompt
    expect(g.prompts[0]?.kind).toBe('orderCards')
    answer(g, [2, 0, 1]) // C on top, then A, then B
    expect(g.players[0].spellbook.slice(0, 3)).toEqual([c, a, b])
  })

  it('Browse: bottoms the rest in the chosen order (last = very bottom, for Kelp Cavern)', () => {
    const g = board()
    const top7 = g.players[0].spellbook.slice(0, 7)
    const br = injectToHand(g, 0, 'Browse')
    giveMana(g, 0, 6)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: br, casterId: avatarOf(g, 0).id })
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    answer(g, [0]) // take the first revealed spell to hand
    expect(g.players[0].hand.includes(top7[0])).toBe(true)
    expect(g.prompts[0]?.kind).toBe('orderCards')
    const rem = top7.slice(1) // the six now being ordered (prompt indices 0..5)
    answer(g, [5, 4, 3, 2, 1, 0]) // reverse — so rem[0] ends up at the very bottom
    const sb = g.players[0].spellbook
    expect(sb[sb.length - 1]).toBe(rem[0]) // last picked sits at the absolute bottom
    expect(sb[sb.length - 6]).toBe(rem[5]) // first picked is the top of the bottomed batch
  })
})

describe('Overflow: played sites obey normal placement rules', () => {
  function castOverflow(g: GameState) {
    injectToHand(g, 0, 'Winter River') // a water site
    const overflow = injectToHand(g, 0, 'Overflow')
    giveMana(g, 0, 6)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: overflow, casterId: avatarOf(g, 0).id })
    answer(g, 'Winter River') // choose which water site to play
  }

  it('only offers squares adjacent to a site you control (not anywhere)', () => {
    const g = board() // p0 controls sites at (2,0) and (3,0)
    castOverflow(g)
    const sq = g.prompts[0]
    expect(sq.kind).toBe('chooseSquare')
    const legal = sq.data.squares as { x: number; y: number }[]
    expect(legal.length).toBeGreaterThan(0)
    expect(legal.some((s) => s.x === 0 && s.y === 3)).toBe(false) // a far square is illegal
    const adj = (s: { x: number; y: number }) =>
      Math.min(Math.abs(s.x - 2) + Math.abs(s.y - 0), Math.abs(s.x - 3) + Math.abs(s.y - 0)) === 1
    expect(legal.every(adj)).toBe(true)
  })

  it('rejects an illegal far square but places at a legal one', () => {
    const g = board()
    castOverflow(g)
    const legal = (g.prompts[0].data.squares as { x: number; y: number }[])[0]
    answer(g, { x: 0, y: 3 }) // illegal: far from any controlled site
    expect(Object.values(g.sites).some((s) => s.name === 'Winter River')).toBe(false)
    // a fresh cast placed at a legal square succeeds
    const g2 = board()
    castOverflow(g2)
    const spot = (g2.prompts[0].data.squares as { x: number; y: number }[])[0]
    answer(g2, spot)
    const wr = Object.values(g2.sites).find((s) => s.name === 'Winter River')
    expect(wr).toBeTruthy()
    expect(wr!.controller).toBe(0)
    expect(spot).toEqual({ x: legal.x, y: legal.y }) // (both boards identical) sanity
  })
})

describe('Submerged movement to enemy water sites', () => {
  it('a submerged minion can move underwater onto an adjacent enemy water site', () => {
    const g = board()
    const s1 = siteAt(g, 2, 0)!
    const s2 = siteAt(g, 3, 0)!
    s1.flooded = true // both become water
    s2.flooded = true
    s2.controller = 1 // the far one is the enemy's
    const frog = summonToken(g, 'Frog (Blue)', 0, 2, 0)! // 0/0 Submerge
    frog.region = 'underwater'
    frog.enteredTurn = -1
    const path = findPath(g, frog, { x: 3, y: 0, region: 'underwater' })
    expect(path).not.toBeNull()
    act(g, 0, { t: 'moveAttack', unitId: frog.id, path: path! })
    const moved = g.units[frog.id]
    expect(moved.x).toBe(3)
    expect(moved.region).toBe('underwater') // relocated underwater onto the enemy water site
  })
})

describe('Lacuna Entity: "weaker minion" Genesis target', () => {
  it('measures against the entering minion (not the summoning avatar), using the split-power average', () => {
    const g = board()
    const filter = (getScript('Lacuna Entity') as any).genesisTargets[0].filter
    const avatar = avatarOf(g, 0) // the caster passed at cast time (minion not on board yet)
    const weak = summonToken(g, 'Foot Soldier', 1, 3, 0)! // 1/1 → avg 1 < Lacuna 4/4 avg 4
    const equal = summonCard(g, 1, 'Phantasmal Shade', 3, 0) // 4/4 → avg 4, not < 4
    // filter(state, target, caster) — caster is the avatar; result must depend on Lacuna, not the avatar
    expect(filter(g, weak, avatar)).toBe(true)
    expect(filter(g, equal, avatar)).toBe(false)
  })
})

describe('Caster-locked spells (Morgana, Omphalos, Gabriel)', () => {
  it('are castable only while the bonded caster lives, then go to the cemetery when it leaves', () => {
    const g = board()
    const caster = summonToken(g, 'Foot Soldier', 0, 2, 0)! // stand-in for Morgana/an Omphalos
    giveMana(g, 0, 5)
    waiveThreshold(g, 0)
    const cardId = injectToHand(g, 0, 'Necropotence')
    g.flow = g.flow ?? {}
    g.flow.lockedCards = [{ cardId, casterId: caster.id, grantsCasting: true }]
    // ONLY the bonded caster may cast it — not the avatar, not any other unit
    expect(canCast(g, 0, cardId, caster.id).ok).toBe(true) // castable by its caster while it lives
    expect(canCast(g, 0, cardId, avatarOf(g, 0).id).ok).toBe(false) // the avatar is NOT its caster
    killUnit(g, caster.id) // the caster leaves the realm
    checkStateBased(g)
    expect(g.players[0].hand.includes(cardId)).toBe(false) // no longer a dead card in hand
    expect(g.players[0].cemetery.includes(cardId)).toBe(true) // discarded to the cemetery
    expect((g.flow.lockedCards ?? []).length).toBe(0) // lock cleaned up
  })

  it('Morgana transformed: her hand persists but she can only cast as a Spellcaster (FAQ)', () => {
    const g = board()
    const morgana = summonCard(g, 0, 'Morgana le Fay', 2, 0) // a Spellcaster
    giveMana(g, 0, 5)
    waiveThreshold(g, 0)
    const cardId = injectToHand(g, 0, 'Necropotence')
    g.flow = g.flow ?? {}
    g.flow.lockedCards = [{ cardId, casterId: morgana.id, grantsCasting: false }] // innate-caster lock
    // she is the only legal caster — the avatar can't stand in for an innate (Spellcaster) lock
    expect(canCast(g, 0, cardId, morgana.id).ok).toBe(true) // Morgana can cast her own spell
    expect(canCast(g, 0, cardId, avatarOf(g, 0).id).ok).toBe(false) // only she may cast it
    // transform her into a non-spellcaster form (a Frog!) — same unit, new name
    g.units[morgana.id].name = 'Foot Soldier'
    checkStateBased(g)
    expect(g.players[0].hand.includes(cardId)).toBe(true) // hand PERSISTS through transform
    expect(canCast(g, 0, cardId, morgana.id).ok).toBe(false) // but the new form can't cast spells
    g.units[morgana.id].name = 'Morgana le Fay' // becomes a Spellcaster again
    expect(canCast(g, 0, cardId, morgana.id).ok).toBe(true) // regains access to her hand
  })

  it('Omphalos (artifact lock): only the OMPHALOS itself (a spellcaster artifact) may cast', () => {
    const g = board()
    giveMana(g, 0, 5)
    waiveThreshold(g, 0)
    // a ground Omphalos artifact controlled by p0 — a spellcaster ARTIFACT, so it casts its own
    const artId = `atestomph${g.nextId++}`
    const artCard = `catestomph${g.nextId++}`
    g.cards[artCard] = { id: artCard, name: 'Char Omphalos', owner: 0 } as any
    g.artifacts[artId] = { id: artId, cardId: artCard, name: 'Char Omphalos', conjuredBy: 0, x: 2, y: 0, region: 'surface', tapped: false } as any
    // Char Omphalos = Air and Fire; its own cast must match an element (FAQ), so lock a Fire spell
    // (Necropotence is Earth) to keep this a pure caster-IDENTITY test.
    const cardId = injectToHand(g, 0, 'Fireball')
    g.flow = g.flow ?? {}
    g.flow.lockedCards = [{ cardId, casterId: artId, grantsCasting: false }]
    const other = summonToken(g, 'Foot Soldier', 0, 3, 0)! // another controlled unit
    expect(canCast(g, 0, cardId, artId).ok).toBe(true) // the Omphalos casts its own drawn spell
    expect(canCast(g, 0, cardId, avatarOf(g, 0).id).ok).toBe(false) // NOT the avatar — only it can cast
    expect(canCast(g, 0, cardId, other.id).ok).toBe(false) // and no other unit
  })
})

describe('The Malleus Maleficarum: cast a magic from your collection', () => {
  it('offers only collection magics you can pay for, then CASTS one for real at an enemy Spellcaster', () => {
    const g = board()
    const bearer = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    giveArtifact(g, bearer, 'The Malleus Maleficarum')
    g.players[0].collection = { 'Zap!': 1 } // a magic that can legally aim at a Spellcaster
    giveMana(g, 0, 5)
    waiveThreshold(g, 0)
    const enemyAv = avatarOf(g, 1)
    const baseLife = enemyAv.life!
    const art = Object.values(g.artifacts).find((a) => a.name === 'The Malleus Maleficarum')!
    act(g, 0, { t: 'activate', sourceId: art.id, ability: 'malleus' })
    expect(g.prompts[0]?.kind).toBe('nameCard')
    expect(g.prompts[0].data.names).toEqual(['Zap!']) // limited to the collection, not all magics
    answer(g, 'Zap!')
    // it CASTS for real — Zap! raises its target prompt; aim at the enemy avatar (a Spellcaster)
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    answer(g, [enemyAv.id])
    expect(enemyAv.life!).toBe(baseLife - 1) // Zap! resolved against the Spellcaster (malleusCast satisfied)
    // not parked as a loaded token in hand; no client-auto-open (offerCast) hack
    expect(g.players[0].hand.some((id) => g.cards[id].name === 'Zap!')).toBe(false)
    expect((g.flow.offerCast ?? []).length).toBe(0)
    expect(g.players[0].collection['Zap!'] ?? 0).toBe(0)
  })
})

describe('Rules: a 0-power strike still strikes', () => {
  // Rulebook: striking is an action whose result is damage equal to power (which
  // may be 0). "Interact" lists "strikes" and "deals damage" separately, so a
  // 0-power unit strikes (dealing 0) and fires strike/struck triggers. This is
  // what makes a 0/0 Frog trigger Interrogator when it hits the enemy Avatar.
  it('destroys Phantasmal Shade even when the attacker has 0 power', () => {
    const g = board()
    const attacker = summonToken(g, 'Foot Soldier', 0, 2, 0)! // 1/1
    attacker.enteredTurn = -1 // no summoning sickness
    attacker.modifiers.push({ kind: 'power', amount: -1, duration: 'permanent', turn: 0, sourcePlayer: 0 })
    expect(effAttack(g, attacker)).toBe(0)
    const shade = summonCard(g, 1, 'Phantasmal Shade', 2, 0)
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: shade.id } })
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
    // struck for 0 damage, but "when struck, destroy it" still fired
    expect(g.units[shade.id]).toBeUndefined()
  })
})

describe('FAQ: Amulet of Niniane', () => {
  it("magic can't target the bearer, but non-magic effects still can", () => {
    const g = board()
    const bearer = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    giveArtifact(g, bearer, 'Amulet of Niniane')
    avatarOf(g, 0).x = 2 // same region+row for targeting
    avatarOf(g, 0).y = 0
    waiveThreshold(g, 0)
    const err = castMagicFail(g, 0, 'Sleep', { targets: [bearer.id] })
    expect(err).toMatch(/can't be targeted by magic/i)
  })
})

describe('FAQ: Awakened Mummies', () => {
  it('must be summoned burrowed (underground), never to the surface', () => {
    const g = board()
    expect(validateSummonAt(g, 0, 'Awakened Mummies', { x: 2, y: 0, region: 'surface' })).toMatch(/underground/i)
    expect(validateSummonAt(g, 0, 'Awakened Mummies', { x: 2, y: 0, region: 'underground' })).toBeNull()
  })

  it('unburrow (when an enemy steps above) without tapping', () => {
    const g = board()
    const mummies = summonCard(g, 0, 'Awakened Mummies', 3, 0, 'underground')
    const intruder = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    intruder.enteredTurn = 0
    g.activePlayer = 1
    act(g, 1, { t: 'moveAttack', unitId: intruder.id, path: [{ x: 3, y: 0, region: 'surface' }] })
    expect(g.units[mummies.id]?.region).toBe('surface')
    expect(g.units[mummies.id]?.tapped).toBe(false)
  })
})

describe('FAQ: Abundance', () => {
  it('a site played into the aura provides one extra mana immediately', () => {
    const g = board()
    // aura anchored to cover (0,0)-(1,1)
    waiveThreshold(g, 0)
    const auraCard = injectToHand(g, 0, 'Abundance')
    giveMana(g, 0, 10)
    act(g, 0, { t: 'castSpell', cardId: auraCard, casterId: g.players[0].avatarUnitId, at: { x: 1, y: 0 } })
    const before = g.players[0].mana
    const site = fetchToHand(g, 0, 'Humble Village')
    avatarOf(g, 0).tapped = false
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: site, x: 1, y: 0 })
    if (g.prompts.length) answer(g, false)
    expect(g.players[0].mana).toBe(before + 2) // 1 base + 1 Abundance
  })
})

describe('FAQ: Army of the Dead', () => {
  it('leaves one Skeleton behind per departed location along a multi-step path', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 1, 0)
    const army = summonCard(g, 0, 'Army of the Dead', 3, 0)
    army.modifiers.push({ kind: 'keyword', keyword: 'movement +1', duration: 'permanent', turn: 0, sourcePlayer: 0 })
    act(g, 0, {
      t: 'moveAttack', unitId: army.id,
      path: [{ x: 2, y: 0, region: 'surface' }, { x: 1, y: 0, region: 'surface' }],
    })
    // skeletons left at (3,0) and (2,0), none at the destination
    expect(unitsAt(g, 3, 0).filter((u) => u.name === 'Skeleton')).toHaveLength(1)
    expect(unitsAt(g, 2, 0).filter((u) => u.name === 'Skeleton')).toHaveLength(1)
    expect(unitsAt(g, 1, 0).filter((u) => u.name === 'Skeleton')).toHaveLength(0)
  })
})

describe('FAQ: Battlemage', () => {
  it('killing two enemies in one fight draws two cards', () => {
    const g = board()
    const mage = summonCard(g, 0, 'Battlemage', 2, 0) // 3 power
    const f1 = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    const f2 = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    f1.enteredTurn = 0
    f2.enteredTurn = 0
    const handBefore = g.players[0].hand.length
    act(g, 0, { t: 'moveAttack', unitId: mage.id, path: [], attack: { unit: f1.id } })
    answer(g, [f2.id]) // defend with the second soldier
    answer(g, true) // target stays
    answer(g, { strikerId: mage.id, allocation: { [f1.id]: 1, [f2.id]: 2 } })
    // both died to one fight — two draw offers
    answer(g, true)
    answer(g, true)
    expect(g.units[f1.id]).toBeUndefined()
    expect(g.units[f2.id]).toBeUndefined()
    expect(g.players[0].hand.length).toBe(handBefore + 2)
  })
})

describe('FAQ: Coy Nixie beckon (Manhattan steps + agency)', () => {
  it('forces a diagonally-adjacent grounded enemy to step closer, offering the choice (not left in place)', () => {
    const g = board()
    for (const [x, y] of [[2, 1], [3, 2], [2, 2], [3, 1]] as const) placeSite(g, 0, 'Rustic Village', x, y)
    const nixie = summonCard(g, 0, 'Coy Nixie', 2, 1)
    const foe = summonCard(g, 1, 'Foot Soldier', 3, 2) // grounded, diagonally adjacent
    foe.enteredTurn = 0
    act(g, 0, { t: 'activate', sourceId: nixie.id, ability: 'beckon', targets: [foe.id] })
    // agency rule (maintainer ruling): the EFFECT's controller (seat 0, the Nixie's) picks the step,
    // not the opponent — unless a card explicitly hands the choice to the affected unit
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    expect(p?.player).toBe(0)
    expect((p!.data.squares as any[]).length).toBe(2) // both orthogonal steps get closer
    answer(g, { x: 2, y: 2 }) // seat 0 chooses one — and the enemy MUST move
    expect(g.units[foe.id].x).toBe(2)
    expect(g.units[foe.id].y).toBe(2)
    expect(g.units[foe.id].tapped).toBe(true)
  })
})

describe('FAQ: Fields of Phyxis silences a site on entry (no Genesis)', () => {
  it("a site played directly in front doesn't fire its Genesis; elsewhere it does", () => {
    // silenced in front → Valley of Delight's genesis (an element prompt) must not fire
    const g = board()
    placeSite(g, 0, 'Fields of Phyxis', 2, 1) // controller 0 → silences (2,2)
    const vid = injectToHand(g, 0, 'Valley of Delight')
    expect(playSite(g, 0, vid, 2, 2)).toBeNull()
    expect(g.prompts.length).toBe(0) // no element-choice prompt: genesis suppressed

    // control: the same site played NOT in front fires its genesis normally
    const g2 = board()
    placeSite(g2, 0, 'Fields of Phyxis', 2, 1)
    const vid2 = injectToHand(g2, 0, 'Valley of Delight')
    expect(playSite(g2, 0, vid2, 3, 1)).toBeNull()
    expect(g2.prompts.some((p) => p.kind === 'chooseOption')).toBe(true)
  })
})

describe('water sites are dynamic (Valley of Delight chosen as Water)', () => {
  it('counts as water only while it provides a water threshold; a submerged unit may enter', () => {
    const g = board()
    const valley = placeSite(g, 0, 'Valley of Delight', 3, 1)
    expect(isWaterSite(g, valley, getCard)).toBe(false) // no element chosen yet
    valley.counters = { ...valley.counters, delight: 3 } // choose Water
    expect(isWaterSite(g, valley, getCard)).toBe(true)
    valley.counters = { ...valley.counters, delight: 1 } // choose Earth → land again
    expect(isWaterSite(g, valley, getCard)).toBe(false)
    // a submerged Pufferfish one square away may step underwater into the Valley
    // ONLY while it is water — the check is dynamic per the current threshold
    valley.counters = { ...valley.counters, delight: 3 }
    const puff = summonCard(g, 0, 'Porcupine Pufferfish', 2, 1, 'underwater')
    const from = { x: 2, y: 1, region: 'underwater' as const }
    const to = { x: 3, y: 1, region: 'underwater' as const }
    expect(isLegalStep(g, puff, from, to)).toBe(true)
    valley.counters = { ...valley.counters, delight: 1 } // dry it out
    expect(isLegalStep(g, puff, from, to)).toBe(false)
  })
})

describe('Codex: Burrowing + Submerge can cross underground ↔ underwater in one step', () => {
  it('a dual-keyword minion steps directly between an adjacent land subsurface and water subsurface', () => {
    const g = board()
    placeSite(g, 0, 'Blessed Village', 2, 1) // land site (underground exists here)
    placeSite(g, 0, 'Bog', 3, 1) // water site (underwater exists here), orthogonally adjacent
    // Putrid Presence has BOTH Burrowing and Submerge
    const pp = summonCard(g, 0, 'Putrid Presence', 2, 1, 'underground')
    const under = { x: 2, y: 1, region: 'underground' as const }
    const water = { x: 3, y: 1, region: 'underwater' as const }
    expect(isLegalStep(g, pp, under, water)).toBe(true) // underground → underwater
    expect(isLegalStep(g, pp, water, under)).toBe(true) // underwater → underground

    // negative controls: a single-keyword minion cannot make the crossing
    const troll = summonCard(g, 0, 'Cave Trolls', 2, 1, 'underground') // Burrowing only
    expect(isLegalStep(g, troll, under, water)).toBe(false)
    const drowned = summonCard(g, 0, 'Drowned', 3, 1, 'underwater') // Submerge only
    expect(isLegalStep(g, drowned, water, under)).toBe(false)
  })
})

describe('Flooding a burrowed unit: the subsurface relabels underground → underwater', () => {
  it('a burrowed unit that ALSO has Submerge survives (becomes submerged); one without drowns', () => {
    const g = board()
    const land = placeSite(g, 0, 'Blessed Village', 2, 1) // a land site — underground exists here
    // Putrid Presence has BOTH Burrowing and Submerge; Cave Trolls has Burrowing only
    const dual = summonCard(g, 0, 'Putrid Presence', 2, 1, 'underground')
    const solo = summonCard(g, 0, 'Cave Trolls', 2, 1, 'underground')
    expect(dual.region).toBe('underground')
    expect(solo.region).toBe('underground')

    // Flood the site: its subsurface is now underwater, not underground.
    expect(applyFlood(g, land, 0)).toBe(true)
    checkStateBased(g)

    // the dual-keyword minion is now SUBMERGED (still in the realm), not dead
    expect(g.units[dual.id]).toBeTruthy()
    expect(g.units[dual.id].region).toBe('underwater')
    // the Burrowing-only minion drowns — it cannot exist in the flooded subsurface
    expect(g.units[solo.id]).toBeFalsy()
  })
})

describe('FAQ: Immobile (Pudge Butcher)', () => {
  it('an Immobile unit cannot move to defend (its errata keyword must still apply)', () => {
    const g = board()
    const attacker = summonCard(g, 0, 'Battlemage', 2, 0)
    const victim = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    victim.enteredTurn = 0
    // Pudge and a plain soldier both sit one square away at (3,0): the soldier
    // can walk in to defend, Pudge (Immobile) cannot.
    const pudge = summonCard(g, 1, 'Pudge Butcher', 3, 0)
    const mover = summonToken(g, 'Foot Soldier', 1, 3, 0)!
    mover.enteredTurn = 0
    expect(effKeywords(g, pudge).immobile).toBe(true)
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: victim.id } })
    const prompt = g.prompts[0]
    expect(prompt?.kind).toBe('defend')
    const candidates = (prompt!.data as any).candidates as string[]
    expect(candidates).toContain(mover.id) // reachable → offered (setup is valid)
    expect(candidates).not.toContain(pudge.id) // immobile → not offered
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
  })
})

describe('Stealth: a Stealth minion’s attack cannot be defended (rulebook: Stealth)', () => {
  it('opens NO defend window when the attacker has Stealth, and drops Stealth after attacking', () => {
    const g = board()
    const attacker = summonCard(g, 0, 'Battlemage', 2, 0)
    attacker.stealth = true
    const victim = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    victim.enteredTurn = 0
    // a ready would-be defender sits right on the target square — it could defend a
    // non-Stealth attacker, so its absence from any window proves the Stealth rule.
    const guard = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    guard.enteredTurn = 0
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: victim.id } })
    // the fight resolved straight through — the defender's controller was never asked
    expect(g.prompts.some((p) => p.kind === 'defend')).toBe(false)
    expect(attacker.stealth).toBe(false) // the attack was the interaction that spent Stealth
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
  })

  it('the undefended fight still strikes the attacker — Stealth is spent, so it can be struck back', () => {
    const g = board()
    // stealth attacker (1/1) vs an enemy 1/1 on the same square
    const attacker = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    attacker.enteredTurn = 0
    attacker.stealth = true
    const target = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    target.enteredTurn = 0
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: target.id } })
    expect(g.prompts.some((p) => p.kind === 'defend')).toBe(false) // couldn't be defended
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : g.prompts[0].kind === 'stayInFight' ? true : g.prompts[0].kind === 'allocateDamage' ? { strikerId: (g.prompts[0].data as any).strikerId, allocation: {} } : true)
    checkStateBased(g)
    // both 1/1s struck each other: the target died AND so did the ex-Stealth attacker
    expect(g.units[target.id]).toBeUndefined()
    expect(g.units[attacker.id]).toBeUndefined() // struck back — Stealth gave no combat immunity
  })

  it('a non-Stealth attacker in the same spot DOES open a defend window (control)', () => {
    const g = board()
    const attacker = summonCard(g, 0, 'Battlemage', 2, 0)
    const victim = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    victim.enteredTurn = 0
    const guard = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    guard.enteredTurn = 0
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: victim.id } })
    expect(g.prompts[0]?.kind).toBe('defend')
    expect((g.prompts[0]!.data as any).candidates).toContain(guard.id)
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
  })
})

describe('Strike-first attacker that kills its target does not crash the fight', () => {
  it('resolves cleanly when a strike-first minion fells its target in the first pass', () => {
    const g = board()
    // Albespine Pikemen strikes first while attacking; a co-located 1/1 dies to the
    // first strike, so the normal pass finds a dead target — must not deref it.
    const atk = summonToken(g, 'Albespine Pikemen', 0, 2, 0)!; atk.enteredTurn = 0
    const target = summonToken(g, 'Foot Soldier', 1, 2, 0)!; target.enteredTurn = 0
    act(g, 0, { t: 'moveAttack', unitId: atk.id, path: [], attack: { unit: target.id } })
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : g.prompts[0].kind === 'allocateDamage' ? { strikerId: (g.prompts[0].data as any).strikerId, allocation: {} } : true)
    expect(g.units[target.id]).toBeUndefined() // struck first → dead
    expect(g.units[atk.id]).toBeTruthy() // attacker unscathed (target never struck back)
  })
})

describe('The four Promotional Courts', () => {
  function court(g: GameState, name: string, x: number, y: number, controller = 0): string {
    const cid = `csite${(g as any).nextId++}`
    ;(g.cards as any)[cid] = { id: cid, name, owner: controller }
    const id = `crt${(g as any).nextId++}`
    ;(g.sites as any)[id] = { id, cardId: cid, name, owner: controller, controller, x, y, tapped: false, isRubble: false }
    return id
  }
  const ordinary = allCards.find((c) => c.type === 'Minion' && c.rarity === 'Ordinary' && c.cost != null)!.name
  const exceptional = allCards.find((c) => c.type === 'Minion' && c.rarity === 'Exceptional' && c.cost != null)!.name
  const elite = allCards.find((c) => (c.type === 'Magic' || c.type === 'Minion') && c.rarity === 'Elite' && c.cost != null)!.name
  const unique = allCards.find((c) => (c.type === 'Magic' || c.type === 'Minion') && c.rarity === 'Unique' && c.cost != null)!.name

  it('Mock Court: +1 to cast Ordinary minions; effect-summoned tokens pay 1 EACH (per token)', () => {
    const g = board()
    court(g, 'Mock Court', 0, 0)
    const av = avatarOf(g, 0)
    expect(effectiveCost(g, 0, ordinary, av)).toBe((getCard(ordinary).cost ?? 0) + 1)
    expect(effectiveCost(g, 0, exceptional, av)).toBe(getCard(exceptional).cost ?? 0) // non-Ordinary untaxed
    // three ordinary tokens summoned by effects onto p0 sites → 1 mana each. The tax is batched
    // and settled by reconcileSummonTax (called from applyAction after an action resolves); with
    // 5 mana all three are affordable, so all are paid for (mandatory) and none is refused.
    g.players[0].mana = 5
    summonToken(g, 'Foot Soldier', 0, 2, 0)
    summonToken(g, 'Frog', 0, 2, 1)
    summonToken(g, 'Skeleton', 0, 3, 1)
    reconcileSummonTax(g)
    expect(g.players[0].mana).toBe(2)
    expect(g.prompts.length, 'affordable → no choice prompt').toBe(0)
  })

  it('Court of Equity: Elite spells cost +1, Uniques +2', () => {
    const g = board()
    court(g, 'Court of Equity', 0, 0)
    const av = avatarOf(g, 0)
    expect(effectiveCost(g, 0, elite, av)).toBe((getCard(elite).cost ?? 0) + 1)
    expect(effectiveCost(g, 0, unique, av)).toBe((getCard(unique).cost ?? 0) + 2)
  })

  it('Mobbed Court: casting an Elite spell costs the caster 1 life, a Unique 2', () => {
    const g = board()
    const id = court(g, 'Mobbed Court', 0, 0)
    const before = avatarOf(g, 0).life
    getScript('Mobbed Court')!.onSpellCast!(makeCtx(g, id, 0, []), 0, elite)
    expect(avatarOf(g, 0).life).toBe((before ?? 0) - 1)
    getScript('Mobbed Court')!.onSpellCast!(makeCtx(g, id, 0, []), 0, unique)
    expect(avatarOf(g, 0).life).toBe((before ?? 0) - 3)
  })

  it('Overflowing Court: its Genesis disables the other Courts (until your next turn)', () => {
    const g = board()
    court(g, 'Mock Court', 0, 0)
    const over = court(g, 'Overflowing Court', 0, 1)
    const av = avatarOf(g, 0)
    const base = getCard(ordinary).cost ?? 0
    expect(effectiveCost(g, 0, ordinary, av)).toBe(base + 1) // Mock Court on
    getScript('Overflowing Court')!.genesis!(makeCtx(g, over, 0, []))
    expect(effectiveCost(g, 0, ordinary, av)).toBe(base) // Mock Court disabled
  })
})

describe('Harbinger: opt-in portent discount + affordability', () => {
  // a vanilla-ish minion (no genesis / targets / cost quirks) so the only cast prompt
  // is Harbinger's own, and cost math is clean.
  const minion = allCards.find((c) => c.type === 'Minion' && (c.cost ?? 0) >= 2 && (c.cost ?? 0) <= 5
    && !getScript(c.name)?.genesis && !getScript(c.name)?.genesisTargets && !getScript(c.name)?.oversized
    && !getScript(c.name)?.casterFilter && !getScript(c.name)?.selfCostModifier)!.name
  const mCost = getCard(minion).cost ?? 0
  function harbinger(g: GameState, sq: { x: number; y: number }): void {
    avatarOf(g, 0).name = 'Harbinger'
    g.flow = g.flow ?? {}
    ;(g.flow as any).harbinger = { 0: [sq] }
    waiveThreshold(g, 0)
  }

  it('a minion costing mana+1 is NOT blocked — the portent (−1) makes it castable', () => {
    const g = board()
    harbinger(g, { x: 0, y: 0 }) // a VOID portent square (not a site)
    const cardId = injectToHand(g, 0, minion)
    g.players[0].mana = mCost - 1 // exactly one short of full price
    expect(canCast(g, 0, cardId, avatarOf(g, 0).id).ok).toBe(true)
  })

  it('casting onto a NORMALLY-castable portent prompts to spend the power; DECLINE pays full & keeps it', () => {
    const g = board()
    harbinger(g, { x: 0, y: 0 })
    placeSite(g, 0, 'Rustic Village', 0, 0) // the portent ALSO has a friendly site → could cast here plainly, so the power is OPTIONAL
    g.players[0].mana = mCost + 3
    const cardId = injectToHand(g, 0, minion)
    act(g, 0, { t: 'castSpell', cardId, casterId: avatarOf(g, 0).id, at: { x: 0, y: 0, region: 'surface' } })
    expect(g.players[0].mana).toBe(4) // paid the discounted cost-1
    expect(g.prompts[0]?.kind).toBe('yesNo')
    answer(g, false) // decline → pay the 1 back (full price), power stays available
    expect(g.players[0].mana).toBe(3)
    expect((g.flow as any).harbingerUsed?.[0]).not.toBe(g.turn)
  })

  it('ACCEPT spends the once-per-turn power (and keeps the discount)', () => {
    const g = board()
    harbinger(g, { x: 0, y: 0 })
    placeSite(g, 0, 'Rustic Village', 0, 0)
    g.players[0].mana = mCost + 3
    const cardId = injectToHand(g, 0, minion)
    act(g, 0, { t: 'castSpell', cardId, casterId: avatarOf(g, 0).id, at: { x: 0, y: 0, region: 'surface' } })
    answer(g, true)
    expect(g.players[0].mana).toBe(4) // kept the discount
    expect((g.flow as any).harbingerUsed?.[0]).toBe(g.turn)
  })

  it('a VOID portent (castable ONLY via the power) spends it AUTOMATICALLY — no prompt', () => {
    const g = board()
    harbinger(g, { x: 0, y: 0 }) // (0,0) is void ground — no friendly site, so the ONLY way to cast here is the power
    g.players[0].mana = mCost + 3
    const cardId = injectToHand(g, 0, minion)
    act(g, 0, { t: 'castSpell', cardId, casterId: avatarOf(g, 0).id, at: { x: 0, y: 0, region: 'surface' } })
    expect(g.prompts.some((p) => p.kind === 'yesNo')).toBe(false) // no opt-out — the grant is what enabled the cast
    expect(g.players[0].mana).toBe(4) // discounted cost-1 paid, no refund of the 1
    expect((g.flow as any).harbingerUsed?.[0]).toBe(g.turn) // power spent
  })

  it('when only affordable WITH the discount, it is forced — no prompt', () => {
    const g = board()
    harbinger(g, { x: 0, y: 0 })
    g.players[0].mana = mCost - 1 // can only afford at the discounted price
    const cardId = injectToHand(g, 0, minion)
    act(g, 0, { t: 'castSpell', cardId, casterId: avatarOf(g, 0).id, at: { x: 0, y: 0, region: 'surface' } })
    expect(g.players[0].mana).toBe(0)
    expect(g.prompts.some((p) => p.kind === 'yesNo')).toBe(false)
    expect((g.flow as any).harbingerUsed?.[0]).toBe(g.turn)
  })
})

describe('Snowball: the packed-unit count is not inflated', () => {
  it('counts each packed unit ONCE (rolling a unit onto the stop square does not double-count it)', () => {
    const g = board()
    const av = avatarOf(g, 0)
    av.x = 0; av.y = 1 // clear middle row (avatars sit on rows 0 and 3), roll east across the realm
    // the snowball is a projectile → it only travels over SITES (it stops at the void),
    // so lay a contiguous row of sites for it to roll along
    for (let x = 1; x <= 4; x++) placeSite(g, 0, 'Rustic Village', x, 1)
    summonCard(g, 1, 'Foot Soldier', 1, 1) // picked up mid-path and rolled to the stop square
    summonCard(g, 1, 'Foot Soldier', 4, 1) // already sitting on the stop square (x=GRID_W-1)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Snowball')
    answer(g, 'e') // roll east
    const line = [...g.log].reverse().find((e) => e.msg.includes('snowball'))?.msg ?? ''
    expect(line).toMatch(/\b2 units packed\b/) // exactly 2 — the old bug re-counted the rolled unit as 3
  })
})

describe('The standard "Tap → Play or draw a site" avatar action is per-card', () => {
  function beAvatar(g: GameState, name: string) {
    const av = avatarOf(g, 0)
    av.name = name
    g.cards[av.cardId].name = name
    av.tapped = false
  }
  it('Pathfinder has NO standard site action (it plays via its own topmost-site tap)', () => {
    const g = board()
    beAvatar(g, 'Pathfinder')
    expect(actFail(g, 0, { t: 'avatarSite', mode: 'draw' })).toMatch(/own ability|plays sites/i)
  })
  it('Seer — like other avatars that print it — draws a site with the standard action', () => {
    const g = board()
    beAvatar(g, 'Seer')
    const before = g.players[0].hand.length
    act(g, 0, { t: 'avatarSite', mode: 'draw' })
    expect(g.players[0].hand.length).toBe(before + 1)
    expect(avatarOf(g, 0).tapped).toBe(true)
  })

  // The Seer's peek exists to inform the draw: you look at the top card and may
  // bury it BEFORE you decide what to draw. So the keep/bottom decision must fully
  // resolve before the draw step — the FIFO prompt queue used to interleave the
  // draw ahead of the keep/bottom choice (turn steps are now parked behind it).
  it('Seer sees the card and chooses keep/bottom BEFORE the draw step begins', () => {
    const g = board()
    beAvatar(g, 'Seer')
    const topId = g.players[0].spellbook[0]
    const topName = g.cards[topId].name
    const handBefore = g.players[0].hand.length

    beginTurn(g, 0) // turn ≥ 2 here, so the draw is not the first-turn skip

    // the FIRST prompt is the Seer's peek — NOT the draw
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    expect(g.prompts[0]?.title).toMatch(/gaze/i)
    answer(g, 'peek at topmost spell')

    // the keep/bottom prompt shows the actual peeked card, and no draw has happened
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    expect((g.prompts[0] as any).data.reveal).toBe(topName)
    expect(g.players[0].hand.length).toBe(handBefore)
    answer(g, 'put on bottom')

    // ONLY NOW does the draw step appear
    expect(g.prompts[0]?.kind).toBe('drawDeck')
    answer(g, 'spellbook')

    // the buried card went to the bottom, so it was not the card drawn
    expect(g.players[0].hand.length).toBe(handBefore + 1)
    expect(g.players[0].hand).not.toContain(topId)
    expect(g.players[0].spellbook[g.players[0].spellbook.length - 1]).toBe(topId)
  })
})

describe('Belly, carrying, ward-loss, and the Rolling Boulder', () => {
  function swallow(g: GameState) {
    const frog = summonCard(g, 0, 'Brobdingnag Bullfrog', 2, 0); frog.enteredTurn = -1
    const meal = summonCard(g, 1, 'Foot Soldier', 2, 0)
    meal.carriedBy = frog.id; frog.carryingUnits = [meal.id]
    return { frog, meal }
  }

  it('Brobdingnag Bullfrog cannot voluntarily set down its swallowed minion', () => {
    const g = board()
    const { frog, meal } = swallow(g)
    expect(actFail(g, 0, { t: 'drop', unitId: frog.id, artifactIds: [], unitIds: [meal.id] })).toMatch(/release|carr/i)
    expect(g.units[meal.id].carriedBy).toBe(frog.id)
  })

  it('a swallowed minion is in the belly — it can be neither attacked nor shot', () => {
    const g = board()
    const { meal } = swallow(g)
    const atkr = summonCard(g, 0, 'Foot Soldier', 2, 0); atkr.enteredTurn = -1
    expect(beginAttack(g, atkr, { unit: meal.id })).toMatch(/swallowed/i)
    expect(projectileCanHit(g, g.units[meal.id])).toBe(false)
  })

  it('a warded minion loses its ward when it becomes disabled', () => {
    const g = board()
    const u = summonCard(g, 0, 'Foot Soldier', 2, 0)
    wardUnit(g, u); expect(g.units[u.id].ward).toBe(true)
    g.units[u.id].disabled = true
    checkStateBased(g)
    expect(g.units[u.id].ward).toBeFalsy()
  })

  it('a warded minion loses its ward when it becomes silenced', () => {
    const g = board()
    const u = summonCard(g, 0, 'Foot Soldier', 2, 0)
    wardUnit(g, u)
    g.units[u.id].silenced = true
    checkStateBased(g)
    expect(g.units[u.id].ward).toBeFalsy()
  })

  it('a warded site loses its ward when it is rubbled', () => {
    const g = board()
    const s = siteAt(g, 2, 0)!
    ;(s as any).ward = true; s.isRubble = true
    checkStateBased(g)
    expect((g.sites[s.id] as any).ward).toBeFalsy()
  })

  it('Rolling Boulder crushes an enemy sharing its own site when pushed', () => {
    const g = board() // p0 sites at (2,0),(3,0); (1,0) is void
    g.cards['rbc'] = { id: 'rbc', name: 'Rolling Boulder', owner: 0 } as any
    g.artifacts['rb'] = { id: 'rb', cardId: 'rbc', name: 'Rolling Boulder', conjuredBy: 0, x: 2, y: 0, region: 'surface', carriedBy: null, tapped: false } as any
    const pusher = summonCard(g, 0, 'Foot Soldier', 2, 0); pusher.enteredTurn = -1
    const enemy = summonCard(g, 1, 'Foot Soldier', 2, 0)
    ;(getScript('Rolling Boulder') as any).conts.roll(makeCtx(g, pusher.id, 0, []), {}, 'w') // roll into the void → only the start square is crushed
    expect(g.units[enemy.id]).toBeUndefined() // crushed on the Boulder's own site
    expect(g.units[pusher.id]).toBeDefined() // the pusher is spared
  })

  it('Cave-In on a warded ENEMY site breaks the ward and does not burrow', () => {
    const g = board()
    g.cards['wsc'] = { id: 'wsc', name: 'Rustic Village', owner: 1 } as any
    g.sites['sward'] = { id: 'sward', cardId: 'wsc', name: 'Rustic Village', owner: 1, controller: 1, x: 2, y: 1, tapped: false, isRubble: false, ward: true } as any
    const foe = summonCard(g, 1, 'Foot Soldier', 2, 1)
    waiveThreshold(g, 0)
    const cave = injectToHand(g, 0, 'Cave-In'); giveMana(g, 0, 10)
    act(g, 0, { t: 'castSpell', cardId: cave, casterId: avatarOf(g, 0).id, targets: ['sward'] })
    expect((g.sites['sward'] as any).ward).toBeFalsy() // the ward broke…
    expect(g.units[foe.id]?.region).toBe('surface') // …so the burrow was prevented
  })

  it('Cave-In drags a burrowed minion\'s carried artifact underground with it', () => {
    const g = board()
    g.cards['csc'] = { id: 'csc', name: 'Rustic Village', owner: 1 } as any
    g.sites['scv'] = { id: 'scv', cardId: 'csc', name: 'Rustic Village', owner: 1, controller: 1, x: 2, y: 1, tapped: false, isRubble: false } as any
    const carrier = summonCard(g, 1, 'Barrow Wight', 2, 1) // Burrowing — survives underground
    const art = giveArtifact(g, carrier, 'Sword of Meas')
    waiveThreshold(g, 0)
    const cave = injectToHand(g, 0, 'Cave-In'); giveMana(g, 0, 10)
    act(g, 0, { t: 'castSpell', cardId: cave, casterId: avatarOf(g, 0).id, targets: ['scv'] })
    expect(g.units[carrier.id]?.region).toBe('underground')
    expect(g.artifacts[art.id]?.region).toBe('underground') // the carried artifact rode down with it
  })
})

describe('Projectiles stop at the void (a siteless square is a different region)', () => {
  it('Heat Ray cannot cross a void gap to hit a unit beyond it', () => {
    const g = board()
    const av = avatarOf(g, 0)
    av.x = 0; av.y = 1
    placeSite(g, 0, 'Rustic Village', 1, 1)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    // (3,1) is deliberately left VOID (no site) — a gap in the surface region
    placeSite(g, 0, 'Rustic Village', 4, 1)
    const near = summonCard(g, 1, 'Foot Soldier', 2, 1) // before the void → hit
    const far = summonCard(g, 1, 'Foot Soldier', 4, 1) // beyond the void → must be untouched
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Heat Ray', { extra: { direction: 'e' } })
    expect(g.units[near.id]).toBeUndefined() // took 2 → the Foot Soldier died
    expect(g.units[far.id]).toBeTruthy() // the projectile stopped at the void (3,1)…
    expect(g.units[far.id]?.damage ?? 0).toBe(0) // …so it never reached (4,1)
  })
})

describe('Panpipes of Pnom boosts a nearby unit’s damage — to sites as well as units', () => {
  it('a 1-power ally striking an enemy site nearby the Panpipes deals 2 (life loss)', () => {
    const g = board()
    const striker = summonCard(g, 0, 'Foot Soldier', 1, 1); striker.enteredTurn = -1
    giveArtifact(g, striker, 'Panpipes of Pnom') // rides the striker → it is "nearby"
    const enemySite = placeSite(g, 1, 'Rustic Village', 4, 3)
    const before = avatarOf(g, 1).life ?? 0
    strikeSite(g, striker.id, enemySite.id)
    // 1 power → Panpipes raises it to 2 → the site's controller loses 2 life
    expect((avatarOf(g, 1).life ?? 0)).toBe(before - 2)
  })
})

describe('Corpse Catapult: the player chooses BOTH the ally and the corpse (either cemetery)', () => {
  function deadMinion(g: GameState, player: 0 | 1, name: string): string {
    const id = `cmtest${g.nextId++}`
    g.cards[id] = { id, name, owner: player }
    g.players[player].cemetery.push(id)
    return id
  }
  it('prompts for the helper ally, then the corpse (both cemeteries listed), then flings it', () => {
    const g = board()
    const bearer = summonCard(g, 0, 'Foot Soldier', 1, 1); bearer.enteredTurn = -1
    const ally1 = summonCard(g, 0, 'Foot Soldier', 1, 1)
    const ally2 = summonCard(g, 0, 'Foot Soldier', 1, 1)
    const cat = giveArtifact(g, bearer, 'Corpse Catapult')
    deadMinion(g, 0, 'Bosk Troll') // my corpse (power 3)
    const theirs = deadMinion(g, 1, 'Guile Sirens') // opponent's corpse (power 3) — must be selectable
    const victim = summonCard(g, 1, 'Foot Soldier', 1, 2) // at the target square, 1 step away

    act(g, 0, { t: 'activate', sourceId: cat.id, ability: 'fling', targets: ['sq:1,2,surface'] })

    // 1) pick which ally helps
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    expect([...(g.prompts[0] as any).data.candidates].sort()).toEqual([ally1.id, ally2.id].sort())
    answer(g, [ally2.id])

    // 2) pick the corpse — BOTH cemeteries are offered
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    const names = (g.prompts[0] as any).data.cards as string[]
    expect(names).toContain('Bosk Troll')
    expect(names).toContain('Guile Sirens')
    answer(g, [names.indexOf('Guile Sirens')]) // fling the opponent's corpse (power 3)

    expect(bearer.tapped).toBe(true)
    expect(g.units[ally2.id].tapped).toBe(true)
    expect(g.units[ally1.id].tapped).toBe(false) // the unchosen ally is untouched
    expect(g.units[victim.id]).toBeUndefined() // took 3 → the Foot Soldier died
    expect(g.players[1].banished).toContain(theirs) // banished from the opponent's cemetery
  })
})

describe('Altar of Malachai: sacrifice a minion atop it instead of dying', () => {
  function setup() {
    const g = board()
    const altar = placeSite(g, 0, 'Altar of Malachai', 1, 3) // p0's Altar
    const offering = summonCard(g, 0, 'Foot Soldier', 1, 3) // a minion ATOP the Altar
    const av = avatarOf(g, 0)
    av.deathsDoor = true; av.doorTurn = -1; av.life = 0 // at death's door, not this-turn-immune
    // the Avatar is NOT on the Altar (it sits wherever board() left it)
    return { g, altar, offering, av }
  }

  it('a death blow prompts; sacrificing a minion averts it (Avatar need not be on the Altar)', () => {
    const { g, altar, offering, av } = setup()
    dealDamageToUnit(g, av, 1, 1)
    expect((g.phase as string)).not.toBe('over') // a choice is offered, not instant death
    expect(g.prompts[0]?.kind).toBe('yesNo')
    answer(g, true) // one offering → sacrificed directly

    expect(g.units[offering.id]).toBeUndefined() // the minion died
    expect(g.players[0].cemetery).toContain(offering.cardId) // a real death → cemetery (Deathrites fire)
    expect((g.sites[altar.id] as any).altarUsed).toBe(true) // once per game
    expect((g.phase as string)).not.toBe('over') // the Avatar lives
    expect(g.winner).toBeNull()
  })

  it('declining the sacrifice lets the Avatar die', () => {
    const { g, av } = setup()
    dealDamageToUnit(g, av, 1, 1)
    expect(g.prompts[0]?.kind).toBe('yesNo')
    answer(g, false)
    expect(g.phase).toBe('over')
    expect(g.winner).toBe(1)
  })

  it('with several minions on the Altar, the controller chooses which to sacrifice', () => {
    const { g, offering } = setup()
    const second = summonCard(g, 0, 'Foot Soldier', 1, 3)
    dealDamageToUnit(g, avatarOf(g, 0), 1, 1)
    answer(g, true) // yes, sacrifice one
    expect(g.prompts[0]?.kind).toBe('chooseOption') // now pick WHICH
    const opts = (g.prompts[0] as any).data.options
    expect(opts.length).toBe(2)
    answer(g, opts[1])
    expect((g.phase as string)).not.toBe('over')
    const alive = [offering.id, second.id].filter((id) => g.units[id]) // exactly one sacrificed
    expect(alive.length).toBe(1)
  })

  it('no minion atop the Altar → no save, the Avatar dies normally', () => {
    const g = board()
    placeSite(g, 0, 'Altar of Malachai', 1, 3) // Altar but nothing on it
    const av = avatarOf(g, 0)
    av.deathsDoor = true; av.doorTurn = -1; av.life = 0
    dealDamageToUnit(g, av, 1, 1)
    expect(g.prompts.length).toBe(0)
    expect(g.phase).toBe('over')
  })
})

describe('Heat Ray is piercing: ONE unit per location, shooter chooses on a tie', () => {
  it('prompts for the shared square, burns only the chosen unit, then pierces on', () => {
    const g = board()
    const av = avatarOf(g, 0)
    av.x = 0; av.y = 1
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 1)
    // (1,1): two enemies share the square → the shooter must choose which is hit
    const a = summonCard(g, 1, 'Foot Soldier', 1, 1)
    const b = summonCard(g, 1, 'Foot Soldier', 1, 1)
    // (2,1): a lone enemy → auto-hit as the ray pierces onward
    const c = summonCard(g, 1, 'Foot Soldier', 2, 1)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Heat Ray', { extra: { direction: 'e' } })

    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    const cands = (g.prompts[0] as any).data.candidates
    expect([...cands].sort()).toEqual([a.id, b.id].sort())
    answer(g, [a.id]) // burn a, spare b

    expect(g.units[a.id]).toBeUndefined() // 2 dmg killed a
    expect(g.units[b.id]).toBeTruthy() // its squaremate was NOT hit
    expect(g.units[b.id]?.damage ?? 0).toBe(0)
    expect(g.units[c.id]).toBeUndefined() // the ray pierced on and hit the lone enemy at (2,1)
  })
})

describe('Pudge Butcher: the hook obeys the shared projectile rules', () => {
  it('can hook an enemy sharing its OWN square (projectiles start at the origin)', () => {
    const g = board()
    const pudge = summonCard(g, 0, 'Pudge Butcher', 2, 2)
    pudge.enteredTurn = -1 // no summoning sickness
    const prey = summonCard(g, 1, 'Foot Soldier', 2, 2) // co-located ON Pudge's square
    act(g, 0, { t: 'activate', sourceId: pudge.id, ability: 'hook' })
    answer(g, 'n') // direction is irrelevant — the enemy shares the origin square
    // old bug: the ray stepped away first and ignored the co-located enemy ("clatters against nothing").
    // now the enemy is hooked and Pudge is offered the fight.
    expect(g.prompts[0]?.kind).toBe('yesNo')
    expect(g.units[prey.id]).toBeDefined()
    answer(g, false) // decline the fight
  })
})

describe('Valor: a from-hand defend response is actually castable', () => {
  it('offers Valor when an ally defends and grants +4 power on yes (cost 0, works at 0 mana)', () => {
    const g = board()
    g.activePlayer = 1
    ;(g as any).phase = 'main'
    // p0 needs earth 2 for Valor — clone two ordinary earth sites under p0
    const anySite = Object.values(g.sites).find((s) => s.controller === 0)!
    for (let i = 0; i < 2; i++) {
      const id = `sEarth${i}`
      ;(g.sites as any)[id] = { ...anySite, id, name: 'Common Village', x: 0, y: i, controller: 0, isRubble: false }
    }
    g.players[0].mana = 0 // Valor is free — 0 mana must NOT block it
    // p1 attacks p0's Foot Soldier at its site (2,0); p0's ally sits on the adjacent
    // site (3,0) and can walk in to defend. (Units may only stand on sited squares.)
    const target = summonToken(g, 'Foot Soldier', 0, 2, 0)!; target.enteredTurn = 0
    const ally = summonToken(g, 'Foot Soldier', 0, 3, 0)!; ally.enteredTurn = 0
    const attacker = summonToken(g, 'Foot Soldier', 1, 2, 0)!; attacker.enteredTurn = 0
    const valor = injectToHand(g, 0, 'Valor')
    act(g, 1, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: target.id } })
    expect(g.prompts[0]?.kind).toBe('defend')
    answer(g, [ally.id]) // tap the ally to defend → opens Valor's response window
    expect(g.prompts[0]?.kind).toBe('yesNo')
    expect(g.prompts[0]?.player).toBe(0) // addressed to the defending player
    const before = effAttack(g, g.units[ally.id]!)
    answer(g, true) // cast Valor (this is what the GUI Yes button sends)
    expect(g.players[0].cemetery).toContain(valor) // it was actually cast & spent
    expect(effAttack(g, g.units[ally.id]!)).toBe(before + 4) // +4 power granted
  })
})

describe('X-spells (Arcane Barrage): can’t be cast with no mana to spend on X', () => {
  it('canCast fails at 0 mana (GUI won’t let you waste it) but succeeds once you have mana', () => {
    const g = board()
    waiveThreshold(g, 0)
    const cardId = injectToHand(g, 0, 'Arcane Barrage')
    g.players[0].mana = 0
    const av = avatarOf(g, 0)
    expect(canCast(g, 0, cardId, av.id).ok).toBe(false) // X needs ≥1 mana — no silent waste
    g.players[0].mana = 4
    expect(canCast(g, 0, cardId, av.id).ok).toBe(true)
  })

  it('the actual X-cast still resolves: choose X, direction, and deal X damage', () => {
    const g = board()
    waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    av.x = 2; av.y = 0
    // projectiles travel only over sites (they stop at the void), so site the lane east
    placeSite(g, 0, 'Rustic Village', 4, 0)
    const target = summonToken(g, 'Conqueror Worm', 1, 4, 0)! // due east, in line
    g.players[0].mana = 5
    const cardId = injectToHand(g, 0, 'Arcane Barrage')
    act(g, 0, { t: 'castSpell', cardId, casterId: av.id })
    expect(g.prompts[0]?.kind).toBe('chooseOption') // choose X
    expect((g.prompts[0]!.data as any).options).toEqual(['1', '2', '3', '4', '5'])
    answer(g, '3') // X = 3
    expect(g.players[0].mana).toBe(2) // paid 3
    answer(g, 'e') // fire east
    expect(g.prompts.length).toBe(0)
    expect(g.units[target.id]?.damage).toBe(3) // three 1-damage projectiles landed
  })
})

describe('Accursed Albatross: dying to a return-strike does not softlock the game', () => {
  it('kills the killer’s nearby minion and leaves the game in a resolvable state', () => {
    const g = board()
    const av = avatarOf(g, 0)
    av.x = 2; av.y = 2; av.region = 'surface'
    // the enemy 1/1 Albatross attacks my avatar and dies to its return strike
    const alb = summonToken(g, 'Accursed Albatross', 1, 2, 2)!
    alb.enteredTurn = 0
    // I control a minion next to my avatar — the albatross's curse should claim it
    const cursed = summonToken(g, 'Foot Soldier', 0, 2, 1)!
    cursed.enteredTurn = 0
    expect(beginAttack(g, alb, { unit: av.id })).toBeNull()
    // resolve the fight (pre-fix this recursed forever inside killUnit)
    let guard = 0
    while (g.prompts.length && guard++ < 50) {
      const p: any = g.prompts[0]
      answer(g, p.kind === 'defend' ? [] : p.kind === 'allocateDamage' ? { strikerId: p.data.strikerId, allocation: {} } : true)
    }
    expect(guard).toBeLessThan(50) // no softlock / runaway prompts
    expect(g.units[alb.id]).toBeUndefined() // the albatross died
    expect(g.units[cursed.id]).toBeUndefined() // its curse claimed my nearby minion
    expect(avatarOf(g, 0)).toBeTruthy() // my avatar is fine — the game continues
  })
})

describe('the active player orders simultaneous start/end-of-turn effects', () => {
  it('two of your end-of-turn effects → an order panel; resolving it runs them all', () => {
    const g = board()
    // two Infernal Legions each deal 3 "to each adjacent unit" at end of turn; a
    // fragile 1/1 sits next to each. Deaths persist (unlike damage, which the
    // end-of-turn heal would wipe), so both kills prove both Legions fired.
    const s1 = summonToken(g, 'Foot Soldier', 1, 1, 1)!; s1.enteredTurn = 0
    const s2 = summonToken(g, 'Foot Soldier', 1, 3, 1)!; s2.enteredTurn = 0
    summonToken(g, 'Infernal Legion', 0, 1, 0)
    summonToken(g, 'Infernal Legion', 0, 3, 0)
    endTurn(g)
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('orderCards')
    expect(p.data.place).toBe('resolve')
    const legionIdx = (p.data.cards as string[]).map((n, i) => [n, i] as const).filter(([n]) => n === 'Infernal Legion').map(([, i]) => i)
    expect(legionIdx.length).toBe(2)
    // same-named effects carry disambiguating board coordinates
    expect(legionIdx.map((i) => p.data.labels[i]).sort()).toEqual(['(1,0)', '(3,0)'])
    answer(g, [...(p.data.cards as string[]).keys()].reverse()) // any full permutation
    expect(g.units[s1.id]).toBeUndefined() // both Legions fired…
    expect(g.units[s2.id]).toBeUndefined() // …in the chosen order
  })

  it('a single end-of-turn effect resolves with NO order panel', () => {
    const g = board()
    const near = summonToken(g, 'Foot Soldier', 1, 1, 1)!; near.enteredTurn = 0
    const far = summonToken(g, 'Foot Soldier', 1, 3, 1)!; far.enteredTurn = 0
    summonToken(g, 'Infernal Legion', 0, 1, 0)
    endTurn(g)
    expect(g.prompts.some((q) => q.kind === 'orderCards')).toBe(false)
    expect(g.units[near.id]).toBeUndefined() // adjacent → killed by the lone Legion
    expect(g.units[far.id]).toBeDefined() // out of reach → untouched
  })

  it('two DIFFERENT-named effects need no coordinate labels', () => {
    const g = board()
    summonToken(g, 'Conqueror Worm', 1, 2, 0)
    summonToken(g, 'Infernal Legion', 0, 1, 0)
    summonToken(g, 'Colicky Dragonettes', 0, 3, 0) // also an end-of-turn effect, different name
    endTurn(g)
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('orderCards')
    // distinct names → every label blank (coords only disambiguate duplicates)
    expect((p.data.labels as string[]).every((l) => l === '')).toBe(true)
  })
})

describe('projectile spells need a cast-time direction', () => {
  it('Ice Lance is refused (not consumed) without a direction, and pierces 3/2/1 with one', () => {
    const g = board()
    waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    // no direction supplied → cast is rejected, card stays in hand
    const err = castMagicFail(g, 0, 'Ice Lance')
    expect(err).toMatch(/direction/i)
    // with a direction, the piercing projectile hits the first unit for 3
    const dir = av.x < 4 ? 'e' : 'w'
    const dx = dir === 'e' ? 1 : -1
    const foe = summonToken(g, 'Foot Soldier', 1, av.x + dx, av.y)!
    castMagic(g, 0, 'Ice Lance', { extra: { direction: dir } })
    expect(g.units[foe.id]).toBeUndefined() // 3 dmg kills the 1/1
  })
})

describe('projectile target selection: the SHOOTER chooses when units share the impact square', () => {
  it('Magic Missiles prompts the caster to pick which co-located unit each of its 3 projectiles hits', () => {
    const g = board()
    waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    av.x = 2; av.y = 0; av.region = 'surface'
    // two enemy minions share the first square east of the avatar — both hittable,
    // both sturdy enough to survive all three 1-damage projectiles
    const mobA = summonToken(g, 'Conqueror Worm', 1, 3, 0)!
    const mobB = summonToken(g, 'Conqueror Worm', 1, 3, 0)!
    castMagic(g, 0, 'Magic Missiles', { casterId: av.id, extra: { direction: 'e' } })
    // it MUST prompt the shooter for each projectile — never silently auto-pick
    let prompts = 0
    while (g.prompts[0]?.kind === 'chooseTargets') {
      const p: any = g.prompts[0]
      expect(p.player).toBe(0) // the player who fired chooses
      expect([...p.data.candidates].sort()).toEqual([mobA.id, mobB.id].sort())
      answer(g, [mobB.id]) // send every projectile into mobB
      prompts++
    }
    expect(prompts).toBe(3) // one choice per projectile
    expect(g.units[mobB.id].damage).toBe(3) // all three hit the CHOSEN unit…
    expect(g.units[mobA.id].damage).toBe(0) // …not the one the engine used to auto-pick
  })

  it('Ice Lance (per-square projectile) also lets the shooter choose at a shared square', () => {
    const g = board()
    waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    av.x = 2; av.y = 0; av.region = 'surface'
    const a = summonToken(g, 'Conqueror Worm', 1, 3, 0)! // both one square east of the caster
    const b = summonToken(g, 'Conqueror Worm', 1, 3, 0)!
    castMagic(g, 0, 'Ice Lance', { casterId: av.id, extra: { direction: 'e' } })
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets') // shooter chooses at the shared location
    expect([...p.data.candidates].sort()).toEqual([a.id, b.id].sort())
    answer(g, [b.id])
    // Ice Lance's FIRST location is the caster's own site; these worms sit one square on,
    // so they take the +1 location's 2 damage (the origin's 3 fell on the caster's empty site).
    expect(g.units[b.id].damage).toBe(2) // chosen unit took the +1 location's damage
    expect(g.units[a.id].damage).toBe(0)
  })
})

describe('End-of-turn damage that outlives the end phase is cleared at the next turn start', () => {
  it('a minion still carrying damage at the start of a turn is healed', () => {
    const g = board()
    const u = summonToken(g, 'Conqueror Worm', 0, 2, 0)! // sturdy enough to hold a few damage
    u.damage = 3 // simulate end-of-turn damage that resolved after the end-phase heal
    beginTurn(g, 1) // the opponent's turn begins
    expect(g.units[u.id].damage).toBe(0) // straggler damage cleared — never leaks across the boundary
  })
})

describe('King of the Realm: other Mortals have +1 power', () => {
  it('buffs every other Mortal (not itself), and the buff stops when the King is silenced', () => {
    const g = board()
    const king = summonCard(g, 0, 'King of the Realm', 2, 0)
    const soldier = summonCard(g, 0, 'Foot Soldier', 3, 0) // an Ordinary Mortal, base power 1
    expect(effAttack(g, g.units[soldier.id])).toBe(2) // 1 + the King's +1
    expect(effAttack(g, g.units[king.id])).toBe(3) // the King doesn't buff itself (base 3)
    king.silenced = true
    expect(effAttack(g, g.units[soldier.id])).toBe(1) // silenced → no buff
    king.silenced = false
    king.disabled = true
    expect(effAttack(g, g.units[soldier.id])).toBe(1) // disabled → no abilities → no buff
  })

  it('a disabled keyword-granter grants nothing either (Dwarven Digging Team)', () => {
    const g = board()
    const digger = summonCard(g, 0, 'Dwarven Digging Team', 2, 0)
    const ally = summonCard(g, 0, 'Foot Soldier', 3, 0) // on a nearby site
    expect(effKeywords(g, g.units[ally.id]).burrowing).toBe(true) // granted while active
    digger.disabled = true
    expect(effKeywords(g, g.units[ally.id]).burrowing).toBeFalsy() // disabled → no grant
  })

  it('a granter disabled by an AREA static (a burrowed Root Spider below it) also stops granting', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 2, 1) // land site to stand on / burrow beneath
    const spider = summonCard(g, 1, 'Root Spider', 2, 1, 'underground')
    spider.enteredTurn = 0
    const king = summonCard(g, 0, 'King of the Realm', 2, 1) // surface, directly above the spider → area-disabled
    const soldier = summonCard(g, 0, 'Foot Soldier', 3, 1) // a Mortal elsewhere
    expect(isDisabled(g, g.units[king.id])).toBe(true) // disabled by the Root Spider's gaze
    expect(effAttack(g, g.units[soldier.id])).toBe(1) // …so the King's +1 is OFF (the case directlyDisabled missed)
  })
})

describe('Move & Attack: area statics resolve on arrival, between the move and the attack', () => {
  it('a unit that moves onto a burrowed Root Spider is disabled there and cannot attack', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 2, 1) // land site to move onto / burrow beneath
    const spider = summonCard(g, 0, 'Root Spider', 2, 1, 'underground')
    spider.enteredTurn = 0
    const target = summonCard(g, 0, 'Foot Soldier', 2, 1) // on the surface above the spider
    const mover = summonCard(g, 1, 'Foot Soldier', 2, 0)
    mover.enteredTurn = 0
    // move onto (2,1) — directly above the burrowed spider — and try to attack there
    expect(moveAttack(g, 1, mover.id, [{ x: 2, y: 1, region: 'surface' }], { unit: target.id })).toBeNull()
    expect(g.units[mover.id].x).toBe(2) // it DID move onto the square…
    expect(g.units[mover.id].y).toBe(1)
    expect(isDisabled(g, g.units[mover.id])).toBe(true) // …arriving disabled it…
    expect(g.units[target.id].damage).toBe(0) // …so the attack never happened
  })
})

describe('Rolling Boulder: grants its push to every unit on its site, even when carried', () => {
  it('a unit CARRYING the Boulder can push it; the roll damages the path and drops the Boulder', () => {
    const g = board()
    // a full top row of sites for the Boulder to roll along
    for (const x of [0, 1, 4]) placeSite(g, 0, 'Rustic Village', x, 0)
    const carrier = summonCard(g, 0, 'Foot Soldier', 2, 0)
    carrier.enteredTurn = 0 // not summoning-sick → may tap to push
    const boulder = giveArtifact(g, carrier, 'Rolling Boulder')
    expect(boulder.carriedBy).toBe(carrier.id) // carried
    // the carrier (a unit on the Boulder's square) is granted the push despite carrying it
    expect(grantedAbilities(g, g.units[carrier.id]).some((a) => a.key === 'boulder:push')).toBe(true)
    const foe = summonToken(g, 'Conqueror Worm', 1, 4, 0)! // sits east, in the roll path
    act(g, 0, { t: 'activate', sourceId: carrier.id, ability: 'boulder:push' })
    answer(g, 'e')
    expect(g.units[foe.id].damage).toBe(4) // the Boulder rolled through and crushed it
    expect(g.artifacts[boulder.id].x).toBe(4) // rolled to the last site east
    expect(g.artifacts[boulder.id].carriedBy).toBeNull() // rolled away from the carrier → dropped
    expect(g.units[carrier.id].carrying).not.toContain(boulder.id)
  })
})

describe('Troubled Town: "cast a Townsfolk from your collection" PAYS the cost, not a free summon', () => {
  it('casting the Townsfolk deducts its mana cost — the site\'s +1 is offset by the cast', () => {
    const g = board()
    waiveThreshold(g, 0)
    g.players[0].collection['Eltham Townsfolk'] = 1 // Ordinary Mortal, cost 1
    g.players[0].mana = 5
    const before = g.players[0].mana
    const tt = injectToHand(g, 0, 'Troubled Town')
    expect(playSite(g, 0, tt, 1, 0)).toBeNull() // adjacent to the (2,0) site
    expect(g.players[0].mana).toBe(before + 1) // a site provides +1 mana on entry
    answer(g, 'Eltham Townsfolk') // Genesis → cast it to THIS site (pays its cost)
    // +1 site − 1 cast = net `before`; the old bug free-summoned it → left mana at before+1
    expect(g.players[0].mana).toBe(before)
    expect(unitsAt(g, 1, 0, 'surface').map((u) => u.name)).toContain('Eltham Townsfolk')
    expect(g.players[0].collection['Eltham Townsfolk']).toBe(0) // the collection copy is consumed
  })
})

describe('castFromCollection: every "cast … from your collection" site pays the cost (shared helper)', () => {
  it('pays the mana cost, places on the site, and consumes the collection copy', () => {
    const g = board()
    waiveThreshold(g, 0)
    g.players[0].collection['Eltham Townsfolk'] = 1 // cost 1
    g.players[0].mana = 5
    expect(castFromCollection(g, 0, 'Eltham Townsfolk', { x: 2, y: 0, region: 'surface' })).toBe(true)
    expect(g.players[0].mana).toBe(4) // 5 − 1 cost (not a free summon)
    expect(unitsAt(g, 2, 0, 'surface').map((u) => u.name)).toContain('Eltham Townsfolk')
    expect(g.players[0].collection['Eltham Townsfolk']).toBe(0)
  })

  it('is a no-op if you do not own a copy (mana untouched)', () => {
    const g = board()
    waiveThreshold(g, 0)
    g.players[0].mana = 5
    expect(castFromCollection(g, 0, 'Eltham Townsfolk', { x: 2, y: 0, region: 'surface' })).toBe(false)
    expect(g.players[0].mana).toBe(5)
  })

  it('casts submerged when the site is water (Elder Ruins → Shoggoth underwater)', () => {
    const g = board()
    waiveThreshold(g, 0)
    Object.values(g.sites).find((s) => s.x === 2 && s.y === 0)!.flooded = true
    g.players[0].collection['Shoggoth'] = 1
    g.players[0].mana = 20
    expect(castFromCollection(g, 0, 'Shoggoth', { x: 2, y: 0, region: 'underwater' })).toBe(true)
    expect(g.players[0].mana).toBeLessThan(20) // paid its cost
    expect(unitsAt(g, 2, 0, 'underwater').map((u) => u.name)).toContain('Shoggoth')
  })
})

describe('Animist + Evil Presence: cast a magic as a Spirit into the Evil Presence area', () => {
  it('summons the magic-Spirit onto an Evil Presence-covered site it does NOT own — it gains Charge and Evil Presence returns to hand', () => {
    const g = board()
    const av = avatarOf(g, 0)
    av.name = 'Animist'
    g.players[0].mana = 20
    const magicId = injectToHand(g, 0, 'Fireball') // a Magic with a cost
    const cost = getCard('Fireball').cost ?? 0
    // an ENEMY site at (1,1) — normally off-limits for our summons — but our Evil
    // Presence covers it, opening it to Spirits.
    placeSite(g, 1, 'Rustic Village', 1, 1)
    const epCardId = 'c_ep'
    g.cards[epCardId] = { id: epCardId, name: 'Evil Presence', owner: 0 } as any
    g.auras['r_ep'] = { id: 'r_ep', cardId: epCardId, name: 'Evil Presence', controller: 0, squares: [{ x: 1, y: 1 }] } as any

    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'animate' })
    answer(g, [0]) // chooseCards: the only magic
    // the offered squares include (1,1) thanks to Evil Presence
    answer(g, { x: 1, y: 1 }) // chooseSquare

    const spirit = unitsAt(g, 1, 1, 'surface').find((u) => u.name === 'Fireball')
    expect(spirit).toBeTruthy()
    expect(effSubtypes(g, spirit!)).toContain('Spirit')
    expect(effAttack(g, spirit!)).toBe(cost) // power equals the magic's cost
    expect(effKeywords(g, spirit!).charge).toBe(true) // Evil Presence granted Charge
    expect(g.auras['r_ep']).toBeUndefined() // Evil Presence returned to its owner's hand
    expect(g.players[0].hand).toContain(epCardId)
    expect(g.players[0].hand).not.toContain(magicId) // the magic left hand as the Spirit
    expect(g.players[0].mana).toBe(20 - cost)
  })

  it('without Evil Presence, the magic-Spirit can only go on your own sites (baseline)', () => {
    const g = board() // p0 owns sites at (2,0),(3,0)
    const av = avatarOf(g, 0)
    av.name = 'Animist'
    g.players[0].mana = 20
    injectToHand(g, 0, 'Fireball')
    const cost = getCard('Fireball').cost ?? 0
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'animate' })
    answer(g, [0])
    answer(g, { x: 2, y: 0 }) // an own site
    const spirit = unitsAt(g, 2, 0, 'surface').find((u) => u.name === 'Fireball')
    expect(spirit).toBeTruthy()
    expect(effAttack(g, spirit!)).toBe(cost)
    expect(effKeywords(g, spirit!).charge).toBeFalsy() // no Evil Presence → no Charge
  })

  it('an Imposter masked as Animist can cast a magic as a Spirit too (via the granted ability + pre-selected magic)', () => {
    const g = board()
    const av = avatarOf(g, 0)
    av.name = 'Imposter'
    g.flow = g.flow ?? {}
    ;(g.flow as any).imposterMask = { 0: 'Animist' } // wearing the Animist's face
    g.players[0].mana = 20
    const magicId = injectToHand(g, 0, 'Fireball')
    const cost = getCard('Fireball').cost ?? 0
    // the client "Cast as Spirit" shortcut: activate the masked 'animate' with the magic pre-selected
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'animate', extra: { cardId: magicId } })
    answer(g, { x: 2, y: 0 }) // straight to placement (no "which magic" step)
    const spirit = unitsAt(g, 2, 0, 'surface').find((u) => u.name === 'Fireball')
    expect(spirit).toBeTruthy()
    expect(effSubtypes(g, spirit!)).toContain('Spirit')
    expect(effAttack(g, spirit!)).toBe(cost)
    expect(g.players[0].hand).not.toContain(magicId)
  })
})

describe('Magellan Globe: a 2x2 aura at the edge wraps its coverage to the opposite side', () => {
  it('an edge-anchored aura also covers the far-edge sites while Magellan Globe is in play', () => {
    const g = board()
    waiveThreshold(g, 0)
    g.players[0].mana = 20
    // Magellan Globe in play connects opposite edges (global artifact)
    act(g, 0, { t: 'judge', op: { k: 'spawnArtifact', name: 'Magellan Globe', player: 0, x: 0, y: 0 } })
    const cardId = injectToHand(g, 0, 'Drought')
    act(g, 0, { t: 'castSpell', cardId, casterId: avatarOf(g, 0).id, at: { x: 4, y: 1 } })
    const aura = Object.values(g.auras).find((r) => r.name === 'Drought')!
    const has = (x: number, y: number) => aura.squares.some((s) => s.x === x && s.y === y)
    expect(has(4, 1)).toBe(true) // anchor
    expect(has(4, 2)).toBe(true) // anchor + down
    expect(has(0, 1)).toBe(true) // (5,1) wrapped across the right edge → (0,1)
    expect(has(0, 2)).toBe(true) // (5,2) wrapped → (0,2)
  })

  it('without Magellan Globe the same edge aura simply clips (no wrap)', () => {
    const g = board()
    waiveThreshold(g, 0)
    g.players[0].mana = 20
    const cardId = injectToHand(g, 0, 'Drought')
    act(g, 0, { t: 'castSpell', cardId, casterId: avatarOf(g, 0).id, at: { x: 4, y: 1 } })
    const aura = Object.values(g.auras).find((r) => r.name === 'Drought')!
    expect(aura.squares.some((s) => s.x === 0)).toBe(false) // no wrap
    expect(aura.squares.length).toBe(2) // only (4,1) and (4,2) remain on-board
  })

  it('CASTING Magellan Globe wraps an already-existing edge aura (dynamic on add, real cast)', () => {
    const g = board()
    waiveThreshold(g, 0)
    g.players[0].mana = 20
    // edge aura placed BEFORE any Globe → clipped to on-board sites
    const auraId = injectToHand(g, 0, 'Drought')
    act(g, 0, { t: 'castSpell', cardId: auraId, casterId: avatarOf(g, 0).id, at: { x: 4, y: 1 } })
    const aura = Object.values(g.auras).find((r) => r.name === 'Drought')!
    expect(aura.squares.some((s) => s.x === 0)).toBe(false)
    // now CAST Magellan Globe (normal artifact cast, conjured to a controlled site)
    const globeId = injectToHand(g, 0, 'Magellan Globe')
    g.players[0].mana = 20
    act(g, 0, { t: 'castSpell', cardId: globeId, casterId: avatarOf(g, 0).id, at: { x: 2, y: 0 } })
    expect(aura.squares.some((s) => s.x === 0)).toBe(true) // the existing aura now wraps
  })

  it('the wrap is dynamic: removing the Globe retracts coverage, re-adding it wraps again', () => {
    const g = board()
    waiveThreshold(g, 0)
    g.players[0].mana = 20
    act(g, 0, { t: 'judge', op: { k: 'spawnArtifact', name: 'Magellan Globe', player: 0, x: 0, y: 0 } })
    const cardId = injectToHand(g, 0, 'Drought')
    act(g, 0, { t: 'castSpell', cardId, casterId: avatarOf(g, 0).id, at: { x: 4, y: 1 } })
    const aura = Object.values(g.auras).find((r) => r.name === 'Drought')!
    expect(aura.squares.some((s) => s.x === 0)).toBe(true) // wrapped while in play
    // remove the Globe → coverage retracts to on-board sites (not baked in at cast)
    const globe = Object.values(g.artifacts).find((a) => a.name === 'Magellan Globe')!
    act(g, 0, { t: 'judge', op: { k: 'removeArtifact', artifactId: globe.id } })
    expect(aura.squares.some((s) => s.x === 0)).toBe(false)
    expect(aura.squares.length).toBe(2)
    // re-add it → wraps again
    act(g, 0, { t: 'judge', op: { k: 'spawnArtifact', name: 'Magellan Globe', player: 0, x: 0, y: 0 } })
    checkStateBased(g)
    expect(aura.squares.some((s) => s.x === 0)).toBe(true)
  })
})

describe('Minion Genesis targeting is measured from the placement square, not the caster', () => {
  it("Gargantula drags a minion adjacent to WHERE IT LANDS (not adjacent to the caster)", () => {
    const g = board()
    waiveThreshold(g, 0)
    g.players[0].mana = 20
    const av = avatarOf(g, 0)
    av.x = 0; av.y = 3; av.region = 'surface' // caster is FAR from the landing square
    placeSite(g, 0, 'Rustic Village', 2, 1) // Gargantula's landing site
    placeSite(g, 0, 'Rustic Village', 2, 2) // the prey's site (adjacent to the landing, not the caster)
    const prey = summonToken(g, 'Conqueror Worm', 1, 2, 2)!
    const cardId = injectToHand(g, 0, 'Gargantula')
    // pre-fix this failed with "not adjacent" (adjacency was measured from the avatar)
    act(g, 0, { t: 'castSpell', cardId, casterId: av.id, at: { x: 2, y: 1 }, targets: [prey.id] })
    expect(g.units[prey.id].x).toBe(2)
    expect(g.units[prey.id].y).toBe(1) // dragged onto Gargantula's square
    expect(g.units[prey.id].disabled).toBe(true) // cocooned
  })
})

describe("Projectiles: the caster's own square is the flight's start", () => {
  it('an ENEMY sharing the caster square is hit and blocks — no reaching farther units', () => {
    const g = board()
    waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    av.x = 2; av.y = 0; av.region = 'surface'
    const near = summonToken(g, 'Conqueror Worm', 1, 2, 0)! // enemy ON the caster's square
    const far = summonToken(g, 'Conqueror Worm', 1, 3, 0)! // enemy one square east
    castMagic(g, 0, 'Magic Missiles', { casterId: av.id, extra: { direction: 'e' } })
    expect(g.units[near.id].damage).toBe(3) // all three projectiles stop on the co-located enemy
    expect(g.units[far.id].damage).toBe(0) // nothing reaches the farther enemy
  })

  it('an ALLY sharing the caster square is IGNORED — the shot passes to the enemy beyond', () => {
    const g = board()
    waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    av.x = 2; av.y = 0; av.region = 'surface'
    const ally = summonToken(g, 'Conqueror Worm', 0, 2, 0)! // friendly, on the caster's square
    const far = summonToken(g, 'Conqueror Worm', 1, 3, 0)! // enemy one square east
    castMagic(g, 0, 'Magic Missiles', { casterId: av.id, extra: { direction: 'e' } })
    expect(g.units[ally.id].damage).toBe(0) // allies at the start are ignored (rulebook)
    expect(g.units[far.id].damage).toBe(3) // the projectiles fly past to the enemy beyond
  })
})

describe('FAQ: Bane of Aventis', () => {
  it('stolen warded minions stay stolen after the ward is gone', () => {
    const g = board()
    const victim = summonToken(g, 'Foot Soldier', 1, 3, 0)!
    victim.ward = true
    const bane = summonCard(g, 0, 'Bane of Aventis', 2, 0)
    // fire the genesis by hand (summonCard skips it)
    getScript('Bane of Aventis')!.genesis!(makeCtx(g, bane.id, 0, []))
    expect(g.units[victim.id]?.controller).toBe(0)
    victim.ward = false
    act(g, 0, { t: 'endTurn' })
    expect(g.units[victim.id]?.controller).toBe(0) // indefinite control
  })
})

describe('FAQ: Begone!', () => {
  it('does not target: banishes a stealthed Evil minion', () => {
    const g = board()
    const ghoul = summonCard(g, 1, 'Ghoul', 2, 0) // Undead = Evil
    ghoul.stealth = true
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Begone!', { targets: [ghoul.id] })
    expect(g.units[ghoul.id]).toBeUndefined()
    expect(g.players[1].banished).toContain(ghoul.cardId)
  })
})

describe('FAQ: Blood Mana', () => {
  it('the next spell costs life instead of mana — thresholds still apply', () => {
    const g = board()
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Blood Mana', {})
    const manaBefore = g.players[0].mana
    const lifeBefore = avatarOf(g, 0).life!
    // still under Blood Mana: cast Sleep (cost 2) on an enemy minion
    const foe = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    avatarOf(g, 0).x = 2
    avatarOf(g, 0).y = 0
    const sleepId = injectToHand(g, 0, 'Sleep')
    act(g, 0, { t: 'castSpell', cardId: sleepId, casterId: g.players[0].avatarUnitId, targets: [foe.id] })
    expect(g.players[0].mana).toBe(manaBefore) // no mana spent
    expect(avatarOf(g, 0).life).toBe(lifeBefore - 2) // paid in blood
  })

  it('cannot pay more life than you have', () => {
    const g = board()
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Blood Mana', {})
    avatarOf(g, 0).life = 1
    const foe = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    avatarOf(g, 0).x = 2
    avatarOf(g, 0).y = 0
    const sleepId = injectToHand(g, 0, 'Sleep')
    const err = actFail(g, 0, { t: 'castSpell', cardId: sleepId, casterId: g.players[0].avatarUnitId, targets: [foe.id] })
    expect(err).toMatch(/not enough life/i)
  })
})

describe('FAQ: Bureau of Occult Control', () => {
  it('casting from the cemetery costs an extra (2), separate from the spell cost', () => {
    const g = board()
    placeSite(g, 1, 'Bureau of Occult Control', 2, 3)
    waiveThreshold(g, 0)
    // Ghostfire (cost 1, cemetery-castable) now needs 3 total
    const gfId = `ctest${g.nextId++}`
    g.cards[gfId] = { id: gfId, name: 'Ghostfire', owner: 0 }
    g.players[0].cemetery.push(gfId)
    g.players[0].mana = 1
    const err = actFail(g, 0, { t: 'castSpell', cardId: gfId, casterId: g.players[0].avatarUnitId })
    expect(err).toMatch(/mana/i)
    g.players[0].mana = 3
    act(g, 0, { t: 'castSpell', cardId: gfId, casterId: g.players[0].avatarUnitId })
    answer(g, 'n') // Ghostfire direction
    expect(g.players[0].mana).toBe(0)
  })
})

describe('FAQ: Blasted Oak', () => {
  it('a spell that can target something at its location must', () => {
    const g = board()
    // enemy Blasted Oak on the ground at (2,0)
    const oakCard = `ctest${g.nextId++}`
    g.cards[oakCard] = { id: oakCard, name: 'Blasted Oak', owner: 1 }
    g.artifacts['aoak'] = { id: 'aoak', cardId: oakCard, name: 'Blasted Oak', conjuredBy: 1, x: 2, y: 0, region: 'surface', carriedBy: null, tapped: false }
    const atOak = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    const elsewhere = summonToken(g, 'Foot Soldier', 1, 3, 0)!
    avatarOf(g, 0).x = 2
    avatarOf(g, 0).y = 0
    waiveThreshold(g, 0)
    const err = castMagicFail(g, 0, 'Sleep', { targets: [elsewhere.id] })
    expect(err).toMatch(/compels/i)
    castMagic(g, 0, 'Sleep', { targets: [atOak.id] }) // the compelled choice works
    expect(g.units[atOak.id]?.counters?.asleep).toBeTruthy()
  })
})

describe('FAQ: Blaze of Glory', () => {
  it('the ally survives if the fights would not kill it', () => {
    const g = board()
    const hero = summonCard(g, 0, 'Bane of Aventis', 2, 0) // 4/4
    const f1 = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    const f2 = summonToken(g, 'Foot Soldier', 1, 3, 0)!
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Blaze of Glory', { targets: [hero.id] })
    // "one at a time": with 2+ nearby foes the controller picks the order. Fight f1 first;
    // the last remaining foe then auto-resolves (no needless single-option prompt).
    if (g.prompts[0]?.kind === 'chooseTargets') answer(g, [f1.id])
    expect(g.units[f1.id]).toBeUndefined()
    expect(g.units[f2.id]).toBeUndefined()
    expect(g.units[hero.id]?.damage).toBe(2) // survived on 4 toughness
  })
})

describe('FAQ: Ward (codex semantics)', () => {
  it("an opponent's targeted spell breaks the ward instead of resolving against it", () => {
    const g = board()
    const foe = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    foe.ward = true
    avatarOf(g, 0).x = 2
    avatarOf(g, 0).y = 0
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Sleep', { targets: [foe.id] })
    expect(g.units[foe.id]?.ward).toBeFalsy() // ward broke...
    expect(g.units[foe.id]?.counters?.asleep).toBeFalsy() // ...and the minion never slept
  })

  it('a destruction effect breaks the ward instead of killing (Detonate FAQ), then the explosion still damages', () => {
    const g = board()
    const bomb = summonCard(g, 0, 'Bane of Aventis', 2, 0) // 4/4 own minion
    bomb.ward = true
    const bystander = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Detonate', {})
    answer(g, [bomb.id]) // detonate the warded minion
    expect(g.units[bomb.id]).toBeDefined() // survived: the ward ate the destruction
    expect(g.units[bomb.id]?.ward).toBeFalsy()
    expect(g.units[bomb.id]?.damage).toBe(3) // but the blast still hit it
    expect(g.units[bystander.id]).toBeUndefined() // and killed the 1/1 next to it
  })
})

describe('FAQ: Critical Strike', () => {
  it('doubling twice multiplies the strike by four', () => {
    const g = board()
    const striker = summonToken(g, 'Foot Soldier', 0, 2, 0)! // 1 power
    striker.enteredTurn = 0
    const wall = summonCard(g, 1, 'Bane of Aventis', 2, 0) // 4/4 takes the hit
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Critical Strike', {})
    castMagic(g, 0, 'Critical Strike', {})
    act(g, 0, { t: 'moveAttack', unitId: striker.id, path: [], attack: { unit: wall.id } })
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
    expect(g.units[wall.id]).toBeUndefined() // 1 × 2 × 2 = 4 ≥ 4 toughness
  })
})

describe('FAQ: Consecrated Ground', () => {
  it('Evil units have zero power there', () => {
    const g = board()
    placeSite(g, 0, 'Consecrated Ground', 1, 0)
    const ghoul = summonCard(g, 1, 'Ghoul', 1, 0) // 3-power Undead
    expect(effAttack(g, ghoul)).toBe(0)
    ghoul.x = 2 // step off the holy ground
    expect(effAttack(g, ghoul)).toBe(3)
  })
})

describe('FAQ: Corruptor', () => {
  it('adds the Undead type to allied minions without replacing their own', () => {
    const g = board()
    summonCard(g, 0, 'Corruptor', 2, 0)
    const soldier = summonToken(g, 'Foot Soldier', 0, 3, 0)! // printed Mortal
    const types = effSubtypes(g, soldier)
    expect(types).toContain('Undead')
    expect(types).toContain('Mortal')
  })
})

describe('FAQ: Courtesan Thaïs + Vaults of Zul', () => {
  it('a skipped turn defers the controlled turn to the next actual turn', () => {
    const g = board()
    g.flow = g.flow ?? {}
    g.flow.thaisPending = [1]
    g.flow.skipTurn = { 1: 1 } // Vaults of Zul skips p1's next turn
    act(g, 0, { t: 'endTurn' })
    // p1's turn was skipped entirely → control was NOT consumed, p0 plays again
    expect(g.activePlayer).toBe(0)
    expect(g.flow.thaisPending).toEqual([1])
    if (g.prompts.length) answer(g, 'spellbook')
    act(g, 0, { t: 'endTurn' })
    // p1's draw prompt is answered by their CONTROLLER, p0
    if (g.prompts.length) act(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: 'spellbook' })
    // now p1's ACTUAL turn arrives — and p0 controls it
    expect(g.activePlayer).toBe(1)
    expect(g.flow.thaisActive).toBe(1)
    const err = actFail(g, 1, { t: 'endTurn' })
    expect(err).toMatch(/opponent plays this turn/i)
    act(g, 0, { t: 'endTurn' }) // the controller ends it for them
    expect(g.activePlayer).toBe(0)
  })
})

describe('FAQ: Crave Golem', () => {
  it('attacks the only non-Airborne minion in reach (a real, defendable attack, no tap)', () => {
    const g = board()
    const golem = summonCard(g, 0, 'Crave Golem', 2, 0)
    const bird = summonToken(g, 'Foot Soldier', 1, 3, 0)!
    bird.modifiers.push({ kind: 'keyword', keyword: 'airborne', duration: 'permanent', turn: 0, sourcePlayer: 1 })
    const walker = summonToken(g, 'Foot Soldier', 1, 3, 0)!
    act(g, 0, { t: 'endTurn' })
    if (g.prompts.length && g.prompts[0].kind === 'drawDeck') answer(g, 'spellbook')
    // p1's turn began: the golem lunged at the ground target, never the bird
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
    expect(g.units[walker.id]).toBeUndefined() // 3-power golem ate the 1/1
    expect(g.units[bird.id]).toBeDefined()
    expect(g.units[golem.id]?.damage).toBe(1) // the walker struck back
    expect(g.units[golem.id]?.tapped).toBe(false) // no tap
  })
})

describe('FAQ: Deathwish', () => {
  it('halves maximum life (rounded down) and clamps current life to it', () => {
    const g = board()
    avatarOf(g, 1).life = 19
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Deathwish', {})
    expect(avatarOf(g, 0).counters?.maxLife).toBe(10)
    expect(avatarOf(g, 0).life).toBe(10)
    expect(avatarOf(g, 1).counters?.maxLife).toBe(10)
    expect(avatarOf(g, 1).life).toBe(10) // 19 clamped down to the new max
  })
})

describe('FAQ: Divine Intervention', () => {
  it('sets life to 1 even from a higher total, and clears Death’s Door', () => {
    const g = board()
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Divine Intervention', {})
    expect(avatarOf(g, 0).life).toBe(1)
    const g2 = board()
    avatarOf(g2, 0).life = 0
    avatarOf(g2, 0).deathsDoor = true
    waiveThreshold(g2, 0)
    castMagic(g2, 0, 'Divine Intervention', {})
    expect(avatarOf(g2, 0).deathsDoor).toBeFalsy()
    expect(avatarOf(g2, 0).life).toBe(1)
  })
})

describe('FAQ: Dome of Osiros', () => {
  it('an attack cannot be declared against a minion here', () => {
    const g = board()
    placeSite(g, 1, 'Dome of Osiros', 3, 0)
    const shielded = summonToken(g, 'Foot Soldier', 1, 3, 0)!
    const attacker = summonToken(g, 'Foot Soldier', 0, 3, 0)!
    attacker.enteredTurn = 0
    const err = beginAttack(g, attacker, { unit: shielded.id })
    expect(err).toMatch(/protected/i)
  })
})

describe('FAQ: Dwarven Digging Team / Evil Twin', () => {
  it('cannot choose an underground summon before the ability is gained', () => {
    const g = board()
    summonCard(g, 0, 'Dwarven Digging Team', 2, 0)
    expect(validateSummonAt(g, 0, 'Foot Soldier 1', { x: 2, y: 0, region: 'underground' })).toMatch(/underground/i)
    expect(validateSummonAt(g, 0, 'Evil Twin', { x: 2, y: 0, region: 'underground' })).toMatch(/underground/i)
  })
})

describe('FAQ: East-West Dragon', () => {
  it('moves freely sideways but not diagonally', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 1, 0)
    placeSite(g, 0, 'Rustic Village', 1, 1)
    const dragon = summonCard(g, 0, 'East-West Dragon', 3, 0)
    const spots = reachableLocations(g, dragon)
    // free east-west: crosses the whole row without spending its step
    expect(spots.some((s) => s.x === 1 && s.y === 0)).toBe(true)
    // ...and still has its paid step left afterwards (row-free + one south)
    expect(spots.some((s) => s.x === 1 && s.y === 1)).toBe(true)
    // but sideways-freedom grants no diagonal steps: a lone diagonal site
    // two rows over is out of reach
    placeSite(g, 0, 'Rustic Village', 0, 2)
    expect(reachableLocations(g, dragon).some((s) => s.x === 0 && s.y === 2)).toBe(false)
  })
})

describe('FAQ: False Idol', () => {
  it('triggers on a nearby unit becoming tapped, not on entering play', () => {
    const g = board()
    const bearer = summonToken(g, 'Foot Soldier', 1, 3, 0)!
    giveArtifact(g, bearer, 'False Idol')
    const mine = summonToken(g, 'Foot Soldier', 0, 3, 0)! // enters untapped: no draw
    const before = g.players[1].hand.length
    tapUnit(g, mine) // p0's minion taps near the idol → the OTHER player draws
    expect(g.players[1].hand.length).toBe(before + 1)
  })
})

describe('FAQ: Flagellant', () => {
  it('heals 1 per damage instance, not per point', () => {
    const g = board()
    const monk = summonCard(g, 0, 'Flagellant', 2, 0)
    avatarOf(g, 0).life = 10
    dealDamageToUnit(g, monk, 3, 1)
    expect(avatarOf(g, 0).life).toBe(11) // one instance → one heal
  })
})

describe('FAQ: Flaming Sword', () => {
  it('splashes the strike damage to other enemies at the struck unit’s location', () => {
    const g = board()
    const knight = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    knight.enteredTurn = 0
    giveArtifact(g, knight, 'Flaming Sword')
    const target = summonCard(g, 1, 'Bane of Aventis', 2, 0) // 4/4 survives
    const bystander = summonToken(g, 'Foot Soldier', 1, 2, 0)!
    act(g, 0, { t: 'moveAttack', unitId: knight.id, path: [], attack: { unit: target.id } })
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
    // knight strikes 1+1(sword)=2 into the target; the sword splashes 2 to the bystander
    expect(g.units[target.id]?.damage).toBe(2)
    expect(g.units[bystander.id]).toBeUndefined()
  })
})

describe('FAQ: Free City', () => {
  it('strikes against the fighting city cost its controller life; it never dies of damage', () => {
    const g = board()
    const city = placeSite(g, 0, 'Free City', 2, 0)
    const brute = summonCard(g, 1, 'Bane of Aventis', 2, 0) // 4 power enemy in the city
    const lifeBefore = avatarOf(g, 0).life!
    act(g, 0, { t: 'activate', sourceId: city.id, ability: 'fc:attack' })
    answer(g, [brute.id]) // the city musters against the brute
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
    // the brute took 3; its 4-power counterstrike cost p0 four life; the site stands
    expect(g.units[brute.id]?.damage).toBe(3)
    expect(avatarOf(g, 0).life).toBe(lifeBefore - 4)
    expect(g.sites[city.id]).toBeDefined()
  })
})

describe('FAQ: Grim Reaper', () => {
  it('banishes its kill instead of death — no deathrite — plus all in-play copies', () => {
    const g = board()
    const reaper = summonCard(g, 0, 'Grim Reaper', 2, 0)
    reaper.modifiers.push({ kind: 'power', amount: 2, duration: 'permanent', turn: 0, sourcePlayer: 0 })
    const victim = summonCard(g, 1, 'Pookas', 2, 0) // has a deathrite (opponent discards)
    const twin = summonCard(g, 1, 'Pookas', 3, 0) // in-play copy elsewhere
    const handBefore = g.players[0].hand.length
    act(g, 0, { t: 'moveAttack', unitId: reaper.id, path: [], attack: { unit: victim.id } })
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
    expect(g.units[victim.id]).toBeUndefined()
    expect(g.units[twin.id]).toBeUndefined() // the copy was reaped too
    expect(g.players[1].banished).toContain(victim.cardId)
    expect(g.players[1].banished).toContain(twin.cardId)
    expect(g.players[1].cemetery).not.toContain(victim.cardId)
    expect(g.players[0].hand.length).toBe(handBefore) // deathrite never fired
  })
})

describe('FAQ: Horns of Behemoth', () => {
  it('keeps providing fire affinity after transforming into a Demon', () => {
    const g = board()
    const horns = placeSite(g, 0, 'Horns of Behemoth', 1, 0)
    const before = affinity(g, 0).fire
    expect(before).toBeGreaterThanOrEqual(1)
    // wake it (waive the 6-fire gate by transforming directly)
    getScript('Horns of Behemoth')!.abilities![0].effect(makeCtx(g, horns.id, 0, []))
    expect(g.sites[horns.id]).toBeUndefined()
    const demon = Object.values(g.units).find((u) => u.name === 'Horns of Behemoth')!
    expect(demon).toBeDefined()
    expect(effSubtypes(g, demon)).toContain('Demon')
    expect(affinity(g, 0).fire).toBe(before) // affinity survives the transformation
  })
})

describe('FAQ: Heirloom Lost', () => {
  it('banishes the site it replaces (not to the cemetery)', () => {
    const g = board()
    const relic = placeSite(g, 1, 'Bureau of Occult Control', 2, 3) // an Elite site
    const relicCard = relic.cardId
    const heirloom = injectToHand(g, 0, 'Heirloom Lost')
    avatarOf(g, 0).tapped = false
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: heirloom, x: 2, y: 3 })
    if (g.prompts.length) answer(g, false)
    expect(g.players[1].banished).toContain(relicCard)
    expect(g.players[1].cemetery).not.toContain(relicCard)
    expect(siteAt(g, 2, 3)?.name).toBe('Heirloom Lost')
    expect(siteAt(g, 2, 3)?.controller).toBe(1) // under THEIR control
  })
})

describe('FAQ: Ironclad', () => {
  it('reduces each damage SOURCE by 2, but life loss is untouched', () => {
    const g = board()
    const clad = avatarOf(g, 0)
    clad.name = 'Ironclad' as any
    const life = clad.life!
    dealDamageToUnit(g, clad, 2, 1) // one source of 2 → reduced to 0
    expect(clad.life).toBe(life)
    dealDamageToUnit(g, clad, 5, 1) // 5 − 2 = 3
    expect(clad.life).toBe(life - 3)
    loseLife(g, 0, 2) // life LOSS is not damage
    expect(clad.life).toBe(life - 5)
  })
})

describe('FAQ: Kingdom of Agartha', () => {
  it('with three earth affinity, minions may be SUMMONED underground', () => {
    const g = board()
    placeSite(g, 0, 'Kingdom of Agartha', 1, 0)
    // not enough earth yet? give plain earth sites until affinity ≥ 3
    while (affinity(g, 0).earth < 3) placeSite(g, 0, 'Rustic Village', 0, affinity(g, 0).earth)
    expect(validateSummonAt(g, 0, 'Foot Soldier 1', { x: 2, y: 0, region: 'underground' })).toBeNull()
  })
})

describe('FAQ: Island Leviathan', () => {
  it('awakens without summoning sickness and keeps providing water affinity', () => {
    const g = board()
    const isle = placeSite(g, 0, 'Island Leviathan', 1, 0)
    const waterBefore = affinity(g, 0).water
    getScript('Island Leviathan')!.abilities![0].effect(makeCtx(g, isle.id, 0, []))
    const monster = Object.values(g.units).find((u) => u.name === 'Island Leviathan')!
    expect(monster).toBeDefined()
    expect(monster.enteredTurn).toBeLessThan(g.turn) // no summoning sickness
    expect(siteAt(g, 1, 0)?.isRubble).toBe(true)
    expect(siteAt(g, 1, 0)?.flooded).toBe(true)
    // flooded rubble is uncontrolled: its +1 water doesn't reach p0, but the
    // Monster itself still provides the printed water affinity
    expect(affinity(g, 0).water).toBe(waterBefore)
  })
})

describe('FAQ: Kairos the Archivist', () => {
  it('restores archived sites by banishing whatever squatted on their square, and brings tokens back', () => {
    const g = board()
    const kairos = giveArtifact(g, avatarOf(g, 0), 'Kairos the Archivist')
    const skel = summonToken(g, 'Skeleton', 0, 2, 0)!
    const village = siteAt(g, 3, 0)!
    getScript('Kairos the Archivist')!.genesis!(makeCtx(g, kairos.id, 0, []))
    // after the archive: the skeleton dies, the village is destroyed and a
    // squatter site takes the square
    killUnit(g, skel.id)
    destroySite(g, village.id, 1)
    const rubble = siteAt(g, 3, 0)!
    delete g.sites[rubble.id]
    const squatter = placeSite(g, 1, 'Bureau of Occult Control', 3, 0)
    // Kairos dies → the realm rewinds
    getScript('Kairos the Archivist')!.deathrite!(makeCtx(g, kairos.id, 0, []))
    expect(siteAt(g, 3, 0)?.name).toBe('Simple Village') // restored
    expect(g.players[1].banished).toContain(squatter.cardId) // squatter banished
    expect(Object.values(g.units).some((u) => u.name === 'Skeleton' && u.x === 2)).toBe(true) // token returned
  })
})

describe('FAQ: Mismanaged Mortuary', () => {
  it('swaps cemetery access; an even number of mortuaries cancels out', () => {
    const g = board()
    const deadCard = `ctest${g.nextId++}`
    g.cards[deadCard] = { id: deadCard, name: 'Ghoul', owner: 0 }
    g.players[0].cemetery.push(deadCard)
    const m1 = placeSite(g, 0, 'Mismanaged Mortuary', 1, 0)
    getScript('Mismanaged Mortuary')!.genesis!(makeCtx(g, m1.id, 0, []))
    // p1 now treats p0's old cemetery as theirs
    expect(g.players[1].cemetery).toContain(deadCard)
    // a fresh death of p1's minion is accessible to p0 (the swap is live)
    const victim = summonCard(g, 1, 'Pookas', 3, 0)
    killUnit(g, victim.id)
    expect(g.players[0].cemetery).toContain(victim.cardId)
    // second mortuary: the paperwork cancels — everything reads normally again
    const m2 = placeSite(g, 0, 'Mismanaged Mortuary', 0, 0)
    getScript('Mismanaged Mortuary')!.genesis!(makeCtx(g, m2.id, 0, []))
    expect(g.players[0].cemetery).toContain(deadCard)
    expect(g.players[1].cemetery).toContain(victim.cardId)
    const victim2 = summonCard(g, 1, 'Pookas', 3, 0)
    killUnit(g, victim2.id)
    expect(g.players[1].cemetery).toContain(victim2.cardId) // owner's cemetery, no redirect
  })
})

describe('FAQ: Lord of Fear', () => {
  it('a lone defender is removed from the fight (enemies cannot defend alone)', () => {
    const g = board()
    summonCard(g, 0, 'Lord of Fear', 2, 0)
    const attacker = summonToken(g, 'Foot Soldier', 0, 3, 0)!
    attacker.enteredTurn = 0
    const target = summonToken(g, 'Foot Soldier', 1, 3, 0)!
    const wouldBe = summonToken(g, 'Foot Soldier', 1, 3, 0)!
    wouldBe.enteredTurn = 0
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: target.id } })
    answer(g, [wouldBe.id]) // tries to defend alone
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
    // fear stripped the lone defender: the original target took the hit instead
    expect(g.units[target.id]).toBeUndefined()
    expect(g.units[wouldBe.id]).toBeDefined()
  })
})

describe('FAQ: Saint of Redemption', () => {
  it('no minion is Evil while she stands — but types are KEPT', () => {
    const g = board()
    const ghoul = summonCard(g, 1, 'Ghoul', 2, 0)
    expect(isEvilUnit(g, ghoul)).toBe(true)
    summonCard(g, 0, 'Saint of Redemption', 3, 0)
    expect(isEvilUnit(g, ghoul)).toBe(false) // redeemed...
    expect(effSubtypes(g, ghoul)).toContain('Undead') // ...but still an Undead
  })
})

describe('FAQ: Stitched Abomination', () => {
  it('the damage dealer splits an instance across parts; lethal kills all parts', () => {
    const g = board()
    const abom = summonCard(g, 1, 'Stitched Abomination', 2, 0)
    g.flow = g.flow ?? {}
    g.flow.abomParts = { [abom.id]: [{ name: 'Pookas', damage: 0 }, { name: 'Ghoul', damage: 0 }] } // 2/2 + 3/3
    expect(effAttack(g, abom)).toBe(5)
    dealDamageToUnit(g, abom, 3, 0)
    answer(g, 'Pookas') // 3 damage: put some on the Pookas part...
    answer(g, '2') // exactly enough to kill it
    answer(g, 'Ghoul') // remaining 1 chips the Ghoul part
    expect(effAttack(g, abom)).toBe(3) // Pookas part gone
    expect(g.units[abom.id]).toBeDefined()
    // lethal wipes every part at once
    dealDamageToUnit(g, abom, 1, 0, { lethal: true })
    expect(g.units[abom.id]).toBeUndefined()
  })
})

describe('FAQ: The Tower of Babel', () => {
  it('building it merges the sites: (2) mana, (A)(E), both cards on destruction', () => {
    const g = board()
    const base = placeSite(g, 0, 'The Base of Babel', 1, 0)
    const baseCard = base.cardId
    const airBefore = affinity(g, 0).air
    const earthBefore = affinity(g, 0).earth
    const apexId = injectToHand(g, 0, 'The Apex of Babel')
    avatarOf(g, 0).tapped = false
    const manaBefore = g.players[0].mana
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: apexId, x: 1, y: 0 })
    while (g.prompts.length) answer(g, undefined) // decline the free cast offer
    const tower = siteAt(g, 1, 0)!
    expect(tower.name).toBe('The Apex of Babel')
    expect(tower.counters?.tower).toBe(1)
    // built bonus: 1 (site enters) + 1 (merged tower provides 2 total)
    expect(g.players[0].mana).toBe(manaBefore + 2)
    // merged thresholds: the Apex's air plus the Base's earth
    expect(affinity(g, 0).air).toBe(airBefore + 1)
    expect(affinity(g, 0).earth).toBe(earthBefore) // Base's (E) preserved through the merge
    // the Base is inside the tower, not in the cemetery
    expect(g.players[0].cemetery).not.toContain(baseCard)
    destroySite(g, tower.id, 1)
    expect(g.players[0].cemetery).toContain(baseCard) // both fall together
  })
})

describe('Codex: end-of-turn healing', () => {
  it('minions remove all damage during the end phase; avatars do not', () => {
    const g = board()
    const minion = summonCard(g, 0, 'Bane of Aventis', 2, 0)
    dealDamageToUnit(g, minion, 2, 1)
    const lifeBefore = avatarOf(g, 0).life!
    dealDamageToUnit(g, avatarOf(g, 0), 2, 1)
    expect(minion.damage).toBe(2)
    act(g, 0, { t: 'endTurn' })
    expect(g.units[minion.id]?.damage).toBe(0) // healed with the end phase
    expect(avatarOf(g, 0).life).toBe(lifeBefore - 2) // avatars keep their wounds
  })
})

describe('FAQ: Order of the White Wing', () => {
  it('a conjured minion never enters the realm — no genesis fires', () => {
    const g = board()
    summonCard(g, 0, 'Order of the White Wing', 2, 0)
    // p1 tries to raise a Pookas next door via a non-hand summon
    const raised = summonCard(g, 1, 'Pookas', 3, 0)
    const handBefore = g.players[0].hand.length
    emitUnitEnters(g, raised)
    expect(g.units[raised.id]).toBeUndefined() // turned away pre-entry
    expect(g.players[1].banished).toContain(raised.cardId)
    expect(g.players[0].hand.length).toBe(handBefore) // no deathrite side effects either
  })
})

describe('FAQ: Vindictive Nation', () => {
  it('flooding a nearby allied site costs the flooder 1 life (modify)', () => {
    const g = board()
    placeSite(g, 0, 'Vindictive Nation', 2, 0) // p0's nation next to p0's villages
    const lifeBefore = avatarOf(g, 1).life!
    const target = siteAt(g, 3, 0)!
    const ctx = makeCtx(g, 'none', 1, [])
    ctx.floodSite(target.id)
    expect(avatarOf(g, 1).life).toBe(lifeBefore - 1)
  })
})

describe('Codex: Automatons are minions AND artifacts', () => {
  it('an automaton is cast as a unit with combat stats', () => {
    const g = board()
    expect(getCard('Crave Golem').type).toBe('Minion')
    waiveThreshold(g, 0)
    const id = injectToHand(g, 0, 'Clay Golem')
    giveMana(g, 0, 10)
    act(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    const golem = Object.values(g.units).find((u) => u.name === 'Clay Golem')!
    expect(golem).toBeDefined()
    expect(effAttack(g, golem)).toBe(3)
    expect(g.artifacts[golem.id]).toBeUndefined() // not an ArtifactState
  })

  it('artifact-destruction (Unravel) reaches automatons — ward-aware', () => {
    const g = board()
    const talus = summonCard(g, 1, 'Iron Man Talus', 2, 0)
    talus.ward = true
    avatarOf(g, 0).x = 2
    avatarOf(g, 0).y = 0
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Unravel', { targets: ['sq:2,0,surface'] })
    expect(g.units[talus.id]).toBeDefined() // the ward ate the destruction
    expect(g.units[talus.id]?.ward).toBeFalsy()
    castMagic(g, 0, 'Unravel', { targets: ['sq:2,0,surface'] })
    expect(g.units[talus.id]).toBeUndefined() // unraveled with the artifacts
  })

  it('Acid Rain silences automatons in its area', () => {
    const g = board()
    const golem = summonCard(g, 0, 'Purge Juggernaut', 2, 0)
    waiveThreshold(g, 1)
    g.activePlayer = 1
    const rain = injectToHand(g, 1, 'Acid Rain')
    giveMana(g, 1, 10)
    act(g, 1, { t: 'castSpell', cardId: rain, casterId: g.players[1].avatarUnitId, at: { x: 2, y: 0 } })
    checkStateBased(g)
    expect(g.units[golem.id]?.silenced).toBe(true)
  })

  it('automatons are not carriable — Telekinesis cannot snatch one', () => {
    const g = board()
    const talus = summonCard(g, 1, 'Iron Man Talus', 2, 0)
    avatarOf(g, 0).x = 2
    avatarOf(g, 0).y = 0
    waiveThreshold(g, 0)
    const err = castMagicFail(g, 0, 'Telekinesis', { targets: [talus.id] })
    expect(err).toMatch(/not a legal target/i)
  })
})

describe('FAQ: "provides" mana on entry (Cores, Älvalinne Dryads)', () => {
  it('a summoned Dryads provides its mana immediately, and again each turn start', () => {
    const g = board()
    giveMana(g, 0, 5)
    waiveThreshold(g, 0)
    const id = injectToHand(g, 0, 'Älvalinne Dryads')
    const before = g.players[0].mana
    act(g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 0 } })
    expect(g.players[0].mana).toBe(before - 2 + 1) // paid 2, provided 1 on entry
    act(g, 0, { t: 'endTurn' })
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'drawDeck' ? 'spellbook' : true)
    act(g, 1, { t: 'endTurn' })
    if (g.prompts.length) answer(g, 'spellbook')
    // start of p0's next turn: 2 sites + 1 dryads = 3
    expect(g.players[0].mana).toBe(3)
  })
})

describe('Sites with printed Ward (Blessed Well)', () => {
  it('enter the realm warded; the ward eats the first strike', () => {
    const g = board()
    const well = injectToHand(g, 0, 'Blessed Well')
    avatarOf(g, 0).tapped = false
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: well, x: 1, y: 0 })
    const site = siteAt(g, 1, 0)!
    expect(site.name).toBe('Blessed Well')
    expect(site.ward).toBe(true)
    // an enemy strike breaks the ward instead of costing life
    const raider = summonToken(g, 'Foot Soldier', 1, 1, 0)!
    raider.enteredTurn = 0
    g.activePlayer = 1
    const life = avatarOf(g, 0).life!
    act(g, 1, { t: 'moveAttack', unitId: raider.id, path: [], attack: { site: site.id } })
    while (g.prompts.length) answer(g, g.prompts[0].kind === 'defend' ? [] : true)
    expect(avatarOf(g, 0).life).toBe(life) // ward ate it
    expect(siteAt(g, 1, 0)?.ward).toBeFalsy()
  })
})

// ============================================================================
// Spell-vs-Site hand-selection class fix (rulebook: "any card in your hand that
// is not a site is a spell"). Texts that say "discard/cast a spell" must never
// offer a site; id-based prompt resolution throughout.
// ============================================================================

describe("Wizard's Den: 'Discard a spell' when first attacked — never a site", () => {
  // RED→GREEN proof (documented): revert m38.ts so onSiteDamaged asks with the
  // whole hand + resolves the choice as a hand index, and this test goes red on
  // two counts — the candidate list contains the site names, and answering [0]
  // (a spell candidate) discards whatever sits at hand index 0 (a site). With
  // the id-based, spellsOnly fix it is green: only spells are offered and the
  // exact chosen spell id leaves the hand.
  function setup() {
    const g = board()
    const p = g.players[0]
    p.hand = [] // control the hand exactly: 2 spells + 2 sites
    const fireball = injectToHand(g, 0, 'Fireball')
    const drown = injectToHand(g, 0, 'Drown')
    const flood = injectToHand(g, 0, 'Floodplain')
    const rustic = injectToHand(g, 0, 'Rustic Village')
    const den = placeSite(g, 0, "Wizard's Den", 1, 0)
    return { g, den, fireball, drown, flood, rustic }
  }

  it('offers ONLY the two spells; discards the chosen spell by id; sites stay in hand', () => {
    const { g, den, fireball, drown, flood, rustic } = setup()
    getScript("Wizard's Den")!.onSiteDamaged!(makeCtx(g, den.id, 0, []), den, 1, 1)
    const prompt = g.prompts[0] as any
    expect(prompt?.kind).toBe('chooseCards')
    // candidates = spell names only (no site names)
    expect([...prompt.data.cards].sort()).toEqual(['Drown', 'Fireball'])
    // id-based resolution: pick candidate index 1 (Fireball, drown sorted first
    // in display but candidate order follows hand order: Fireball then Drown)
    const idx = (prompt.data.cards as string[]).indexOf('Drown')
    answer(g, [idx])
    expect(g.players[0].cemetery).toContain(drown) // the chosen spell, by id
    expect(g.players[0].hand).toContain(fireball) // other spell stays
    expect(g.players[0].hand).toContain(flood) // sites untouched
    expect(g.players[0].hand).toContain(rustic)
    void den
  })

  it('a hand of ONLY sites → the "discard a spell" instruction fizzles (no prompt, nothing discarded)', () => {
    const g = board()
    const p = g.players[0]
    p.hand = []
    injectToHand(g, 0, 'Floodplain')
    injectToHand(g, 0, 'Rustic Village')
    const cemBefore = p.cemetery.length
    const den = placeSite(g, 0, "Wizard's Den", 1, 0)
    getScript("Wizard's Den")!.onSiteDamaged!(makeCtx(g, den.id, 0, []), den, 1, 1)
    expect(g.prompts.length).toBe(0) // no spell → nothing to ask
    expect(p.cemetery.length).toBe(cemBefore) // no site discarded
    expect(p.hand.length).toBe(2) // both sites remain
  })

  it('only raids once (denRaided latch preserved)', () => {
    const { g, den } = setup()
    getScript("Wizard's Den")!.onSiteDamaged!(makeCtx(g, den.id, 0, []), den, 1, 1)
    expect(g.prompts.length).toBe(1)
    answer(g, [0])
    getScript("Wizard's Den")!.onSiteDamaged!(makeCtx(g, den.id, 0, []), den, 1, 1)
    expect(g.prompts.length).toBe(0) // second attack does not re-trigger
  })
})

describe('discardRandom spellsOnly: random discard never hits a site', () => {
  it('plain random (no charm) only ever discards a spell', () => {
    // run across many seeds; a site must never land in the cemetery
    for (let seed = 1; seed <= 30; seed++) {
      const g = newGame(seed)
      keepBoth(g)
      const p = g.players[0]
      p.hand = []
      const spellA = injectToHand(g, 0, 'Fireball')
      const spellB = injectToHand(g, 0, 'Drown')
      injectToHand(g, 0, 'Floodplain')
      injectToHand(g, 0, 'Rustic Village')
      makeCtx(g, 'none', 0, []).discardRandom(0, { spellsOnly: true })
      expect(g.prompts.length).toBe(0) // no Lucky Charm → resolves silently
      const discarded = p.cemetery[p.cemetery.length - 1]
      expect([spellA, spellB]).toContain(discarded) // a spell, never a site
    }
  })

  it('Lucky Charm chooser path is offered ONLY spells', () => {
    const g = board()
    const p = g.players[0]
    p.hand = []
    injectToHand(g, 0, 'Fireball')
    injectToHand(g, 0, 'Drown')
    injectToHand(g, 0, 'Floodplain')
    const bearer = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    giveArtifact(g, bearer, 'Lucky Charm')
    makeCtx(g, 'none', 0, []).discardRandom(0, { spellsOnly: true })
    const prompt = g.prompts[0] as any
    expect(prompt?.kind).toBe('chooseCards')
    // charm rolls count+1 = 2 candidates, both must be spells (no Floodplain)
    for (const name of prompt.data.cards as string[]) {
      expect(getCard(name).type).not.toBe('Site')
    }
  })

  it('default (no spellsOnly) still offers the whole hand — "discard a random card"', () => {
    const g = board()
    const p = g.players[0]
    p.hand = []
    injectToHand(g, 0, 'Fireball')
    injectToHand(g, 0, 'Floodplain')
    const bearer = summonToken(g, 'Foot Soldier', 0, 2, 0)!
    giveArtifact(g, bearer, 'Lucky Charm')
    makeCtx(g, 'none', 0, []).discardRandom(0)
    const prompt = g.prompts[0] as any
    expect(prompt?.kind).toBe('chooseCards')
    expect((prompt.data.cards as string[]).length).toBe(2) // site included
  })
})

describe('Sisters of Avalon: Genesis discard-a-spell never offers a site', () => {
  it('offers only spells and draws a spell after the discard', () => {
    const g = board()
    const p = g.players[0]
    p.hand = []
    injectToHand(g, 0, 'Fireball')
    injectToHand(g, 0, 'Floodplain')
    const spellbookBefore = p.spellbook.length
    const sisters = summonToken(g, 'Sisters of Avalon', 0, 2, 0)!
    getScript('Sisters of Avalon')!.genesis!(makeCtx(g, sisters.id, 0, []))
    const prompt = g.prompts[0] as any
    expect(prompt?.kind).toBe('chooseCards')
    expect([...prompt.data.cards]).toEqual(['Fireball']) // site excluded
    answer(g, [0])
    expect(p.cemetery.some((id) => g.cards[id].name === 'Fireball')).toBe(true)
    expect(p.hand.some((id) => g.cards[id].name === 'Floodplain')).toBe(true) // site stays
    expect(p.spellbook.length).toBe(spellbookBefore - 1) // drew a spell
  })
})

describe('Unseelie Court: start-of-turn discard-a-spell-per-Faerie excludes sites', () => {
  it('offers only spells; discards the chosen spell by id', () => {
    const g = board()
    const p = g.players[0]
    p.hand = []
    injectToHand(g, 0, 'Fireball')
    injectToHand(g, 0, 'Drown')
    injectToHand(g, 0, 'Floodplain')
    // Unseelie Court is itself a Faerie, so its presence drives n >= 1.
    const court = summonToken(g, 'Unseelie Court', 0, 2, 0)!
    getScript('Unseelie Court')!.startOfTurn!(makeCtx(g, court.id, 0, []))
    const prompt = g.prompts[0] as any
    expect(prompt?.kind).toBe('chooseCards')
    for (const name of prompt.data.cards as string[]) expect(getCard(name).type).not.toBe('Site')
    const idx = (prompt.data.cards as string[]).indexOf('Drown')
    answer(g, [idx >= 0 ? idx : 0])
    expect(p.hand.some((id) => g.cards[id].name === 'Floodplain')).toBe(true) // site never discarded
  })
})

describe('The Apex of Babel: "cast a spell for free" never offers a site', () => {
  it('offers only spells among the hand candidates', () => {
    const g = board()
    const p = g.players[0]
    const base = placeSite(g, 0, 'The Base of Babel', 1, 0)
    void base
    p.hand = []
    injectToHand(g, 0, 'Fireball')
    injectToHand(g, 0, 'Floodplain')
    const apexId = injectToHand(g, 0, 'The Apex of Babel')
    avatarOf(g, 0).tapped = false
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: apexId, x: 1, y: 0 })
    // find the free-cast prompt (there may be a build side-effect prompt first)
    const prompt = g.prompts.find((pr) => pr.kind === 'chooseCards') as any
    expect(prompt).toBeDefined()
    for (const name of prompt.data.cards as string[]) {
      if (name === 'The Apex of Babel') continue // already left the hand on build
      expect(getCard(name).type).not.toBe('Site')
    }
    expect((prompt.data.cards as string[])).not.toContain('Floodplain')
  })
})

describe('Mephistopheles — avatar replacement vs the Lethal keyword (FAQ)', () => {
  // FAQ: "If you cast Mephistopheles, your Avatar is banished. Mephistopheles is
  // now your Avatar. ... he's no longer a minion and only an Avatar." And: "If you
  // manage to summon Mephistopheles without casting him, then he will not replace
  // your avatar." Lethal kills MINIONS only — so it kills a non-cast Mephisto but
  // merely chips a cast one.

  /** decline defends / drain start-of-turn prompts so a strike resolves */
  function drain(g: GameState): void {
    let guard = 0
    while (g.prompts.length && guard++ < 12) {
      const k = g.prompts[0].kind
      answer(g, k === 'defend' ? [] : k === 'intercept' ? null : k === 'drawDeck' ? 'spellbook' : k === 'stayInFight' ? true : null)
    }
  }

  it('CAST Mephistopheles: replaces the avatar; a Lethal striker only chips his life', () => {
    const g = newGame(7)
    keepBoth(g)
    const oldAv = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', oldAv.x, oldAv.y)
    const meph = injectToHand(g, 0, 'Mephistopheles')
    giveMana(g, 0, 12)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: meph, casterId: oldAv.id, at: { x: oldAv.x, y: oldAv.y, region: 'surface' } })
    const mephU = Object.values(g.units).find((u) => u.name === 'Mephistopheles')!
    expect(g.players[0].avatarUnitId).toBe(mephU.id) // he IS the avatar now
    expect(mephU.isAvatar).toBe(true)
    expect(g.units[oldAv.id]).toBeUndefined() // the old avatar is gone (banished)

    act(g, 0, { t: 'endTurn' })
    drain(g)
    const scorp = summonCard(g, 1, 'Sirocco Scorpions', mephU.x, mephU.y)
    const lifeBefore = mephU.life ?? 0
    act(g, 1, { t: 'moveAttack', unitId: scorp.id, path: [], attack: { unit: mephU.id } })
    drain(g)
    expect(g.units[mephU.id]).toBeDefined() // Lethal did NOT execute an avatar
    expect(mephU.life!).toBeLessThan(lifeBefore) // the strike landed as normal damage
    expect(mephU.life!).toBeGreaterThan(0)
    expect(g.phase).not.toBe('over')
  })

  it('NON-CAST Mephistopheles: no replacement, still a minion — Lethal kills him', () => {
    const g = newGame(7)
    keepBoth(g)
    const avId = g.players[0].avatarUnitId
    const meph = summonCard(g, 0, 'Mephistopheles', 2, 1) // entered without being cast
    expect(g.players[0].avatarUnitId).toBe(avId) // avatar unchanged (FAQ)
    expect(meph.isAvatar).not.toBe(true)

    act(g, 0, { t: 'endTurn' })
    drain(g)
    const scorp = summonCard(g, 1, 'Sirocco Scorpions', meph.x, meph.y)
    act(g, 1, { t: 'moveAttack', unitId: scorp.id, path: [], attack: { unit: meph.id } })
    drain(g)
    expect(g.units[meph.id]).toBeUndefined() // a minion again — Lethal executes it
  })

  // FAQ (Golgor entry, faq_dump.md:1953): when Mephistopheles replaces your
  // Avatar, "Your current AND maximum life remain the same." The engine derives an
  // Avatar's max life from its card name (getCard(name).life), but Mephistopheles
  // is a Minion card with no `life`, so without persisting the original maximum the
  // cap silently collapsed to the default 20. Every avatar in the data prints
  // life=20, so we manufacture a non-20 maximum on the old avatar first (as an
  // effect that raised the cap would) and assert it survives the swap.
  it('inherits the original avatar MAXIMUM life, not Mephisto\'s minion default (FAQ 1953)', () => {
    const g = newGame(7)
    keepBoth(g)
    const oldAv = avatarOf(g, 0)
    oldAv.counters = { ...(oldAv.counters ?? {}), maxLife: 25 } // an effect raised the cap
    oldAv.life = 10 // and the avatar has since been damaged down to 10
    placeSite(g, 0, 'Rustic Village', oldAv.x, oldAv.y)
    const meph = injectToHand(g, 0, 'Mephistopheles')
    giveMana(g, 0, 12)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: meph, casterId: oldAv.id, at: { x: oldAv.x, y: oldAv.y, region: 'surface' } })
    const mephU = Object.values(g.units).find((u) => u.name === 'Mephistopheles')!
    expect(g.players[0].avatarUnitId).toBe(mephU.id)
    expect(mephU.life).toBe(10) // CURRENT life is inherited unchanged
    expect(mephU.counters?.maxLife).toBe(25) // and so is the MAXIMUM

    // healing tops out at the ORIGINAL maximum (25), never Mephisto's default 20
    gainLife(g, 0, 100)
    expect(mephU.life).toBe(25)
  })
})

// FAQ 745/752 + 1242 (Golden Dawn): "Genesis → Triggers when the card enters the
// realm" is NOT cast-specific. A minion reanimated / effect-summoned into the realm
// must fire its Genesis. Raise Dead ("Summon a random dead minion") placed the
// minion directly and never fired its Genesis before this fix — so this test goes
// RED on the old engine and GREEN once effect-entries route through effectSummonUnit.
// (Proven once by reverting the helper wiring: the enemy takes 0 damage, this fails;
// re-applying restores the 1 damage and it passes.)
describe('Genesis fires on effect-summon entry, not just casts (FAQ 745/752/1242)', () => {
  it('Raise Dead reanimates a Static Servant → its Genesis damages the co-located enemy', () => {
    const g = newGame(7)
    keepBoth(g)
    // a single dead minion so Raise Dead's random pick is deterministic
    const deadId = `ctest${g.nextId++}`
    g.cards[deadId] = { id: deadId, name: 'Static Servant', owner: 0 }
    g.players[0].cemetery.push(deadId)
    // an enemy sitting where the Servant will rise (Static Servant genesis: "Each
    // other unit here takes 1 damage")
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const victim = summonCard(g, 1, 'Sirocco Scorpions', 2, 2)
    expect(victim.damage).toBe(0)

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Raise Dead')
    // Raise Dead asks where to summon the risen minion
    answer(g, { x: 2, y: 2 })

    const servant = Object.values(g.units).find((u) => u.name === 'Static Servant')
    expect(servant).toBeDefined() // it entered the realm
    expect(victim.damage).toBe(1) // and its Genesis fired on the effect-summon
  })
})

describe('copies vs transforms — genesis semantics (FAQ)', () => {
  // Ruling set: Genesis fires on ENTRY. "Enters/summoned AS a copy" (Evil Twin,
  // Selfsame Simulacrum) IS an entry as the copied card, so the copied Genesis
  // fires (Selfsame FAQ: "Does it copy Genesis abilities? A: Yes"; "basic copy" =
  // printed characteristics). A TRANSFORM of an in-realm unit (Monstermorphosis
  // class) is NOT an entry: same unit id, no genesis, no enter-triggers.

  it("Evil Twin enters AS the copy — the copied minion's Genesis fires", () => {
    const g = newGame(7)
    keepBoth(g)
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', av.x, av.y)
    const servant = summonCard(g, 1, 'Static Servant', 4, 3) // model (no genesis fired: helper is direct)
    const bystander = summonCard(g, 0, 'Foot Soldier', av.x, av.y) // observer at the twin's entry square
    const twin = injectToHand(g, 0, 'Evil Twin')
    giveMana(g, 0, 12)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: twin, casterId: av.id, at: { x: av.x, y: av.y, region: 'surface' }, targets: [servant.id] })
    const twinU = Object.values(g.units).find((u) => u.controller === 0 && u.name === 'Static Servant')
    expect(twinU).toBeDefined() // it wears the copied face
    expect(bystander.damage).toBe(1) // Static Servant's "Genesis → each other unit here takes 1" fired at the twin's square
  })

  it("Selfsame Simulacrum summoned as a basic copy — copied Genesis fires (FAQ: 'Does it copy Genesis abilities? Yes')", () => {
    const g = newGame(7)
    keepBoth(g)
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', av.x, av.y)
    const model = summonCard(g, 0, 'Static Servant', av.x + 1, av.y + 1) // nearby the summon square
    const bystander = summonCard(g, 0, 'Foot Soldier', av.x, av.y)
    const sim = injectToHand(g, 0, 'Selfsame Simulacrum')
    giveMana(g, 0, 12)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: sim, casterId: av.id, at: { x: av.x, y: av.y, region: 'surface' } })
    expect(g.prompts[0]?.kind).toBe('chooseTargets') // "mirrors which nearby minion?"
    answer(g, [model.id])
    const simU = Object.values(g.units).find((u) => u.controller === 0 && u.name === 'Static Servant' && u.id !== model.id)
    expect(simU).toBeDefined()
    expect(bystander.damage).toBe(1) // the copied Genesis fired on summon
  })

  it('a TRANSFORM into a genesis minion fires NOTHING and keeps the unit id (Monstermorphosis)', () => {
    const g = newGame(7)
    keepBoth(g)
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', av.x, av.y)
    const victim = summonCard(g, 1, 'Foot Soldier', av.x + 1, av.y) // nearby enemy minion
    const victimId = victim.id
    injectToHand(g, 0, 'Great Old One') // Monster with "Genesis → Permanently flood the entire realm"
    const morph = injectToHand(g, 0, 'Monstermorphosis')
    giveMana(g, 0, 12)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: morph, casterId: av.id, targets: [victim.id] })
    expect(victim.disabled).toBe(true) // in the chrysalis
    // cycle to our next turn start, answering the emerge prompt with the Monster
    act(g, 0, { t: 'endTurn' })
    let guard = 0
    let transformed = false
    while (guard++ < 20) {
      const pr = g.prompts[0]
      if (!pr) {
        if (g.activePlayer === 1 && g.phase === 'main') { act(g, 1, { t: 'endTurn' }); continue }
        break
      }
      if (pr.kind === 'chooseOption' && (pr.data?.options ?? []).includes('Great Old One')) {
        answer(g, 'Great Old One')
        transformed = true
        continue
      }
      answer(g, pr.kind === 'drawDeck' ? 'spellbook' : pr.kind === 'defend' ? [] : null)
    }
    expect(transformed).toBe(true)
    const after = g.units[victimId]
    expect(after).toBeDefined()
    expect(after.name).toBe('Great Old One') // in-place transform, SAME unit id
    // the transform is NOT an entry: Great Old One's realm-flooding Genesis must NOT fire
    for (const s of Object.values(g.sites)) expect(s.flooded ?? false).toBe(false)
  })
})

describe('Evil Twin — retained properties after copying', () => {
  it('stays Evil; strikes first ONLY against the minion it copied, nothing else', () => {
    const g = newGame(7)
    keepBoth(g)
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', av.x, av.y)
    const model = summonCard(g, 1, 'Foot Soldier', 4, 3) // not Evil, no strike first
    expect(isEvilUnit(g, model)).toBe(false)
    const twin = injectToHand(g, 0, 'Evil Twin')
    giveMana(g, 0, 12)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: twin, casterId: av.id, at: { x: av.x, y: av.y, region: 'surface' }, targets: [model.id] })
    const twinU = Object.values(g.units).find((u) => u.controller === 0 && u.counters?.evilTwin)!
    expect(twinU).toBeDefined()
    expect(twinU.name).toBe('Foot Soldier') // it copied the shape...
    expect(isEvilUnit(g, twinU)).toBe(true) // ...but remains an EVIL copy (targetable by Evil-hunters)
    expect(effKeywords(g, twinU).strikeFirst ?? false).toBe(false) // NOT a blanket keyword

    // fight 1 — vs the ORIGINAL: the twin strikes first (1/1 vs 1/1: the original
    // dies in the strike-first pass and never strikes back)
    twinU.x = model.x; twinU.y = model.y; twinU.region = model.region
    twinU.enteredTurn = 0
    act(g, 0, { t: 'moveAttack', unitId: twinU.id, path: [], attack: { unit: model.id } })
    let guard = 0
    while (g.prompts.length && guard++ < 8) answer(g, g.prompts[0].kind === 'defend' ? [] : null)
    expect(g.units[model.id]).toBeUndefined() // the original died first
    expect(g.units[twinU.id]).toBeDefined()
    expect(twinU.damage).toBe(0) // untouched — it struck FIRST

    // fight 2 — vs anyone ELSE: a plain simultaneous trade (both 1/1s die)
    const other = summonCard(g, 1, 'Foot Soldier', twinU.x, twinU.y)
    twinU.tapped = false
    act(g, 0, { t: 'moveAttack', unitId: twinU.id, path: [], attack: { unit: other.id } })
    guard = 0
    while (g.prompts.length && guard++ < 8) answer(g, g.prompts[0].kind === 'defend' ? [] : null)
    expect(g.units[other.id]).toBeUndefined() // both struck simultaneously —
    expect(g.units[twinU.id]).toBeUndefined() // — and both died: no strike-first here
    // rulebook: "Evil minions can`t be warded" — staying Evil also means staying unwardable
  })
})

// rulebook_dump.md:362 "[Keyword: Evil] … Evil minions can't be warded." and :500
// "A unit or site can't have multiple Wards, and Evil minions can't be warded."
// All ward-GRANTING flows funnel through wardUnit() (effects.ts), the single
// arbiter of these two clauses; keyword-granted wards on Evil minions are stripped
// in effKeywords(). These tests pin the whole surface.
describe("rulebook: Evil minions can't be warded (central wardUnit arbiter)", () => {
  it("a real card effect (Savior's blessing) REFUSES to ward a Demon; nothing warded, refusal logged", () => {
    const g = newGame(7)
    keepBoth(g)
    // Asmodeus is a Demon (Evil). Enter it this turn so it satisfies Savior's filter.
    const demon = summonCard(g, 0, 'Asmodeus', 3, 3)
    demon.enteredTurn = g.turn
    expect(isEvilUnit(g, demon)).toBe(true)
    const savior = summonCard(g, 0, 'Savior', 3, 4)
    const before = g.log.length
    // fire Savior's "① → Ward a minion summoned this turn" straight at the Demon
    getScript('Savior')!.abilities![0].effect!(makeCtx(g, savior.id, 0, [{ unit: demon.id }]))
    expect(demon.ward ?? false).toBe(false) // the Demon is NOT warded
    // and the refusal is logged by wardUnit
    const logged = g.log.slice(before).some((l) => /Asmodeus is Evil — it cannot be warded\./.test(l.msg))
    expect(logged).toBe(true)
    // RED→GREEN PROOF: revert m30.ts:31 from `if (wardUnit(ctx.state, u))` back to a
    // direct `u.ward = true` and this goes RED (Demon gets warded, no refusal log);
    // restoring the wardUnit call turns it GREEN. Verified once by the author.
  })

  it('Evil Twin copying a NON-Evil minion still cannot be warded (counters.evilTwin ⇒ Evil)', () => {
    const g = newGame(7)
    keepBoth(g)
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', av.x, av.y)
    const model = summonCard(g, 1, 'Foot Soldier', 4, 3) // Mortal — not Evil
    expect(isEvilUnit(g, model)).toBe(false)
    const twin = injectToHand(g, 0, 'Evil Twin')
    giveMana(g, 0, 12)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: twin, casterId: av.id, at: { x: av.x, y: av.y, region: 'surface' }, targets: [model.id] })
    const twinU = Object.values(g.units).find((u) => u.controller === 0 && u.counters?.evilTwin)!
    expect(twinU).toBeDefined()
    expect(isEvilUnit(g, twinU)).toBe(true) // the copy is Evil despite wearing a Mortal face
    expect(wardUnit(g, twinU)).toBe(false) // refused
    expect(twinU.ward ?? false).toBe(false)
  })

  it('Mephistopheles AS AVATAR (cast replacement) CAN be warded — an Avatar is not a minion (FAQ 1953)', () => {
    const g = newGame(7)
    keepBoth(g)
    const oldAv = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', oldAv.x, oldAv.y)
    const meph = injectToHand(g, 0, 'Mephistopheles')
    giveMana(g, 0, 12)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: meph, casterId: oldAv.id, at: { x: oldAv.x, y: oldAv.y, region: 'surface' } })
    const mephU = Object.values(g.units).find((u) => u.name === 'Mephistopheles')!
    expect(mephU.isAvatar).toBe(true)
    expect(isEvilUnit(g, mephU)).toBe(true) // he STAYS an Evil Demon Avatar (FAQ 1953)
    expect(wardUnit(g, mephU)).toBe(true) // …but "Evil minions can't be warded" is minion-only, so as an AVATAR he CAN be warded
    expect(mephU.ward).toBe(true)
  })

  it('a plain (non-Evil) Avatar CAN be warded, and its granted ward keyword survives', () => {
    const g = newGame(7)
    keepBoth(g)
    const av = avatarOf(g, 0) // a starter avatar (not Demon-typed)
    expect(wardUnit(g, av)).toBe(true) // avatars are wardable
    expect(av.ward).toBe(true)
    // a keyword-granted Ward on an avatar is NOT stripped (only Evil MINIONS lose it)
    const av2 = avatarOf(g, 1)
    av2.modifiers.push({ kind: 'keyword', keyword: 'ward', duration: 'permanent', turn: g.turn, sourcePlayer: 1 })
    expect(effKeywords(g, av2).ward).toBe(true)
  })

  it('no ward stacking — a second wardUnit on an already-warded unit is a no-op', () => {
    const g = newGame(7)
    keepBoth(g)
    const soldier = summonCard(g, 0, 'Foot Soldier', 2, 2)
    expect(wardUnit(g, soldier)).toBe(true) // first ward lands
    expect(soldier.ward).toBe(true)
    expect(wardUnit(g, soldier)).toBe(false) // second refused (single-Ward clause)
    expect(soldier.ward).toBe(true) // still exactly one ward
  })

  it('keyword-granted Ward on an Evil minion is suppressed (effKeywords(...).ward falsy)', () => {
    const g = newGame(7)
    keepBoth(g)
    const demon = summonCard(g, 0, 'Asmodeus', 3, 3) // Demon
    expect(isEvilUnit(g, demon)).toBe(true)
    // a modifier granting the Ward keyword (as grantKeyword / a "gains Ward" grant would)
    demon.modifiers.push({ kind: 'keyword', keyword: 'ward', duration: 'permanent', turn: g.turn, sourcePlayer: 0 })
    expect(effKeywords(g, demon).ward ?? false).toBe(false) // stripped for Evil minions
    // sanity: the same grant on a NON-Evil minion DOES yield Ward
    const soldier = summonCard(g, 0, 'Foot Soldier', 2, 2)
    soldier.modifiers.push({ kind: 'keyword', keyword: 'ward', duration: 'permanent', turn: g.turn, sourcePlayer: 0 })
    expect(effKeywords(g, soldier).ward).toBe(true)
  })
})

describe('Evil Twin copying a printed-Ward minion', () => {
  it('the copied Ward is simply ignored — no ward, no crash, damage lands', () => {
    const g = newGame(7)
    keepBoth(g)
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', av.x, av.y)
    const model = summonCard(g, 1, 'Holy Warrior', 4, 3) // printed text: just "Ward"
    const twin = injectToHand(g, 0, 'Evil Twin')
    giveMana(g, 0, 12)
    waiveThreshold(g, 0)
    // the cast itself must not throw (act() would fail the test on a crash)
    act(g, 0, { t: 'castSpell', cardId: twin, casterId: av.id, at: { x: av.x, y: av.y, region: 'surface' }, targets: [model.id] })
    const twinU = Object.values(g.units).find((u) => u.controller === 0 && u.counters?.evilTwin)!
    expect(twinU).toBeDefined()
    expect(twinU.name).toBe('Holy Warrior')
    expect(isEvilUnit(g, twinU)).toBe(true) // still an EVIL copy
    // both ward paths stay empty: the entry flag was never seeded, and the copied
    // printed Ward keyword is stripped for Evil minions in effKeywords
    expect(twinU.ward ?? false).toBe(false)
    expect(effKeywords(g, twinU).ward ?? false).toBe(false)
    // and functionally: enemy damage LANDS instead of breaking a ward
    dealDamageToUnit(g, twinU, 1, 1)
    expect(twinU.damage).toBe(1)
    // (the real Holy Warrior, not being Evil, keeps its printed Ward)
    expect(effKeywords(g, model).ward).toBe(true)
  })
})

describe('Stealth is a spendable token (rulebook: lost after the minion interacts)', () => {
  it('a Ranged unit shooting loses Stealth', () => {
    const g = newGame(7)
    keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const archer = summonCard(g, 0, 'Belmotte Longbowmen', 2, 1)
    archer.stealth = true
    act(g, 0, { t: 'activate', sourceId: archer.id, ability: 'ranged', extra: { direction: 'e' } })
    expect(archer.stealth).toBe(false) // the shot IS an interaction — token spent
  })

  it('printed Stealth does NOT come back: the second attack is defendable', () => {
    const g = newGame(7)
    keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 1) // ground under the fight square
    placeSite(g, 1, 'Simple Village', 2, 2) // ...and under the guard, so it can step in
    const thieves = summonCard(g, 0, 'Band of Thieves', 2, 1) // printed Stealth
    thieves.stealth = true // summonCard bypasses casting; a real cast seeds this (casting.ts)
    const victim1 = summonCard(g, 1, 'Foot Soldier', 2, 1)
    const guard = summonCard(g, 1, 'Foot Soldier', 2, 2) // a would-be defender nearby
    // attack 1 — stealthy: NO defend window opens, the token is spent on this attack
    act(g, 0, { t: 'moveAttack', unitId: thieves.id, path: [], attack: { unit: victim1.id } })
    expect(g.prompts.find((p) => p.kind === 'defend')).toBeUndefined()
    let guard1 = 0
    while (g.prompts.length && guard1++ < 8) answer(g, g.prompts[0].kind === 'defend' ? [] : null)
    expect(thieves.stealth).toBe(false)
    // attack 2 — revealed: the printed keyword must NOT make it undefendable again
    const victim2 = summonCard(g, 1, 'Foot Soldier', 2, 1)
    thieves.tapped = false
    thieves.damage = 0
    act(g, 0, { t: 'moveAttack', unitId: thieves.id, path: [], attack: { unit: victim2.id } })
    expect(g.prompts[0]?.kind).toBe('defend') // the guard gets its window now
    answer(g, [guard.id])
    expect(guard).toBeDefined()
  })

  it('Dragonlord in Draco Corvus form gains Airborne but NOT Stealth (FAQ)', () => {
    const g = newGame(7)
    keepBoth(g)
    const av = avatarOf(g, 0)
    av.name = 'Dragonlord' // the form hook lives on the Dragonlord script
    g.flow = g.flow ?? {}
    g.flow.dragonForm = { player: 0, name: 'Draco Corvus', turn: g.turn }
    const kw = effKeywords(g, av)
    expect(kw.airborne).toBe(true) // the form works...
    expect(kw.stealth ?? false).toBe(false) // ..."Avatars cannot gain Stealth" (FAQ)
  })
})

describe('Projectile hit selection (rulebook: shooter chooses among multiple)', () => {
  function ranger(g: GameState) {
    // a Ranged 2 shooter at (0,1) firing east down row y=1
    const u = summonCard(g, 0, 'Belmotte Longbowmen', 0, 1)
    u.enteredTurn = 0
    return u
  }

  it('two hittable units on the impact square → the shooter is PROMPTED, not auto-picked', () => {
    const g = newGame(7)
    keepBoth(g)
    const shooter = ranger(g)
    // first unit the shot reaches is (1,1): stack two enemies there
    const a = summonCard(g, 1, 'Foot Soldier', 1, 1)
    const b = summonCard(g, 1, 'Sand Worm', 1, 1)
    act(g, 0, { t: 'activate', sourceId: shooter.id, ability: 'ranged', extra: { direction: 'e' } })
    // the engine must ASK rather than silently choosing
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    expect((g.prompts[0]?.data?.candidates as string[]).sort()).toEqual([a.id, b.id].sort())
    // neither is hit until we answer
    expect(a.damage).toBe(0)
    expect(b.damage).toBe(0)
    answer(g, [b.id]) // pick the Sand Worm
    expect(b.damage).toBeGreaterThan(0)
    expect(a.damage).toBe(0) // the one NOT chosen is untouched
  })

  it('a single hittable unit still resolves instantly (no needless prompt)', () => {
    const g = newGame(7)
    keepBoth(g)
    const shooter = ranger(g)
    const lone = summonCard(g, 1, 'Foot Soldier', 1, 1)
    act(g, 0, { t: 'activate', sourceId: shooter.id, ability: 'ranged', extra: { direction: 'e' } })
    expect(g.prompts.length).toBe(0)
    expect(lone.damage).toBeGreaterThan(0)
  })
})

describe('effect-driven casting — "cast a spell" resolves for real (Chaoswish class)', () => {
  function drain(g: GameState): void {
    let guard = 0
    while (g.prompts.length && guard++ < 60) {
      const p = g.prompts[0]; const d: any = p.data ?? {}
      let choice: any = null
      switch (p.kind) {
        case 'yesNo': case 'stayInFight': choice = false; break
        case 'chooseOption': choice = (d.options ?? ['n'])[0]; break
        case 'chooseSquare': choice = (d.squares ?? [{ x: 2, y: 1 }])[0]; break
        case 'chooseTargets': choice = d.upTo ? [] : ((d.candidates ?? []).length ? [d.candidates[0]] : []); break
        case 'chooseCards': choice = []; break
        case 'drawDeck': choice = 'spellbook'; break
        case 'defend': choice = []; break
        case 'intercept': choice = null; break
        case 'orderCards': choice = (d.cards ?? []).map((_: any, i: number) => i); break
        case 'nameCard': choice = (d.names ?? [])[0] ?? ''; break
        default: choice = null
      }
      answer(g, choice)
    }
  }
  const handHas = (g: GameState, pid: 0 | 1, name: string) =>
    g.players[pid].hand.some((id) => g.cards[id]?.name === name)

  it('effectCastSpell CASTS the spell (prompts for its target) — no hand token, magic vanishes', () => {
    const g = newGame(7)
    keepBoth(g)
    const enemy = summonCard(g, 1, 'Foot Soldier', 2, 1) // enemy minion on the surface
    effectCastSpell(g, 0, 'Zap!') // "deal 1 to target unit"
    expect(g.prompts[0]?.kind).toBe('chooseTargets') // it ASKS for the target, live
    expect(g.prompts[0]?.player).toBe(0)
    expect(enemy.damage).toBe(0) // nothing resolved until we answer
    answer(g, [enemy.id])
    expect(enemy.damage).toBe(1) // the spell actually resolved
    // the copy was a token: gone from hand, NOT in the cemetery, deleted entirely
    expect(handHas(g, 0, 'Zap!')).toBe(false)
    expect(g.players[0].cemetery.some((id) => g.cards[id]?.name === 'Zap!')).toBe(false)
    expect(Object.values(g.cards).some((c) => c.name === 'Zap!')).toBe(false)
  })

  it('the afterKey fires an OUT-OF-TURN copy offer to the opponent (not a hand token)', () => {
    const g = newGame(7)
    keepBoth(g)
    const enemy = summonCard(g, 1, 'Foot Soldier', 2, 1)
    effectCastSpell(g, 0, 'Zap!', { afterKey: 'chaoswish:pass', afterCtx: { from: 0 } })
    answer(g, [enemy.id]) // resolve the caster's spell
    // now the NEXT player is offered the copy, out of turn — a real decision
    expect(g.prompts[0]?.kind).toBe('yesNo')
    expect(g.prompts[0]?.player).toBe(1)
    answer(g, false) // decline → chain ends cleanly
    expect(g.prompts.length).toBe(0)
  })

  it('real Chaoswish: casts a random spell, leaves NO Chaoswish token in either hand', () => {
    const g = newGame(7)
    keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0)
    const cw = injectToHand(g, 0, 'Chaoswish')
    giveMana(g, 0, 20)
    waiveThreshold(g, 0)
    const av = avatarOf(g, 0)
    act(g, 0, { t: 'castSpell', cardId: cw, casterId: av.id }) // throws if it fails
    drain(g) // resolve the random spell + decline the copy chain
    // the old bug dumped a 'Chaoswish' token into the opponent's hand (uncastable
    // on your turn → chain dead). It must not: the copy offer is a prompt, not a card.
    expect(handHas(g, 1, 'Chaoswish')).toBe(false)
    expect(handHas(g, 0, 'Chaoswish')).toBe(false)
    // and no leftover free-cast token spell clutters either hand
    expect(g.players[0].hand.every((id) => !(g.cards[id] as any)?.isToken)).toBe(true)
    expect(g.players[1].hand.every((id) => !(g.cards[id] as any)?.isToken)).toBe(true)
  })
})

describe('effect-cast: Chaos Twister copy + luck on the copy chain', () => {
  it('effectCastSpell drives Chaos Twister (minion → origin → direction), no fizzle', () => {
    const g = newGame(7)
    keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const victim = summonCard(g, 1, 'Foot Soldier', 2, 1) // a minion to blow, in the avatar's region
    effectCastSpell(g, 0, 'Chaos Twister')
    // step 1: pick the minion
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    answer(g, [victim.id])
    // step 2: pick the blow origin square
    expect(g.prompts[0]?.kind).toBe('chooseSquare')
    answer(g, { x: 2, y: 1 })
    // step 3: pick the direction → it resolves (no lingering pendingCast, no hand token)
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    answer(g, 'n')
    expect((g.flow.pendingCasts ?? {})['__none__']).toBeUndefined()
    expect(g.players[0].hand.some((id) => g.cards[id].name === 'Chaos Twister')).toBe(false)
  })

  it('a Lucky Charm holder choosing the copied spell picks from N+1 candidates', () => {
    const g = newGame(7)
    keepBoth(g)
    // give player 1 a Lucky Charm so THEIR Chaoswish copy is a choice, not a plain roll
    const holder = summonToken(g, 'Foot Soldier', 1, 2, 2)!
    giveArtifact(g, holder, 'Lucky Charm')
    // simulate the copy offer landing on player 1 and being accepted
    ;(getScript('Chaoswish') as any) // ensure script registered
    // drive the pass→copy chain directly via the registered conts
    // (player 1 accepts the copy; luck turns it into a chooseCards among candidates)
    // Use the public prompt path: fire chaoswish:pass for from=0 → offers player 1
    // We reach it through a real Chaoswish cast below instead:
    placeSite(g, 0, 'Rustic Village', 2, 0)
    const cw = injectToHand(g, 0, 'Chaoswish')
    giveMana(g, 0, 20)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: cw, casterId: avatarOf(g, 0).id })
    // resolve the caster's own random spell generically until the opponent copy offer
    let guard = 0
    let sawLuckyChoice = false
    while (g.prompts.length && guard++ < 40) {
      const p = g.prompts[0]; const d: any = p.data ?? {}
      if (p.kind === 'yesNo' && p.player === 1) { answer(g, true); continue } // player 1 accepts the copy
      if (p.kind === 'chooseCards' && p.player === 1 && (d.cards?.length ?? 0) >= 2 && guard > 1) {
        // player 1 has a Lucky Charm → the copied spell is a multi-candidate CHOICE
        sawLuckyChoice = true
        answer(g, [0])
        // decline any further copies to end the chain
        continue
      }
      // generic answers for everything else
      answer(g, p.kind === 'yesNo' ? false : p.kind === 'chooseSquare' ? (d.squares ?? [{ x: 2, y: 1 }])[0]
        : p.kind === 'chooseOption' ? (d.options ?? ['n'])[0]
        : p.kind === 'chooseTargets' ? (d.upTo ? [] : ((d.candidates ?? []).length ? [d.candidates[0]] : []))
        : p.kind === 'chooseCards' ? [] : p.kind === 'drawDeck' ? 'spellbook' : p.kind === 'defend' ? [] : null)
    }
    expect(sawLuckyChoice).toBe(true) // the copy honoured player 1's Lucky Charm
  })
})

describe('Auto-pick → player-choice conversions (prompt only on a real tie)', () => {
  it('Fireball: co-located units → the caster chooses who takes 4 (others take 2)', () => {
    const g = board()
    const av = avatarOf(g, 0)
    av.x = 0; av.y = 1
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 1)
    // two enemies share (1,1) → the caster must choose which one eats the 4
    const a = summonCard(g, 1, 'Escyllion Cyclops', 1, 1) // defence 6 — survives 4
    const b = summonCard(g, 1, 'Escyllion Cyclops', 1, 1)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Fireball', { extra: { direction: 'e' } })

    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    const cands = (g.prompts[0] as any).data.candidates
    expect([...cands].sort()).toEqual([a.id, b.id].sort())
    answer(g, [a.id]) // a takes 4, b takes 2

    expect(g.units[a.id]?.damage).toBe(4)
    expect(g.units[b.id]?.damage).toBe(2)
  })

  it('Fireball: a lone unit → no prompt, it takes 4 directly', () => {
    const g = board()
    const av = avatarOf(g, 0)
    av.x = 0; av.y = 1
    for (const x of [1, 2]) placeSite(g, 0, 'Rustic Village', x, 1)
    const lone = summonCard(g, 1, 'Escyllion Cyclops', 1, 1)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Fireball', { extra: { direction: 'e' } })
    expect(g.prompts.length).toBe(0) // no tie → no prompt
    expect(g.units[lone.id]?.damage).toBe(4)
  })

  it('Sneak Thief: two carried artifacts → the thief chooses which to steal', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const thief = summonCard(g, 0, 'Sneak Thief', 2, 1); thief.enteredTurn = -1; thief.tapped = false
    const mark = summonCard(g, 1, 'Foot Soldier', 2, 1) // another unit HERE
    const art1 = giveArtifact(g, mark, 'Panpipes of Pnom')
    const art2 = giveArtifact(g, mark, 'Horn of Caerleon')

    act(g, 0, { t: 'activate', sourceId: thief.id, ability: 'steal', targets: [mark.id] })

    expect(g.prompts[0]?.kind).toBe('chooseCards')
    const names = (g.prompts[0] as any).data.cards as string[]
    expect([...names].sort()).toEqual(['Horn of Caerleon', 'Panpipes of Pnom'])
    answer(g, [names.indexOf('Horn of Caerleon')])

    expect(g.artifacts[art2.id].carriedBy).toBe(thief.id) // chosen one lifted
    expect(g.artifacts[art1.id].carriedBy).toBe(mark.id) // the other stays put
    expect(thief.carrying).toContain(art2.id)
    expect(thief.stealth).toBe(true)
  })

  it('Clairvoyant: two dead minions → the controller chooses which to banish', () => {
    const g = board()
    const seer = summonCard(g, 0, 'Clairvoyant', 2, 0); seer.enteredTurn = -1
    // stack two corpses into p0's cemetery
    const c1 = `cmtest${g.nextId++}`; g.cards[c1] = { id: c1, name: 'Bosk Troll', owner: 0 }; g.players[0].cemetery.push(c1)
    const c2 = `cmtest${g.nextId++}`; g.cards[c2] = { id: c2, name: 'Foot Soldier', owner: 0 }; g.players[0].cemetery.push(c2)

    act(g, 0, { t: 'activate', sourceId: seer.id, ability: 'gaze' })

    expect(g.prompts[0]?.kind).toBe('chooseCards')
    const names = (g.prompts[0] as any).data.cards as string[]
    expect([...names].sort()).toEqual(['Bosk Troll', 'Foot Soldier'])
    answer(g, [names.indexOf('Foot Soldier')]) // banish the Foot Soldier corpse

    expect(g.players[0].banished).toContain(c2)
    expect(g.players[0].cemetery).toContain(c1) // the unchosen corpse remains
    expect(g.prompts[0]?.kind).toBe('chooseOption') // the peek prompt follows
  })

  it('Instigator Imp: two candidate locations → the controller chooses where the brawl happens', () => {
    const g = board()
    // two nearby locations each hold 2 enemy minions
    placeSite(g, 1, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 3, 2)
    const l1a = summonCard(g, 1, 'Foot Soldier', 2, 2)
    const l1b = summonCard(g, 1, 'Foot Soldier', 2, 2)
    summonCard(g, 1, 'Foot Soldier', 3, 2)
    summonCard(g, 1, 'Foot Soldier', 3, 2)
    const imp = summonCard(g, 0, 'Instigator Imp', 2, 1); imp.enteredTurn = -1

    getScript('Instigator Imp')!.genesis!(makeCtx(g, imp.id, 0, []))

    expect(g.prompts[0]?.kind).toBe('chooseSquare')
    const sqs = (g.prompts[0] as any).data.squares as { x: number; y: number }[]
    expect(sqs.some((s) => s.x === 2 && s.y === 2)).toBe(true)
    expect(sqs.some((s) => s.x === 3 && s.y === 2)).toBe(true)
    answer(g, { x: 2, y: 2 }) // brawl at (2,2)

    // the two Foot Soldiers at (2,2) fought (1 power each) → each took damage (or died)
    for (const u of [l1a, l1b]) {
      const still = g.units[u.id]
      if (still) expect(still.damage).toBeGreaterThan(0)
    }
  })
})
