// Frost Mage vs Lavamancer (spoiled set): the Avatars, Magics, minions and the aura. One scenario per
// card's rules text; the traps and sites live in fvl.traps-and-sites.test.ts.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, castMagicFail, answer, act, actFail, waiveThreshold, giveMana, giveArtifact, injectToHand, fillSites, settlePrompts } from './helpers'
import {
  getCard, getKeywords, isDisabled, affinity, siteAt, effKeywords, edgesConnected, legalStepsFrom, endTurn, enterSite,
  type GameState, type PlayerId, type UnitState,
} from '../src'
import '../src/cards/scripts/index'

const avatarOf = (g: GameState, p: PlayerId) => g.units[g.players[p].avatarUnitId]

/** turn player `p`'s Avatar into `name` (an Avatar card) */
function becomeAvatar(g: GameState, p: PlayerId, name: string): UnitState {
  const av = avatarOf(g, p)
  av.name = name
  g.cards[av.cardId].name = name
  return av
}

function board(): GameState {
  const g = newGame() as GameState
  keepBoth(g)
  waiveThreshold(g, 0)
  return g
}

/** end the current player's turn and the next one, back to `p`'s turn */
function passRound(g: GameState): void {
  const p = g.activePlayer
  endTurn(g)
  settlePrompts(g)
  endTurn(g)
  settlePrompts(g)
  expect(g.activePlayer).toBe(p)
}

/** an Avatar ability's threshold: abilities aren't covered by waiveThreshold, so grant the affinity */
function grantAffinity(g: GameState, p: PlayerId, t: Partial<Record<'air' | 'earth' | 'fire' | 'water', number>>): void {
  g.flow = g.flow ?? {}
  g.flow.judgeThresh = { ...(g.flow.judgeThresh ?? {}), [p]: { air: 0, earth: 0, fire: 0, water: 0, ...t } }
}

describe('Frost Mage vs Lavamancer — card data', () => {
  it('every card of the set is in the card pool; Fireball and Polar Bears carry the set\'s new text and stats', () => {
    for (const name of ['Frost Mage', 'Lavamancer', 'Frostbolt', 'Spike Trap', 'Supervolcano', 'Polar Bears', 'Fireball', "Trapper's Rest"]) {
      expect(getCard(name).sets).toContain('Frost Mage vs Lavamancer')
    }
    expect(getCard('Fireball').text).toContain('explodes on impact')
    expect(getCard('Polar Bears')).toMatchObject({ cost: 3, attack: 3 })
    // names used while the set was only spoiled still resolve (saved decks, replays)
    expect(getCard('Fireball 2').name).toBe('Fireball')
    expect(getCard('Polar Bears 2').name).toBe('Polar Bears')
    expect(getKeywords('Namira Cheetah').movement).toBe(3)
    expect(getKeywords('Snapjaw Raptor')).toMatchObject({ charge: true, stealth: true })
    expect(getKeywords('The White Death')).toMatchObject({ ranged: 3, stealth: true })
    expect(getKeywords('The White Death').lethal, 'Lethal only while Stealthed').toBeFalsy()
    expect(getKeywords('Lava Elemental').spellcasterElements).toEqual(['earth', 'fire'])
  })
})

describe('Frost Mage', () => {
  it('encases a nearby minion: disabled and taking no damage until the Frost Mage\'s next turn; once on your turn', () => {
    const g = board()
    const mage = becomeAvatar(g, 0, 'Frost Mage')
    grantAffinity(g, 0, { air: 2, water: 2 })
    placeSite(g, 0, 'Rustic Village', 2, 0)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const foe = summonCard(g, 1, 'Cave Trolls', 2, 1)
    const other = summonCard(g, 1, 'Bone Jumble', 2, 1)
    giveMana(g, 0, 10)
    act(g, 0, { t: 'activate', sourceId: mage.id, ability: 'encase', targets: [foe.id] })
    expect(g.players[0].mana).toBe(8)
    expect(isDisabled(g, foe)).toBe(true)
    castMagic(g, 0, 'Zap!', { targets: [foe.id] })
    expect(g.units[foe.id].damage, 'encased: no damage').toBe(0)
    expect(actFail(g, 0, { t: 'activate', sourceId: mage.id, ability: 'encase', targets: [other.id] })).toMatch(/Already used/)
    passRound(g)
    expect(isDisabled(g, g.units[foe.id]), 'thawed at the start of the Frost Mage\'s next turn').toBe(false)
    castMagic(g, 0, 'Zap!', { targets: [foe.id] })
    expect(g.units[foe.id].damage).toBeGreaterThan(0)
  })

  it('needs (A)(A)(W)(W)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const mage = becomeAvatar(g, 0, 'Frost Mage')
    const foe = summonCard(g, 1, 'Cave Trolls', 2, 1)
    giveMana(g, 0, 10)
    expect(actFail(g, 0, { t: 'activate', sourceId: mage.id, ability: 'encase', targets: [foe.id] })).toMatch(/threshold/)
  })
})

