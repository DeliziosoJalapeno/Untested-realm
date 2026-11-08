// Frost Mage vs Lavamancer — fixes from the card-by-card review (2026-11-03): hidden-information leaks
// around face-down traps, Stealth after intercepting, summoning sickness and the tap hook on tap
// abilities, site-region "adjacent" for trap effects, Magellan wrap for Avalanche, artifacts carried by
// Stealthed minions, oversized units hit once; then the second pass: one door for tapping and untapping,
// summoning sickness on tap costs, destroying everything at once, Edge of the World's lasting rule, and
// the cards' own region and timing details.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, answer, act, actFail, giveMana, fillSites, injectToHand, giveArtifact, castMagic, castMagicFail, waiveThreshold, placeSite, settlePrompts } from './helpers'
import {
  enterSite, siteAt, isDisabled, viewFor, canActivate, untapUnit, tapUnit, canTapForCost, affinity, legalSiteSquares,
  topBottomWrapSteps, strandedSites, endTurn, type GameState, type PlayerId,
} from '../src'
import { riftShifts } from '../src/cards/scripts/multi-card-utils/rift-entry'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame() as GameState
  keepBoth(g)
  return g
}

function playTrap(g: GameState, player: PlayerId, name: string, x: number, y: number): string {
  const old = siteAt(g, x, y)
  if (old) delete g.sites[old.id]
  const cid = `ctrap${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: player }
  return enterSite(g, player, cid, x, y)
}

describe('face-down traps keep their secret', () => {
  it("playing a trap from hand captions only its disguise — the opponent's view never names it", () => {
    const g = board()
    const av = g.units[g.players[0].avatarUnitId]
    const cardId = injectToHand(g, 0, 'Spike Trap')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId, x: av.x, y: av.y })
    expect(siteAt(g, av.x, av.y)?.trap, 'it went down face down').toBeTruthy()
    expect(JSON.stringify(viewFor(g, 1)).includes('Spike Trap')).toBe(false)
  })

  it('a foe probing a trap gets the same answer whatever it is', () => {
    const g = board()
    fillSites(g)
    const dome = playTrap(g, 0, 'Icicle Dome', 1, 1) // no target: its own owner couldn't spring it now
    const meadow = playTrap(g, 0, 'Springstem Meadow', 3, 1)
    expect(canActivate(g, 1, dome, 'trap:spring')).toBe('You do not control that.')
    expect(canActivate(g, 1, meadow, 'trap:spring')).toBe('You do not control that.')
  })

  it("a trap someone else has come to control can't be sprung — by them or by its owner", () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Spike Trap', 2, 1)
    g.sites[id].controller = 1
    expect(canActivate(g, 1, id, 'trap:spring')).toBe('You do not control that.')
    expect(canActivate(g, 0, id, 'trap:spring')).toBe('You do not control that.')
  })
})

describe('The White Death', () => {
  it('intercepting is interacting: it loses Stealth (so its Lethal ends with that fight)', () => {
    const g = board()
    fillSites(g)
    const wd = summonCard(g, 1, 'The White Death', 2, 2)
    wd.enteredTurn = -1
    wd.stealth = true
    const mover = summonCard(g, 0, 'Bone Jumble', 2, 1)
    mover.enteredTurn = -1
    act(g, 0, { t: 'moveAttack', unitId: mover.id, path: [{ x: 2, y: 2, region: 'surface' }] })
    const p = g.prompts[0]
    expect(p?.player, 'the stealthed White Death is offered the intercept').toBe(1)
    answer(g, wd.id)
    while (g.prompts.length) answer(g, g.prompts[0].data?.candidates?.[0] ?? null)
    expect(wd.stealth).toBe(false)
    expect(wd.counters?.stealthInteractedTurn, 'the stealthed fight is over').toBeUndefined()
  })
})

describe('Stiff-pitch Witch', () => {
  it("can't use its tap ability the turn it arrives (summoning sickness)", () => {
    const g = board()
    fillSites(g)
    const witch = summonCard(g, 0, 'Stiff-pitch Witch', 2, 1)
    witch.enteredTurn = g.turn
    const dead = injectToHand(g, 1, 'Bone Jumble')
    g.players[1].hand.splice(g.players[1].hand.indexOf(dead), 1)
    g.players[1].cemetery.push(dead)
    giveMana(g, 0, 5)
    expect(actFail(g, 0, { t: 'activate', sourceId: witch.id, ability: 'treat', targets: ['sq:2,2,surface'] })).toBeTruthy()
    expect(witch.tapped).toBe(false)
  })
})

describe('trap effects stay in a site\'s regions (never a void)', () => {
  it('Sulfur Vents skips a minion in the void next to it', () => {
    const g = board()
    const id = playTrap(g, 0, 'Sulfur Vents', 2, 1)
    const onSite = summonCard(g, 1, 'Cave Trolls', 2, 1)
    const inVoid = summonCard(g, 1, 'Spectral Stalker', 3, 1) // Voidwalk: it can stand in the void
    if (siteAt(g, 3, 1)) delete g.sites[siteAt(g, 3, 1)!.id]
    inVoid.region = 'void'
    giveMana(g, 0, 5)
    act(g, 0, { t: 'activate', sourceId: id, ability: 'trap:spring' })
    expect(g.units[onSite.id].damage).toBe(1)
    expect(g.units[inVoid.id].damage).toBe(0)
  })

  it('Combusting Busts never offers a void location', () => {
    const g = board()
    const id = playTrap(g, 0, 'Combusting Busts', 2, 1)
    for (const sq of [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 0 }, { x: 2, y: 2 }]) {
      const s = siteAt(g, sq.x, sq.y)
      if (s) delete g.sites[s.id]
    }
    const v = summonCard(g, 1, 'Spectral Stalker', 3, 1)
    v.region = 'void'
    giveMana(g, 0, 5)
    act(g, 0, { t: 'activate', sourceId: id, ability: 'trap:spring' })
    expect(g.prompts.length, 'no adjacent site location to blast').toBe(0)
    expect(g.units[v.id].damage).toBe(0)
  })
})

describe('Avalanche under Magellan Globe', () => {
  it('flows across the connected edge, stopping before it would come back to the trap', () => {
    const g = board()
    fillSites(g)
    const holder = summonCard(g, 0, 'Bone Jumble', 4, 0)
    giveArtifact(g, holder, 'Magellan Globe')
    const id = playTrap(g, 0, 'Avalanche', 1, 2)
    const swept = summonCard(g, 1, 'Cave Trolls', 1, 2)
    giveMana(g, 0, 5)
    act(g, 0, { t: 'activate', sourceId: id, ability: 'trap:spring' })
    // forward for player 0 is +y: (1,2) → (1,3) → wraps → (1,0) → (1,1), then (1,2) would repeat
    expect([swept.x, swept.y]).toEqual([1, 1])
    expect(isDisabled(g, swept)).toBe(true)
  })
})

describe('Shatter and artifacts carried by a Stealthed enemy', () => {
  it("can't target an artifact a Stealthed enemy carries (rulebook)", () => {
    const g = board()
    fillSites(g)
    const sneak = summonCard(g, 1, 'Cave Trolls', 2, 1)
    sneak.stealth = true
    const art = giveArtifact(g, sneak, 'Excalibur')
    waiveThreshold(g, 0)
    expect(castMagicFail(g, 0, 'Shatter', { targets: [art.id] })).toMatch(/Stealth/)
  })
})

describe('untapping and tapping go through one door', () => {
  it("\"doesn't untap the next time it would\" stops the next untap from ANY source, then is spent", () => {
    const g = board()
    fillSites(g)
    const u = summonCard(g, 1, 'Cave Trolls', 2, 1)
    u.tapped = true
    u.counters = { ...u.counters, skipUntap: 1 }
    expect(untapUnit(g, u), 'the marker stops this untap').toBe(false)
    expect(u.tapped).toBe(true)
    expect(u.counters?.skipUntap).toBeUndefined()
    expect(untapUnit(g, u), 'the next one goes through').toBe(true)
  })

  it("Rhitta Gawr's \"Other minions can't untap\" holds against card effects too (Lash)", () => {
    const g = board()
    fillSites(g)
    summonCard(g, 1, 'Rhitta Gawr of Snowdonia', 4, 3)
    const av = g.units[g.players[0].avatarUnitId]
    const u = summonCard(g, 0, 'Cave Trolls', av.x, av.y)
    tapUnit(g, u)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Lash', { targets: [u.id] })
    expect(u.tapped).toBe(true)
  })
})

describe('summoning sickness and tap costs (rulebook)', () => {
  it("a summoning-sick minion can't be tapped to pay a cost", () => {
    const g = board()
    fillSites(g)
    const u = summonCard(g, 0, 'Cave Trolls', 2, 1)
    u.enteredTurn = g.turn
    expect(canTapForCost(g, u)).toBe(false)
    u.enteredTurn = -1
    expect(canTapForCost(g, u)).toBe(true)
  })

  it('Dhol Chants may still tap summoning-sick allies — the tap is its effect, not a cost (FAQ)', () => {
    const g = board()
    fillSites(g)
    const av = g.units[g.players[0].avatarUnitId]
    const fresh = summonCard(g, 0, 'Cave Trolls', av.x, av.y)
    fresh.enteredTurn = g.turn
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Dhol Chants')
    expect(g.prompts[0]?.data?.candidates).toContain(fresh.id)
  })
})

describe('Stiff-pitch Witch and the Bureau of Occult Control', () => {
  it("isn't offered while the cemetery toll can't be paid", () => {
    const g = board()
    fillSites(g)
    placeSite(g, 1, 'Bureau of Occult Control', 4, 3)
    const witch = summonCard(g, 0, 'Stiff-pitch Witch', 2, 1)
    witch.enteredTurn = -1
    const dead = `cdead${g.nextId++}`
    g.cards[dead] = { id: dead, name: 'Cave Trolls', owner: 1 }
    g.players[1].cemetery.push(dead)
    g.players[0].mana = 1
    expect(canActivate(g, 0, witch.id, 'treat')).toMatch(/can't use that/)
    g.players[0].mana = 2
    expect(canActivate(g, 0, witch.id, 'treat')).toBeNull()
  })
})

describe('destroying everything at once', () => {
  it('Aria Wraith: a warded disabled minion loses its ward instead; the rest are destroyed', () => {
    const g = board()
    fillSites(g)
    const wraith = summonCard(g, 0, 'Aria Wraith', 2, 1)
    wraith.stealth = true
    wraith.enteredTurn = -1
    const a = summonCard(g, 1, 'Cave Trolls', 2, 1)
    const b = summonCard(g, 1, 'Cave Trolls', 2, 2)
    for (const u of [a, b]) u.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: g.turn, sourcePlayer: 0 } as any)
    b.ward = true
    act(g, 0, { t: 'activate', sourceId: wraith.id, ability: 'aria' })
    expect(g.units[a.id]).toBeUndefined()
    expect(g.units[b.id], 'the ward broke instead').toBeTruthy()
    expect(b.ward).toBe(false)
  })
})

describe('Edge of the World stays beside the void', () => {
  it('neither a pull-apart nor a site play may take its last void', () => {
    const g = board()
    // every square sited except (2,1); Edge of the World at (3,1) has (2,1) as its only void neighbour
    for (let x = 0; x < 5; x++) for (let y = 0; y < 4; y++) {
      if (x === 2 && y === 1) continue
      placeSite(g, 0, x === 3 && y === 1 ? 'Edge of the World' : 'Rustic Village', x, y)
    }
    expect(strandedSites(g)).toEqual([])
    expect(riftShifts(g, 1, 1).filter((s) => s.axis === 'row'), 'a full row has no void to slide into anyway').toEqual([])
    expect(legalSiteSquares(g, 0).some((q) => q.x === 2 && q.y === 1), 'no site may be played into it').toBe(false)
  })

  it('a pull-apart that would fill its last void is not offered', () => {
    const g = board()
    // row y=1: Village (0,1), Village (1,1), void (2,1), Edge (3,1), void (4,1); column 3 otherwise full,
    // so the Edge's only void neighbours are (2,1) and (4,1) — fill (4,1) and pushing east into (2,1) strands it
    placeSite(g, 0, 'Rustic Village', 0, 1)
    placeSite(g, 0, 'Rustic Village', 1, 1)
    placeSite(g, 0, 'Edge of the World', 3, 1)
    placeSite(g, 0, 'Rustic Village', 4, 1)
    placeSite(g, 0, 'Rustic Village', 3, 0)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    expect(riftShifts(g, 1, 1).filter((s) => s.axis === 'row' && s.dir === 1)).toEqual([])
  })
})

describe('Ground Slam', () => {
  it('only an ally on the surface can strike its site', () => {
    const g = board()
    fillSites(g)
    const deep = summonCard(g, 0, 'Cave Trolls', 2, 1)
    deep.region = 'underground'
    waiveThreshold(g, 0)
    expect(castMagicFail(g, 0, 'Ground Slam', { targets: [deep.id] })).toBeTruthy()
  })
})

describe('Rite of Eruption', () => {
  it('"each unit at affected sites" includes the units below a site', () => {
    const g = board()
    fillSites(g)
    const p = g.activePlayer
    const site = siteAt(g, 2, 1)!
    const below = summonCard(g, 1 - p as PlayerId, 'Cave Trolls', 2, 2) // Burrowing, 3 life
    below.region = 'underground'
    const cardId = `crite${g.nextId++}`
    g.cards[cardId] = { id: cardId, name: 'Rite of Eruption', owner: p }
    g.auras.rite = { id: 'rite', cardId, name: 'Rite of Eruption', controller: p, squares: [{ x: site.x, y: site.y }] } as any
    endTurn(g)
    settlePrompts(g)
    endTurn(g)
    settlePrompts(g)
    expect(g.units[below.id], '3 at an orthogonally adjacent site reaches it underground too').toBeUndefined()
    expect(g.players[1 - p].cemetery).toContain(below.cardId)
    expect(g.auras.rite, 'the rite is complete').toBeUndefined()
  })
})

describe('Polar wraps below ground too', () => {
  it('a burrowed mover crosses the top/bottom edge underground', () => {
    const g = board()
    fillSites(g)
    expect(topBottomWrapSteps(g, { x: 1, y: 0, region: 'underground' })).toEqual([{ x: 1, y: 3, region: 'underground' }])
  })
})

describe('Scoria', () => {
  it('your (E) and (F) are equal to the higher of the two', () => {
    const g = board()
    placeSite(g, 0, 'Scoria', 2, 1)
    placeSite(g, 0, 'Arid Desert', 3, 1)
    const a = affinity(g, 0)
    expect(a.fire).toBeGreaterThan(0)
    expect(a.earth).toBe(a.fire)
  })
})

describe('Smoldering Hollow', () => {
  it('its boost is spent once the turn is over', () => {
    const g = board()
    fillSites(g)
    const old = siteAt(g, 2, 1)
    if (old) delete g.sites[old.id]
    const cid = `chollow${g.nextId++}`
    g.cards[cid] = { id: cid, name: 'Smoldering Hollow', owner: 0 }
    enterSite(g, 0, cid, 2, 1)
    expect(g.flow?.nearbyDamageBoosts?.length).toBe(1)
    endTurn(g)
    settlePrompts(g)
    expect(g.flow?.nearbyDamageBoosts).toBeUndefined()
  })
})

describe('Fireball 2', () => {
  it("doesn't ask which unit it hit — the explosion covers the whole location", () => {
    const g = board()
    fillSites(g)
    const av = g.units[g.players[0].avatarUnitId]
    const a = summonCard(g, 1, 'Escyllion Cyclops', av.x, av.y + 2)
    const b = summonCard(g, 1, 'Escyllion Cyclops', av.x, av.y + 2)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Fireball 2', { extra: { direction: 'n' } })
    expect(g.prompts.length).toBe(0)
    expect([g.units[a.id]?.damage, g.units[b.id]?.damage]).toEqual([4, 4])
  })
})

describe('more trap behaviour', () => {
  it('Avalanche sprung by the second player flows toward the first player', () => {
    const g = board()
    fillSites(g, 1)
    const id = playTrap(g, 1, 'Avalanche', 3, 3)
    const u = summonCard(g, 0, 'Cave Trolls', 3, 2)
    g.activePlayer = 1
    giveMana(g, 1, 5)
    act(g, 1, { t: 'activate', sourceId: id, ability: 'trap:spring' })
    expect([u.x, u.y]).toEqual([3, 0])
  })

  it('Bouldermaw with no Rolling Boulder in the collection does nothing', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Bouldermaw', 2, 1)
    giveMana(g, 0, 10)
    act(g, 0, { t: 'activate', sourceId: id, ability: 'trap:spring' })
    expect(g.prompts.length).toBe(0)
    expect(Object.values(g.artifacts).some((a) => a.name === 'Rolling Boulder')).toBe(false)
  })

  it('Icicle Dome destroys an adjacent immobile minion too', () => {
    const g = board()
    fillSites(g)
    const id = playTrap(g, 0, 'Icicle Dome', 2, 1)
    const u = summonCard(g, 1, 'Cave Trolls', 2, 2)
    u.modifiers.push({ kind: 'keyword', keyword: 'immobile', duration: 'untilYourNextTurn', turn: g.turn, sourcePlayer: 0 } as any)
    giveMana(g, 0, 5)
    act(g, 0, { t: 'activate', sourceId: id, ability: 'trap:spring' })
    while (g.prompts.length) answer(g, [u.id])
    expect(g.units[u.id]).toBeUndefined()
  })
})