describe('Lavamancer', () => {
  it('pulls a partial row apart, fills the gap with Rubble and burns the minions near it', () => {
    const g = board()
    const lava = becomeAvatar(g, 0, 'Lavamancer')
    grantAffinity(g, 0, { earth: 2, fire: 2 })
    for (const x of [0, 1, 2]) placeSite(g, 0, 'Rustic Village', x, 1)
    const rider = summonCard(g, 1, 'Escyllion Cyclops', 1, 1)
    const near = summonCard(g, 1, 'Cave Trolls', 0, 2) // nearby the Rubble that will fill (1,1)
    const far = summonCard(g, 1, 'Cave Trolls', 4, 3)
    giveMana(g, 0, 10)
    act(g, 0, { t: 'activate', sourceId: lava.id, ability: 'rift' })
    // choose the seam at (1,1): (0,1) stays, the rest of the row goes east (the only way it can go)
    answer(g, { x: 1, y: 1 })
    expect(siteAt(g, 1, 1)?.isRubble).toBe(true)
    expect(siteAt(g, 2, 1)?.name, 'the old (1,1) site slid east').toBe('Rustic Village')
    expect(siteAt(g, 3, 1), 'and (2,1) slid into the void beyond').toBeTruthy()
    expect([g.units[rider.id].x, g.units[rider.id].y], 'its rider went along').toEqual([2, 1])
    expect(g.units[near.id].damage, '1 damage to a minion nearby the Rubble').toBe(1)
    expect(g.units[rider.id].damage, 'the rider, one square over, is nearby too').toBe(1)
    expect(g.units[far.id].damage).toBe(0)
    expect(g.players[0].mana).toBe(7)
  })
})

describe('Frostbolt', () => {
  it('3 damage to the unit hit; everything adjacent to the impact is disabled until your next turn', () => {
    const g = board()
    fillSites(g)
    const hit = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    const beside = summonCard(g, 1, 'Cave Trolls', 3, 2)
    const corner = summonCard(g, 1, 'Cave Trolls', 3, 3) // diagonal: not adjacent
    castMagic(g, 0, 'Frostbolt', { extra: { direction: 'n' } })
    expect(g.units[hit.id].damage).toBe(3)
    expect(isDisabled(g, hit)).toBe(true)
    expect(isDisabled(g, beside)).toBe(true)
    expect(isDisabled(g, corner)).toBe(false)
  })
})

describe('Fireball', () => {
  it('explodes in a plus: 4 to every unit at the hit location, 2 to each orthogonally adjacent location', () => {
    const g = board()
    fillSites(g)
    const a = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    const b = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    const side = summonCard(g, 1, 'Escyllion Cyclops', 1, 2)
    const diag = summonCard(g, 1, 'Escyllion Cyclops', 1, 3)
    castMagic(g, 0, 'Fireball', { extra: { direction: 'n' } })
    if (g.prompts.length) answer(g, [a.id])
    expect([g.units[a.id].damage, g.units[b.id].damage, g.units[side.id].damage, g.units[diag.id].damage]).toEqual([4, 4, 2, 0])
  })
})

describe('Ground Slam', () => {
  it('an ally strikes its site, then 2 damage to the other units at nearby sites', () => {
    const g = board()
    placeSite(g, 1, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 3, 2)
    const ally = summonCard(g, 0, 'Cave Trolls', 2, 2)
    const foeHere = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    const foeNear = summonCard(g, 1, 'Escyllion Cyclops', 3, 2)
    const lifeBefore = avatarOf(g, 1).life!
    castMagic(g, 0, 'Ground Slam', { targets: [ally.id] })
    expect(avatarOf(g, 1).life, 'the strike on the enemy site costs its controller life').toBe(lifeBefore - 3)
    expect(g.units[foeHere.id].damage).toBe(2)
    expect(g.units[foeNear.id].damage).toBe(2)
    expect(g.units[ally.id].damage, 'not the ally itself').toBe(0)
  })
})

describe('Shatter', () => {
  it('destroys a nearby artifact or disabled minion, never a minion that is not disabled', () => {
    const g = board()
    fillSites(g)
    const holder = summonCard(g, 1, 'Cave Trolls', 2, 1)
    const art = giveArtifact(g, holder, 'Excalibur')
    castMagic(g, 0, 'Shatter', { targets: [art.id] })
    expect(g.artifacts[art.id]).toBeUndefined()
    expect(castMagicFail(g, 0, 'Shatter', { targets: [holder.id] })).toMatch(/legal target/)
    holder.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: g.turn, sourcePlayer: 0 })
    castMagic(g, 0, 'Shatter', { targets: [holder.id] })
    expect(g.units[holder.id]).toBeUndefined()
    const far = summonCard(g, 1, 'Cave Trolls', 2, 3)
    const farArt = giveArtifact(g, far, 'Excalibur')
    expect(castMagicFail(g, 0, 'Shatter', { targets: [farArt.id] }), 'an artifact out of range').toMatch(/nearby/)
  })
})

describe('Polar Shift', () => {
  it('moves every site one row north with what stands on it, the top row wrapping to the bottom; then draws a spell', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 0, 3)
    placeSite(g, 0, 'Rustic Village', 4, 1)
    const rider = summonCard(g, 0, 'Cave Trolls', 4, 1)
    const hand = g.players[0].hand.length
    castMagic(g, 0, 'Polar Shift')
    answer(g, 'north (away from you)') // labelled from the caster's seat
    expect(siteAt(g, 0, 0), 'the top row wrapped to the bottom').toBeTruthy()
    expect(siteAt(g, 0, 3)).toBeNull()
    expect(siteAt(g, 4, 2)).toBeTruthy()
    expect([g.units[rider.id].x, g.units[rider.id].y]).toEqual([4, 2])
    expect(g.players[0].hand.length, 'drew a spell (the cast card left the hand)').toBe(hand + 1)
  })

  it("can't shift a flat realm (Flat Realm Society) — it still draws", () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 0, 3)
    summonCard(g, 1, 'Flat Realm Society', 0, 3)
    const hand = g.players[0].hand.length
    castMagic(g, 0, 'Polar Shift')
    expect(g.prompts.length).toBe(0)
    expect(siteAt(g, 0, 3)).toBeTruthy()
    expect(g.players[0].hand.length).toBe(hand + 1)
  })
})

describe('Ash of Effort', () => {
  it('sacrifices one of your sites to draw three sites', () => {
    const g = board()
    const s = placeSite(g, 0, 'Rustic Village', 0, 0)
    placeSite(g, 0, 'Rustic Village', 1, 0)
    const atlas = g.players[0].atlas.length
    castMagic(g, 0, 'Ash of Effort')
    answer(g, [s.id])
    expect(siteAt(g, 0, 0)?.isRubble).toBe(true)
    expect(g.players[0].atlas.length).toBe(atlas - 3)
  })

  it("can't be cast without a site to sacrifice", () => {
    const g = board()
    expect(castMagicFail(g, 0, 'Ash of Effort')).toMatch(/no site/)
  })
})

describe('The White Death', () => {
  it('its shot from Stealth is Lethal; without Stealth it is not', () => {
    for (const stealthed of [true, false]) {
      const g = board()
      fillSites(g)
      const sniper = summonCard(g, 0, 'The White Death', 2, 0)
      sniper.enteredTurn = -1
      sniper.stealth = stealthed
      const big = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
      act(g, 0, { t: 'activate', sourceId: sniper.id, ability: 'ranged', extra: { direction: 'n' } })
      while (g.prompts.length) answer(g, [big.id])
      expect(!!g.units[big.id], stealthed ? 'the stealthed shot kills' : 'a plain 2 damage').toBe(!stealthed)
      expect(sniper.stealth).toBe(false)
    }
  })
})

describe('Aria Wraith', () => {
  it('breaking Stealth destroys the nearby artifacts and disabled minions, nothing else', () => {
    const g = board()
    fillSites(g)
    const wraith = summonCard(g, 0, 'Aria Wraith', 2, 1)
    wraith.stealth = true
    const frozen = summonCard(g, 1, 'Cave Trolls', 2, 2)
    frozen.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: g.turn, sourcePlayer: 0 })
    const awake = summonCard(g, 1, 'Cave Trolls', 3, 2)
    const art = giveArtifact(g, awake, 'Excalibur')
    const farFrozen = summonCard(g, 1, 'Cave Trolls', 2, 3)
    farFrozen.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: g.turn, sourcePlayer: 0 })
    act(g, 0, { t: 'activate', sourceId: wraith.id, ability: 'aria' })
    expect(g.units[frozen.id]).toBeUndefined()
    expect(g.artifacts[art.id]).toBeUndefined()
    expect(g.units[awake.id]).toBeDefined()
    expect(g.units[farFrozen.id], 'not nearby').toBeDefined()
    expect(wraith.stealth).toBe(false)
    expect(actFail(g, 0, { t: 'activate', sourceId: wraith.id, ability: 'aria' }), 'only while Stealthed').toMatch(/can't use that/)
  })
})

describe('Lava Elemental / Frost Elemental', () => {
  function cast(g: GameState, name: string, targets: string[]): void {
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const cid = injectToHand(g, 0, name)
    giveMana(g, 0, 10)
    act(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 1 }, targets })
  }
  it('Lava Elemental: Genesis → 2 damage to target adjacent unit', () => {
    const g = board()
    placeSite(g, 1, 'Rustic Village', 2, 2)
    const foe = summonCard(g, 1, 'Cave Trolls', 2, 2)
    cast(g, 'Lava Elemental', [foe.id])
    expect(g.units[foe.id].damage).toBe(2)
  })
  it('Frost Elemental: Genesis → disable target adjacent unit until your next turn', () => {
    const g = board()
    placeSite(g, 1, 'Rustic Village', 2, 2)
    const foe = summonCard(g, 1, 'Cave Trolls', 2, 2)
    cast(g, 'Frost Elemental', [foe.id])
    expect(isDisabled(g, foe)).toBe(true)
    passRound(g)
    expect(isDisabled(g, g.units[foe.id])).toBe(false)
  })
})

describe('Lone Wolf', () => {
  it('can and must be cast to a location without allies nearby — even an enemy site', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 2, 1)
    placeSite(g, 1, 'Rustic Village', 4, 3)
    giveMana(g, 0, 10)
    const crowded = injectToHand(g, 0, 'Lone Wolf')
    expect(actFail(g, 0, { t: 'castSpell', cardId: crowded, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 1 } }), 'your own site, but the Avatar is nearby').toMatch(/no ally is nearby/)
    act(g, 0, { t: 'castSpell', cardId: crowded, casterId: g.players[0].avatarUnitId, at: { x: 4, y: 3 } })
    const wolf = Object.values(g.units).find((u) => u.name === 'Lone Wolf')!
    expect([wolf.x, wolf.y]).toEqual([4, 3])
  })
})

describe('Southpaw Dyrodor', () => {
  it("swings 4 left, 3 above-left, 2 above, 1 above-right — from its controller's seat", () => {
    for (const p of [0, 1] as PlayerId[]) {
      const g = board()
      fillSites(g)
      const dino = summonCard(g, p, 'Southpaw Dyrodor', 2, 1)
      dino.enteredTurn = -1
      const up = p === 0 ? 1 : -1
      const left = p === 0 ? -1 : 1
      const at = (dx: number, dy: number) => summonCard(g, p === 0 ? 1 : 0, 'Escyllion Cyclops', 2 + dx, 1 + dy)
      const L = at(left, 0), UL = at(left, up), U = at(0, up), UR = at(-left, up), R = at(-left, 0)
      g.activePlayer = p
      act(g, p, { t: 'activate', sourceId: dino.id, ability: 'tail' })
      expect([L, UL, U, UR, R].map((u) => g.units[u.id].damage), `player ${p}`).toEqual([4, 3, 2, 1, 0])
    }
  })
})

describe('Pass-plug Serpent', () => {
  it('may unburrow onto a nearby allied site an enemy walks onto', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 2, 1)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    const serpent = summonCard(g, 0, 'Pass-plug Serpent', 3, 2, 'underground')
    const foe = summonCard(g, 1, 'Cave Trolls', 2, 2)
    foe.enteredTurn = -1
    g.activePlayer = 1
    act(g, 1, { t: 'moveAttack', unitId: foe.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    expect(g.prompts[0]?.player).toBe(0)
    answer(g, true)
    expect([serpent.x, serpent.y, serpent.region]).toEqual([2, 1, 'surface'])
  })
})

describe('Polar Bears / Flat Realm Society', () => {
  it('Polar Bears wraps the top and bottom edges; Flat Realm Society stops it, and Magellan Globe too', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 1, 0)
    placeSite(g, 0, 'Rustic Village', 1, 3)
    const bears = summonCard(g, 0, 'Polar Bears', 1, 0)
    const wraps = () => legalStepsFrom(g, bears, { x: 1, y: 0, region: 'surface' }).some((s) => s.x === 1 && s.y === 3)
    expect(wraps()).toBe(true)
    const holder = summonCard(g, 1, 'Bone Jumble', 4, 3)
    giveArtifact(g, holder, 'Magellan Globe')
    expect(edgesConnected(g)).toBe(true)
    const flat = summonCard(g, 1, 'Flat Realm Society', 4, 3)
    expect(wraps()).toBe(false)
    expect(edgesConnected(g)).toBe(false)
    flat.silenced = true
    expect(wraps(), 'a silenced Society has no ability').toBe(true)
  })
})

describe('Stiff-pitch Witch', () => {
  it('banishes a dead minion from either cemetery to deal 2 to each unit at a location up to three steps away', () => {
    const g = board()
    fillSites(g)
    const witch = summonCard(g, 0, 'Stiff-pitch Witch', 0, 0)
    witch.enteredTurn = -1
    const corpse = `cdead${g.nextId++}`
    g.cards[corpse] = { id: corpse, name: 'Cave Trolls', owner: 1 }
    g.players[1].cemetery.push(corpse)
    const a = summonCard(g, 1, 'Escyllion Cyclops', 2, 1)
    const b = summonCard(g, 1, 'Escyllion Cyclops', 2, 1)
    expect(actFail(g, 0, { t: 'activate', sourceId: witch.id, ability: 'treat', targets: ['sq:4,3,surface'] }), '7 steps away').toBeTruthy()
    act(g, 0, { t: 'activate', sourceId: witch.id, ability: 'treat', targets: ['sq:2,1,surface'] })
    expect(g.prompts.length, 'the only dead minion is taken without asking').toBe(0)
    expect([g.units[a.id].damage, g.units[b.id].damage]).toEqual([2, 2])
    expect(g.players[1].banished).toContain(corpse)
    expect(witch.tapped).toBe(true)
  })
})

describe('Emberleaf Dryad', () => {
  it('Genesis → plays the top site of your atlas onto an adjacent Rubble', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const rubble = placeSite(g, 0, 'Rustic Village', 2, 2)
    rubble.isRubble = true; rubble.name = 'Rubble'; rubble.controller = null
    const top = g.cards[g.players[0].atlas[0]].name
    const cid = injectToHand(g, 0, 'Emberleaf Dryad')
    giveMana(g, 0, 10)
    act(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 1 } })
    expect(siteAt(g, 2, 2)?.name).toBe(top)
    expect(siteAt(g, 2, 2)?.controller).toBe(0)
  })
})

describe('Rite of Eruption', () => {
  it('at the start of your turn: 5 / 3 / 1 over the sites around it, then everything in its square is destroyed', () => {
    const g = board()
    fillSites(g, 1)
    const centre = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    const orth = summonCard(g, 1, 'Escyllion Cyclops', 2, 1)
    const diag = summonCard(g, 1, 'Escyllion Cyclops', 1, 1)
    const below = summonCard(g, 1, 'Escyllion Cyclops', 2, 2, 'underground')
    const cid = injectToHand(g, 0, 'Rite of Eruption')
    giveMana(g, 0, 10)
    act(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 2 } })
    const rite = Object.values(g.auras).find((r) => r.name === 'Rite of Eruption')!
    expect(rite.squares).toEqual([{ x: 2, y: 2 }])
    passRound(g)
    expect(g.units[centre.id], '5 damage, then destroyed').toBeUndefined()
    expect(g.units[below.id], 'everything in the square').toBeUndefined()
    expect(g.units[orth.id]?.damage ?? 'healed?', 'took 3 (healed at end of turn? no: start of turn)').toBe(3)
    expect(g.units[diag.id].damage).toBe(1)
    expect(siteAt(g, 2, 2)?.isRubble).toBe(true)
    expect(g.auras[rite.id]).toBeUndefined()
  })
})

describe('Scoria / Tundra', () => {
  it('your (E) and (F) — and (A) and (W) — are the higher of the two', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Scoria', 0, 0)
    placeSite(g, 0, 'Tundra', 1, 0)
    placeSite(g, 0, 'Valley', 2, 0)
    placeSite(g, 0, 'Valley', 3, 0)
    placeSite(g, 0, 'Spire', 4, 0)
    const a = affinity(g, 0)
    expect([a.earth, a.fire]).toEqual([2, 2])
    expect([a.air, a.water]).toEqual([1, 1])
  })
})

describe('Smoldering Hollow', () => {
  it('Genesis → damage to units nearby is increased by 1 this turn', () => {
    const g = board()
    fillSites(g)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 1)
    const far = summonCard(g, 1, 'Escyllion Cyclops', 4, 3)
    const cid = `chollow${g.nextId++}`
    g.cards[cid] = { id: cid, name: 'Smoldering Hollow', owner: 0 }
    delete g.sites[siteAt(g, 0, 0)!.id]
    enterSite(g, 0, cid, 0, 0)
    castMagic(g, 0, 'Zap!', { targets: [foe.id] })
    castMagic(g, 0, 'Zap!', { targets: [far.id] })
    expect(g.units[foe.id].damage - g.units[far.id].damage).toBe(1)
    expect(effKeywords(g, foe)).toBeTruthy()
  })
})

describe('review follow-ups', () => {
  it("The White Death's Lethal grace ends with the shot that broke its Stealth", () => {
    const g = board()
    fillSites(g)
    const sniper = summonCard(g, 0, 'The White Death', 2, 0)
    sniper.enteredTurn = -1
    sniper.stealth = true
    const first = summonCard(g, 1, 'Bone Jumble', 2, 2)
    act(g, 0, { t: 'activate', sourceId: sniper.id, ability: 'ranged', extra: { direction: 'n' } })
    while (g.prompts.length) answer(g, [first.id])
    expect(effKeywords(g, sniper).lethal, 'no longer Stealthed, no longer Lethal').toBeFalsy()
  })

  it('Pass-plug Serpent asks once when an enemy is summoned onto the nearby allied site', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 3, 2)
    placeSite(g, 0, 'Rustic Village', 4, 3)
    summonCard(g, 0, 'Pass-plug Serpent', 3, 2, 'underground')
    g.activePlayer = 1
    g.flow = g.flow ?? {}
    g.flow.noThreshold = { 1: g.turn }
    const cid = injectToHand(g, 1, 'Lone Wolf')
    giveMana(g, 1, 10)
    act(g, 1, { t: 'castSpell', cardId: cid, casterId: g.players[1].avatarUnitId, at: { x: 4, y: 3 } })
    expect(g.prompts.filter((p) => p.player === 0 && p.kind === 'yesNo').length).toBe(1)
    answer(g, false)
    expect(g.prompts.length, 'not asked again').toBe(0)
  })

  it('Aria Wraith destroys a nearby Automaton (an artifact) even when it is not disabled', () => {
    const g = board()
    fillSites(g)
    const wraith = summonCard(g, 0, 'Aria Wraith', 2, 1)
    wraith.stealth = true
    const golem = summonCard(g, 1, 'Clay Golem', 2, 2)
    act(g, 0, { t: 'activate', sourceId: wraith.id, ability: 'aria' })
    expect(g.units[golem.id]).toBeUndefined()
  })

  // the Genesis target spec is upTo (the repo convention, as Angry Mob): a non-upTo spec would make the
  // minion uncastable with nothing adjacent ('Missing targets')
  it('Lava Elemental can still be cast with nothing adjacent to burn', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 0, 0)
    const lone = injectToHand(g, 0, 'Lava Elemental')
    giveMana(g, 0, 10)
    act(g, 0, { t: 'castSpell', cardId: lone, casterId: g.players[0].avatarUnitId, at: { x: 0, y: 0 } })
    expect(Object.values(g.units).some((u) => u.name === 'Lava Elemental')).toBe(true)
  })
})
