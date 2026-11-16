// Frost Mage vs Lavamancer, batch B: disabling, freezing and protection. One scenario (or a few) per card.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, castMagicFail, answer, act, actFail, waiveThreshold, giveMana, giveArtifact, injectToHand, fillSites, settlePrompts } from './helpers'
import {
  getKeywords, isDisabled, siteAt, siteSilenced, siteDisabled, artifactSilenced, endTurn, enterSite, killUnit, emitUnitMoved, checkStateBased, dealDamageToUnit, effAttack, attackBlockedAt, isLegalStep, makeCtx, protectedFromSource, sourceKindOfName, createGame, starterDecks, PRECONS, matchPrecon, printingsFor, canonicalArtSlug, viewFor, type DeckList,
  type GameState, type PlayerId,
} from '../src'
import '../src/cards/scripts/index'
import { disableUntilYourNextTurn } from '../src/cards/scripts/multi-card-utils/disable-until-next-turn'

function board(): GameState {
  const g = newGame() as GameState
  keepBoth(g)
  waiveThreshold(g, 0)
  fillSites(g)
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

/** cast a minion from hand to (x,y) (Genesis runs) */
function castMinion(g: GameState, p: PlayerId, name: string, x: number, y: number, targets?: string[]): void {
  const cid = injectToHand(g, p, name)
  giveMana(g, p, 10)
  act(g, p, { t: 'castSpell', cardId: cid, casterId: g.players[p].avatarUnitId, at: { x, y }, targets })
}

/** play the site `name` at (x,y) through the real site entry (Genesis runs), replacing the test site there */
function playSite(g: GameState, p: PlayerId, name: string, x: number, y: number): string {
  const old = siteAt(g, x, y)
  if (old) delete g.sites[old.id]
  const cid = `csite${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: p }
  return enterSite(g, p, cid, x, y)
}

/** relocate a unit by force (as a teleport would) */
function shove(g: GameState, id: string, x: number, y: number): void {
  const u = g.units[id]
  const from = { x: u.x, y: u.y, region: u.region }
  u.x = x
  u.y = y
  emitUnitMoved(g, u, from)
}

const unitNamed = (g: GameState, name: string) => Object.values(g.units).find((u) => u.name === name)

describe('Frost Breath', () => {
  it('a Beast breathes the [1 / 1 2 1 / ●] pattern: damage, then every survivor is disabled until your next turn', () => {
    const g = board()
    const bears = summonCard(g, 0, 'Brown Bears', 2, 1)
    const front = summonCard(g, 1, 'Stygian Archers', 2, 2)
    const side = summonCard(g, 1, 'Stygian Archers', 1, 2)
    const ally = summonCard(g, 0, 'Stygian Archers', 3, 2)
    const far = summonCard(g, 1, 'Bone Jumble', 2, 3)
    const outside = summonCard(g, 1, 'Stygian Archers', 0, 2)
    castMagic(g, 0, 'Frost Breath', { casterId: bears.id })
    answer(g, 'n')
    expect(g.units[front.id].damage).toBe(2)
    expect(g.units[side.id].damage).toBe(1)
    expect(g.units[ally.id].damage, 'each unit — allies too').toBe(1)
    expect(g.units[far.id], 'two steps ahead: 1 damage kills the 1/1').toBeUndefined()
    expect(g.units[outside.id].damage).toBe(0)
    for (const id of [front.id, side.id, ally.id]) expect(isDisabled(g, g.units[id])).toBe(true)
    expect(isDisabled(g, g.units[outside.id])).toBe(false)
    expect(isDisabled(g, bears), 'the caster is behind the breath').toBe(false)
    passRound(g)
    expect(isDisabled(g, g.units[front.id]), 'thawed at the start of your next turn').toBe(false)
  })

  it('the damage and the disable are simultaneous, so a minion it kills fires no Deathrite', () => {
    const g = board()
    const bears = summonCard(g, 0, 'Brown Bears', 2, 1)
    const scarabs = summonCard(g, 1, 'Sacred Scarabs', 2, 2)
    const archers = summonCard(g, 1, 'Stygian Archers', 2, 2)
    castMagic(g, 0, 'Frost Breath', { casterId: bears.id })
    answer(g, 'n')
    expect(g.units[scarabs.id]).toBeUndefined()
    expect(g.units[archers.id]?.damage).toBe(2)
  })

  it('may be cast by a Spirit, but not by a minion that is neither a Beast nor a Spirit', () => {
    const g = board()
    const spirit = summonCard(g, 0, 'Cloud Spirit', 2, 1)
    const archers = summonCard(g, 0, 'Stygian Archers', 1, 1)
    expect(castMagicFail(g, 0, 'Frost Breath', { casterId: archers.id })).toMatch(/Beast or Spirit|can't cast|Spellcaster/i)
    castMagic(g, 0, 'Frost Breath', { casterId: spirit.id })
    expect(g.prompts[0]?.kind).toBe('chooseOption')
  })
})

describe('Hailstriker', () => {
  it('is Ranged; Genesis → each minion at the target adjacent location takes 1 damage and is disabled until your next turn', () => {
    const g = board()
    expect(getKeywords('Hailstriker').ranged).toBeTruthy()
    const a = summonCard(g, 1, 'Stygian Archers', 2, 2)
    const b = summonCard(g, 0, 'Stygian Archers', 2, 2)
    const other = summonCard(g, 1, 'Stygian Archers', 1, 1)
    castMinion(g, 0, 'Hailstriker', 2, 1, ['sq:2,2,surface'])
    for (const id of [a.id, b.id]) {
      expect(g.units[id].damage).toBe(1)
      expect(isDisabled(g, g.units[id])).toBe(true)
    }
    expect(g.units[other.id].damage).toBe(0)
    expect(isDisabled(g, g.units[other.id])).toBe(false)
    passRound(g)
    expect(isDisabled(g, g.units[a.id])).toBe(false)
  })

  it('FAQ: the damage and the disable are simultaneous — a minion it kills is disabled, so its Deathrite does not fire', () => {
    const g = board()
    const scarabs = summonCard(g, 1, 'Sacred Scarabs', 2, 2)
    const archers = summonCard(g, 1, 'Stygian Archers', 2, 2)
    castMinion(g, 0, 'Hailstriker', 2, 1, ['sq:2,2,surface'])
    expect(g.units[scarabs.id]).toBeUndefined()
    expect(g.units[archers.id]?.damage, 'no 3 damage from the Deathrite of the Scarabs').toBe(1)
  })

  it('the location must be adjacent', () => {
    const g = board()
    const cid = injectToHand(g, 0, 'Hailstriker')
    giveMana(g, 0, 10)
    expect(actFail(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 1 }, targets: ['sq:2,3,surface'] })).toMatch(/adjacent/)
  })
})

describe('Hibernal Legion', () => {
  it('at the end of your turn freezes its site and the other minions there until it leaves the realm', () => {
    const g = board()
    const legion = summonCard(g, 0, 'Hibernal Legion', 2, 1)
    const foe = summonCard(g, 1, 'Stygian Archers', 2, 1)
    const friend = summonCard(g, 0, 'Stygian Archers', 2, 1)
    const away = summonCard(g, 1, 'Stygian Archers', 2, 2)
    const site = siteAt(g, 2, 1)!
    expect(isDisabled(g, foe)).toBe(false)
    endTurn(g)
    settlePrompts(g)
    expect(isDisabled(g, g.units[foe.id])).toBe(true)
    expect(isDisabled(g, g.units[friend.id]), 'other minions — allies too').toBe(true)
    expect(isDisabled(g, g.units[legion.id]), 'not the Legion itself').toBe(false)
    expect(isDisabled(g, g.units[away.id])).toBe(false)
    expect(siteDisabled(g, site)).toBe(true)
    expect(siteSilenced(g, site), 'a disabled site has no abilities').toBe(true)
    // still frozen rounds later, wherever the minion goes
    endTurn(g)
    settlePrompts(g)
    shove(g, foe.id, 3, 3)
    expect(isDisabled(g, g.units[foe.id])).toBe(true)
    killUnit(g, legion.id)
    expect(g.units[legion.id]).toBeUndefined()
    expect(isDisabled(g, g.units[foe.id]), 'the Legion left the realm').toBe(false)
    expect(isDisabled(g, g.units[friend.id])).toBe(false)
    expect(siteDisabled(g, site)).toBe(false)
  })
})

describe('Permafrost', () => {
  it('disables on minions here never run out, and are removed when they leave', () => {
    const g = board()
    playSite(g, 0, 'Permafrost', 2, 2)
    const held = summonCard(g, 1, 'Stygian Archers', 2, 2)
    const elsewhere = summonCard(g, 1, 'Stygian Archers', 1, 2)
    disableUntilYourNextTurn(g, held.id, 0)
    disableUntilYourNextTurn(g, elsewhere.id, 0)
    passRound(g)
    expect(isDisabled(g, g.units[elsewhere.id]), 'a normal disable ran out').toBe(false)
    expect(isDisabled(g, g.units[held.id]), 'permanent here').toBe(true)
    passRound(g)
    expect(isDisabled(g, g.units[held.id])).toBe(true)
    shove(g, held.id, 3, 2)
    expect(isDisabled(g, g.units[held.id]), 'removed as it leaves').toBe(false)
    // and an unexpired disable is removed too — and doesn't come back on return
    disableUntilYourNextTurn(g, held.id, 0)
    shove(g, held.id, 2, 2)
    checkStateBased(g)
    expect(isDisabled(g, g.units[held.id])).toBe(true)
    shove(g, held.id, 2, 3)
    expect(isDisabled(g, g.units[held.id])).toBe(false)
    shove(g, held.id, 2, 2)
    expect(isDisabled(g, g.units[held.id])).toBe(false)
  })

  it("a Hibernal Legion's freeze outlives the Legion while the frozen minion stays here", () => {
    const g = board()
    playSite(g, 0, 'Permafrost', 2, 1)
    const legion = summonCard(g, 0, 'Hibernal Legion', 2, 2)
    const foe = summonCard(g, 1, 'Stygian Archers', 2, 2)
    endTurn(g)
    settlePrompts(g)
    expect(isDisabled(g, g.units[foe.id])).toBe(true)
    shove(g, foe.id, 2, 1)
    checkStateBased(g)
    killUnit(g, legion.id)
    expect(isDisabled(g, g.units[foe.id]), 'permanent while here').toBe(true)
    shove(g, foe.id, 3, 1)
    expect(isDisabled(g, g.units[foe.id])).toBe(false)
    shove(g, foe.id, 2, 1)
    checkStateBased(g)
    expect(isDisabled(g, g.units[foe.id]), 'a freeze that ended is not revived').toBe(false)
  })

  it('a Hibernal Legion on the Permafrost freezes the site itself: it loses its ability, so nothing is held', () => {
    const g = board()
    const pf = playSite(g, 0, 'Permafrost', 2, 1)
    const legion = summonCard(g, 0, 'Hibernal Legion', 2, 1)
    const foe = summonCard(g, 1, 'Stygian Archers', 2, 1)
    endTurn(g)
    settlePrompts(g)
    expect(siteDisabled(g, g.sites[pf])).toBe(true)
    killUnit(g, legion.id)
    expect(isDisabled(g, g.units[foe.id])).toBe(false)
  })

  it('FAQ: a Slumbering Giantess here does not wake when hurt, and wakes as she leaves', () => {
    const g = board()
    playSite(g, 0, 'Permafrost', 2, 1)
    castMinion(g, 0, 'Slumbering Giantess', 2, 1)
    const giantess = unitNamed(g, 'Slumbering Giantess')!
    expect(isDisabled(g, giantess)).toBe(true)
    dealDamageToUnit(g, giantess, 1, 1)
    checkStateBased(g)
    expect(isDisabled(g, g.units[giantess.id]), 'still asleep: disabled until she leaves').toBe(true)
    passRound(g)
    expect(isDisabled(g, g.units[giantess.id])).toBe(true)
    shove(g, giantess.id, 2, 2)
    expect(isDisabled(g, g.units[giantess.id]), 'awake without taking damage').toBe(false)
  })

  it('an area disable here is held too, after its source has gone', () => {
    const g = board()
    playSite(g, 0, 'Permafrost', 2, 2)
    const basilisk = summonCard(g, 0, 'Hillock Basilisk', 2, 1)
    const foe = summonCard(g, 1, 'Stygian Archers', 2, 2)
    checkStateBased(g)
    expect(isDisabled(g, foe), 'one step in front of the Basilisk').toBe(true)
    killUnit(g, basilisk.id)
    expect(isDisabled(g, g.units[foe.id]), 'held at the Permafrost').toBe(true)
    shove(g, foe.id, 3, 2)
    expect(isDisabled(g, g.units[foe.id])).toBe(false)
  })
})

describe('Man-made Ice Age', () => {
  it('disables minions and artifacts atop affected sites (not Avatars, nothing outside)', () => {
    const g = board()
    const inside = summonCard(g, 1, 'Stygian Archers', 1, 2)
    const bearer = summonCard(g, 0, 'Stygian Archers', 2, 2)
    const art = giveArtifact(g, bearer, 'Key to the City')
    const outside = summonCard(g, 1, 'Stygian Archers', 4, 3)
    castMagic(g, 0, 'Man-made Ice Age', { at: { x: 1, y: 1 } })
    settlePrompts(g)
    const aura = Object.values(g.auras).find((r) => r.name === 'Man-made Ice Age')!
    expect(aura.squares).toEqual(expect.arrayContaining([{ x: 1, y: 2 }, { x: 2, y: 2 }]))
    expect(isDisabled(g, inside)).toBe(true)
    expect(isDisabled(g, bearer)).toBe(true)
    expect(artifactSilenced(g, art), 'the artifact has no abilities').toBe(true)
    expect(isDisabled(g, outside)).toBe(false)
    const av = g.units[g.players[0].avatarUnitId]
    expect(isDisabled(g, av)).toBe(false)
    // leaving the area frees it
    shove(g, inside.id, 4, 2)
    expect(isDisabled(g, g.units[inside.id])).toBe(false)
  })
})

describe('Full-tilt Goliaths', () => {
  it('has Charge; Genesis → nearby sites are silenced until your next turn, even after the Goliaths move on', () => {
    const g = board()
    expect(getKeywords('Full-tilt Goliaths').charge).toBeTruthy()
    castMinion(g, 0, 'Full-tilt Goliaths', 2, 1)
    const goliaths = unitNamed(g, 'Full-tilt Goliaths')!
    for (const [x, y] of [[2, 1], [1, 0], [3, 2], [1, 2]]) expect(siteSilenced(g, siteAt(g, x, y)!), `${x},${y}`).toBe(true)
    expect(siteSilenced(g, siteAt(g, 2, 3)!), 'two steps away').toBe(false)
    expect(g.units[goliaths.id].silenced, 'FAQ: sites only — units are not silenced').toBeFalsy()
    shove(g, goliaths.id, 4, 3)
    expect(siteSilenced(g, siteAt(g, 2, 1)!), 'the snow stays where it fell').toBe(true)
    expect(siteSilenced(g, siteAt(g, 4, 3)!)).toBe(false)
    passRound(g)
    expect(siteSilenced(g, siteAt(g, 2, 1)!)).toBe(false)
  })
})

describe('Humming Hummocks', () => {
  it('Genesis → until your next turn nearby allies are Protected from all but units', () => {
    const g = board()
    const near = summonCard(g, 0, 'Stygian Archers', 2, 2)
    const far = summonCard(g, 0, 'Stygian Archers', 4, 3)
    const foe = summonCard(g, 1, 'Stygian Archers', 2, 2)
    playSite(g, 0, 'Humming Hummocks', 2, 1)
    // Magic can't target it — not even its own controller's
    expect(castMagicFail(g, 0, 'Zap!', { targets: [near.id] })).toMatch(/protected/)
    castMagic(g, 0, 'Zap!', { targets: [far.id] })
    expect(g.units[far.id].damage).toBeGreaterThan(0)
    castMagic(g, 0, 'Zap!', { targets: [foe.id] })
    expect(g.units[foe.id].damage, 'enemies aren\'t protected').toBeGreaterThan(0)
    // nor damage, nor disable it with an untargeted area spell
    const bears = summonCard(g, 0, 'Brown Bears', 2, 1)
    castMagic(g, 0, 'Frost Breath', { casterId: bears.id })
    answer(g, 'n')
    expect(g.units[near.id].damage).toBe(0)
    expect(isDisabled(g, g.units[near.id])).toBe(false)
    // a unit's ability still reaches it: a Hailstriker's hail
    castMinion(g, 0, 'Hailstriker', 2, 3, ['sq:2,2,surface'])
    expect(g.units[near.id].damage).toBe(1)
    // FAQ: an ongoing effect centred on the Hummocks — an ally walking in gains it, one walking out loses it
    shove(g, far.id, 1, 1)
    expect(castMagicFail(g, 0, 'Zap!', { targets: [far.id] })).toMatch(/protected/)
    shove(g, near.id, 4, 3)
    const before = g.units[near.id].damage
    castMagic(g, 0, 'Zap!', { targets: [near.id] })
    expect(g.units[near.id].damage).toBeGreaterThan(before)
    passRound(g)
    waiveThreshold(g, 0)
    shove(g, far.id, 1, 1)
    castMagic(g, 0, 'Zap!', { targets: [far.id] })
    expect(g.units[far.id].damage, 'the protection ended at your next turn').toBeGreaterThan(0)
  })
})

describe('Ancient Thaw', () => {
  it('Genesis → casts an Alpha Beast from your collection here (paying its cost), disabled until your next turn', () => {
    const g = board()
    g.players[0].collection = { 'Grey Wolves': 1, 'Brown Bears': 1, 'Stygian Archers': 2 }
    g.players[0].collectionAlpha = ['Grey Wolves', 'Stygian Archers'] // Brown Bears' copy isn't Alpha; the Archers aren't a Beast
    g.players[0].mana = 1
    playSite(g, 0, 'Ancient Thaw', 2, 1)
    const wolves = unitNamed(g, 'Grey Wolves')!
    expect(wolves, 'Grey Wolves: the only Alpha Beast copy').toBeDefined()
    expect([wolves.x, wolves.y]).toEqual([2, 1])
    expect(g.players[0].collection['Grey Wolves'] ?? 0).toBe(0)
    expect(g.players[0].mana, 'the cast is paid: 1 + the site\'s own 1 − 2').toBe(0)
    expect(isDisabled(g, wolves)).toBe(true)
    expect(unitNamed(g, 'Brown Bears')).toBeUndefined()
    expect(unitNamed(g, 'Stygian Archers'), 'only a Beast').toBeUndefined()
    passRound(g)
    expect(isDisabled(g, g.units[wolves.id])).toBe(false)
  })

  it('with several castable Alpha Beasts you choose one; with none affordable nothing happens', () => {
    const g = board()
    g.players[0].collection = { 'Grey Wolves': 1, 'Autumn Unicorn': 1 }
    g.players[0].collectionAlpha = ['Grey Wolves', 'Autumn Unicorn']
    g.players[0].mana = 10
    playSite(g, 0, 'Ancient Thaw', 2, 1)
    expect(g.prompts[0]?.data?.options).toEqual(['Autumn Unicorn', 'Grey Wolves'])
    answer(g, 'Autumn Unicorn')
    expect(unitNamed(g, 'Autumn Unicorn')).toBeDefined()
    expect(isDisabled(g, unitNamed(g, 'Autumn Unicorn')!)).toBe(true)

    const h = board()
    h.players[0].collection = { 'Autumn Unicorn': 1 }
    h.players[0].collectionAlpha = ['Autumn Unicorn']
    h.players[0].mana = 1
    playSite(h, 0, 'Ancient Thaw', 2, 1)
    expect(unitNamed(h, 'Autumn Unicorn')).toBeUndefined()
    expect(h.players[0].collection['Autumn Unicorn']).toBe(1)
  })

  it('FAQ golden rule: Polar Bears cast this way is the Alpha version — 2 cost, 2 power', () => {
    const g = board()
    g.players[0].collection = { 'Polar Bears': 1 }
    g.players[0].collectionAlpha = ['Polar Bears']
    g.players[0].mana = 1
    playSite(g, 0, 'Ancient Thaw', 2, 1)
    const bears = unitNamed(g, 'Polar Bears')!
    expect(bears, 'affordable at 2 (1 + the site\'s 1)').toBeDefined()
    expect(g.players[0].mana).toBe(0)
    expect(effAttack(g, bears)).toBe(2)
    expect(bears.modifiers.some((m) => m.note === 'Alpha printing')).toBe(true)
    // a Polar Bears cast normally is today's 3-cost, 3-power printing
    const cid = injectToHand(g, 0, 'Polar Bears')
    g.players[0].mana = 3
    act(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 1 } })
    const other = Object.values(g.units).find((u) => u.name === 'Polar Bears' && u.id !== bears.id)!
    expect(g.players[0].mana).toBe(0)
    expect(effAttack(g, other)).toBe(3)
  })
})

describe('Humming Hummocks — every way a non-unit could reach a protected ally', () => {
  function hummocks(g: GameState): void {
    playSite(g, 0, 'Humming Hummocks', 2, 1)
  }

  it('a Magic that disables through the shared helper (Frostbolt) spares it', () => {
    const g = board()
    const av = g.units[g.players[0].avatarUnitId]
    const foe = summonCard(g, 1, 'Brown Bears', av.x, av.y + 1) // 4/4: survives the 3 damage
    const ally = summonCard(g, 0, 'Stygian Archers', av.x + 1, av.y + 1)
    const foe2 = summonCard(g, 1, 'Stygian Archers', av.x - 1, av.y + 1)
    playSite(g, 0, 'Humming Hummocks', av.x + 1, av.y + 1)
    castMagic(g, 0, 'Frostbolt', { extra: { direction: 'n' } })
    settlePrompts(g)
    expect(isDisabled(g, g.units[foe.id])).toBe(true)
    expect(isDisabled(g, g.units[foe2.id])).toBe(true)
    expect(isDisabled(g, g.units[ally.id]), 'protected from the Magic').toBe(false)
  })

  it('a Magic that destroys directly (Satanic Panic) spares it', () => {
    const g = board()
    const demon = summonCard(g, 0, 'Hailstriker', 2, 2)
    const farDemon = summonCard(g, 1, 'Hailstriker', 4, 3)
    const other = summonCard(g, 1, 'Stygian Archers', 0, 3)
    hummocks(g)
    castMagic(g, 0, 'Satanic Panic', { targets: [other.id] })
    expect(g.units[demon.id], 'protected ally survives').toBeDefined()
    expect(g.units[farDemon.id]).toBeUndefined()
    expect(g.units[other.id]).toBeUndefined()
  })

  it('its artifacts and auras can\'t modify it: no bearer power, no shackles', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Stygian Archers', 2, 2)
    giveArtifact(g, ally, 'Hand of Glory')
    const shackled = summonCard(g, 0, 'Stygian Archers', 1, 2)
    giveArtifact(g, shackled, 'Iron Shackles')
    expect(effAttack(g, ally)).toBe(4)
    expect(isDisabled(g, shackled)).toBe(true)
    hummocks(g)
    expect(effAttack(g, ally), 'Hand of Glory\'s +1 is a modification').toBe(3)
    expect(isDisabled(g, shackled)).toBe(false)
    passRound(g)
    expect(effAttack(g, g.units[ally.id])).toBe(4)
    expect(isDisabled(g, g.units[shackled.id])).toBe(true)
  })
})

describe('Frostbolt — FAQ simultaneity', () => {
  it('the unit it kills is disabled with the others, so its Deathrite does not fire', () => {
    const g = board()
    const av = g.units[g.players[0].avatarUnitId]
    const scarabs = summonCard(g, 1, 'Sacred Scarabs', av.x, av.y + 1)
    const archers = summonCard(g, 1, 'Stygian Archers', av.x, av.y + 1)
    castMagic(g, 0, 'Frostbolt', { extra: { direction: 'n' } })
    if (g.prompts.length) answer(g, [scarabs.id])
    expect(g.units[scarabs.id]).toBeUndefined()
    expect(g.units[archers.id]?.damage, 'no Deathrite blast').toBe(0)
    expect(isDisabled(g, g.units[archers.id])).toBe(true)
  })
})

describe('Permafrost — within one action', () => {
  it('a disable lands, ends and the minion is checked — all before the board settles: still held', () => {
    const g = board()
    playSite(g, 0, 'Permafrost', 2, 2)
    const foe = summonCard(g, 1, 'Stygian Archers', 2, 2)
    disableUntilYourNextTurn(g, foe.id, 0)
    // the timed disable runs out at once (no checkStateBased in between)
    g.units[foe.id].modifiers = []
    expect(isDisabled(g, g.units[foe.id]), 'held from the moment it was disabled').toBe(true)
    shove(g, foe.id, 3, 2)
    expect(isDisabled(g, g.units[foe.id])).toBe(false)
  })

  it('disabled and moved off in one action: released; moved on disabled: held at once', () => {
    const g = board()
    playSite(g, 0, 'Permafrost', 2, 2)
    const a = summonCard(g, 1, 'Stygian Archers', 2, 2)
    disableUntilYourNextTurn(g, a.id, 0)
    shove(g, a.id, 3, 2)
    expect(isDisabled(g, g.units[a.id]), 'removed as it leaves, with no board settle in between').toBe(false)

    const legion = summonCard(g, 0, 'Hibernal Legion', 1, 1)
    const b = summonCard(g, 1, 'Stygian Archers', 1, 1)
    endTurn(g)
    settlePrompts(g)
    shove(g, b.id, 2, 2)
    killUnit(g, legion.id)
    expect(isDisabled(g, g.units[b.id]), 'held as it arrived').toBe(true)
  })
})

describe('Humming Hummocks — impediments and script-built picks', () => {
  /** drop an aura straight onto the board */
  function aura(g: GameState, name: string, squares: { x: number; y: number }[], extra: Record<string, unknown> = {}): void {
    const cid = `caura${g.nextId++}`
    g.cards[cid] = { id: cid, name, owner: 1 }
    const id = `raura${g.nextId++}`
    ;(g.auras as any)[id] = { id, cardId: cid, name, controller: 1, squares, ...extra }
  }

  it('a Blizzard cannot stop its attack (or its intercept); an unprotected ally is still stopped', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Stygian Archers', 2, 2)
    const plain = summonCard(g, 0, 'Stygian Archers', 4, 3)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2)
    aura(g, 'Blizzard', [{ x: 2, y: 2 }, { x: 4, y: 3 }])
    playSite(g, 0, 'Humming Hummocks', 2, 1)
    expect(attackBlockedAt(g, 2, 2, foe, ally), 'protected attacker').toBe(false)
    expect(attackBlockedAt(g, 4, 3, undefined, plain), 'unprotected attacker').toBe(true)
    act(g, 0, { t: 'moveAttack', unitId: ally.id, path: [], attack: { unit: foe.id } } as any)
    settlePrompts(g)
    expect(g.units[foe.id], 'the attack went through the Blizzard').toBeUndefined()
  })

  it('a Blizzard cannot stop it from intercepting either', () => {
    for (const protectedInterceptor of [true, false]) {
      const g = board()
      const mover = summonCard(g, 0, 'Stygian Archers', 1, 2)
      const guard = summonCard(g, 1, 'Stygian Archers', 2, 2)
      aura(g, 'Blizzard', [{ x: 2, y: 2 }])
      if (protectedInterceptor) playSite(g, 1, 'Humming Hummocks', 2, 3)
      act(g, 0, { t: 'moveAttack', unitId: mover.id, path: [{ x: 2, y: 2, region: 'surface' }] } as any)
      const offered = g.prompts.some((pr) => pr.kind === 'intercept' && (pr.data?.candidates ?? []).some((c: any) => (c?.id ?? c?.unitId ?? c) === guard.id))
      expect(offered, protectedInterceptor ? 'protected: may intercept' : 'unprotected: the Blizzard stops it').toBe(protectedInterceptor)
    }
  })

  it('an aura wall, an artifact entry ban and a Bog do not impede its movement', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Stygian Archers', 2, 2)
    const plain = summonCard(g, 0, 'Stygian Archers', 4, 2) // not nearby the Hummocks
    aura(g, 'Wall of Ice', [{ x: 2, y: 2 }, { x: 2, y: 3 }], { edge: { a: { x: 2, y: 2 }, b: { x: 2, y: 3 } } })
    aura(g, 'Wall of Ice', [{ x: 4, y: 2 }, { x: 4, y: 3 }], { edge: { a: { x: 4, y: 2 }, b: { x: 4, y: 3 } } })
    const step = (u: typeof ally, dx: number, dy: number) =>
      isLegalStep(g, g.units[u.id], { x: u.x, y: u.y, region: 'surface' }, { x: u.x + dx, y: u.y + dy, region: 'surface' })
    expect(step(ally, 0, 1), 'walled before the Hummocks').toBe(false)
    playSite(g, 0, 'Humming Hummocks', 2, 1)
    expect(step(ally, 0, 1), 'the wall is an aura: it cannot impede it').toBe(true)
    expect(step(plain, 0, 1), 'an unprotected ally is still walled').toBe(false)
    g.flow.immobileSites = [{ siteId: siteAt(g, 2, 2)!.id, player: 1, turn: g.turn }]
    expect(step(ally, 1, 0), 'Bog/Quagmire immobility does not hold it').toBe(true)
  })

  it('a pick list a Magic builds itself (Swap) leaves it out', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Stygian Archers', 2, 2)
    const a = summonCard(g, 1, 'Stygian Archers', 4, 3)
    const b = summonCard(g, 1, 'Bone Jumble', 0, 3)
    playSite(g, 0, 'Humming Hummocks', 2, 1)
    castMagic(g, 0, 'Swap')
    const cands = g.prompts[0]?.data?.candidates as string[]
    expect(cands).toContain(a.id)
    expect(cands).toContain(b.id)
    expect(cands, 'protected from the pick of the Magic').not.toContain(ally.id)
  })

  it('a sacrifice pick (Elder Ruins) is not targeting, so a protected ally can still be offered', () => {
    const g = board()
    playSite(g, 0, 'Humming Hummocks', 2, 1)
    const ally = summonCard(g, 0, 'Stygian Archers', 2, 2)
    const ruinsId = playSite(g, 0, 'Elder Ruins', 2, 2)
    g.players[0].collection = { Shoggoth: 1 }
    giveMana(g, 0, 20)
    act(g, 0, { t: 'activate', sourceId: ruinsId, ability: 'offering' })
    expect(g.prompts[0]?.data?.candidates).toContain(ally.id)
  })
})

describe('review fixes — one source-aware protection predicate', () => {
  it('Protected from sites (Key to the City) stops a site\'s damage, kill, disable, move, buff and target', () => {
    const g = board()
    const bearer = summonCard(g, 0, 'Stygian Archers', 2, 2)
    giveArtifact(g, bearer, 'Key to the City')
    const plain = summonCard(g, 0, 'Stygian Archers', 3, 2)
    const site = siteAt(g, 2, 1)!
    const ctx = makeCtx(g, site.id, 0, [])
    expect(protectedFromSource(g, bearer, 'site')).toBe(true)
    expect(protectedFromSource(g, bearer, 'magic'), 'a Key protects from sites only').toBe(false)
    ctx.dealDamage({ unit: bearer.id }, 1)
    ctx.dealDamage({ unit: plain.id }, 1)
    expect(g.units[bearer.id].damage).toBe(0)
    expect(g.units[plain.id].damage).toBe(1)
    // the flipped Druid's thorns: a site-named damage source dealt straight through dealDamageToUnit
    dealDamageToUnit(g, g.units[bearer.id], 1, 1, { source: { player: 1, kind: 'ability', name: site.name } })
    expect(g.units[bearer.id].damage).toBe(0)
    expect(disableUntilYourNextTurn(ctx, bearer.id)).toBe(false)
    expect(isDisabled(g, g.units[bearer.id])).toBe(false)
    ctx.grantKeyword(bearer.id, 'airborne', 'endOfTurn')
    expect(g.units[bearer.id].modifiers.length).toBe(0)
    expect(ctx.teleport(bearer.id, 0, 0)).toBe(false)
    ctx.kill(bearer.id)
    expect(g.units[bearer.id], 'not destroyed by the site').toBeDefined()
    ctx.ask({ kind: 'chooseTargets', title: 'pick', data: { candidates: [bearer.id, plain.id], count: 1, kind: 'unit' } }, 'x')
    expect(g.prompts.at(-1)!.data.candidates, 'a site\'s own pick list leaves it out').toEqual([plain.id])
    // a unit source still reaches it
    expect(protectedFromSource(g, bearer, 'unit')).toBe(false)
  })

  it('Failed Mutation is only "can\'t be targeted or damaged by magic": an untargeted Magic still disables it', () => {
    const g = board()
    const bears = summonCard(g, 0, 'Brown Bears', 2, 1)
    const mutant = summonCard(g, 1, 'Failed Mutation', 2, 2)
    castMagic(g, 0, 'Frost Breath', { casterId: bears.id })
    answer(g, 'n')
    expect(g.units[mutant.id].damage, 'no magic damage').toBe(0)
    expect(isDisabled(g, g.units[mutant.id]), 'disabled: its text bars targeting and damage only').toBe(true)
  })

  it('Permafrost doesn\'t hold a minion Protected from sites', () => {
    const g = board()
    playSite(g, 0, 'Permafrost', 2, 2)
    const bearer = summonCard(g, 1, 'Stygian Archers', 2, 2)
    giveArtifact(g, bearer, 'Key to the City')
    disableUntilYourNextTurn(g, bearer.id, 0)
    checkStateBased(g)
    passRound(g)
    expect(isDisabled(g, g.units[bearer.id]), 'its timed disable ran out normally').toBe(false)
  })

  it('automatons count as units for protection (Clay Golem)', () => {
    expect(sourceKindOfName('Clay Golem')).toBe('unit')
    expect(sourceKindOfName('Permafrost')).toBe('site')
    expect(sourceKindOfName('Frostbolt')).toBe('magic')
  })

  it('Ancient Thaw: a stale Thaw record never gives a later Polar Bears the Alpha rule', () => {
    const g = board()
    const thawId = playSite(g, 0, 'Ancient Thaw', 2, 1) // empty collection: nothing cast
    // a cast that parked and was abandoned: its card is no longer in hand
    g.flow.ancientThaw = { siteId: thawId, player: 0, name: 'Polar Bears', x: 2, y: 1, turn: g.turn, cardId: 'cgone' }
    const cid = injectToHand(g, 0, 'Polar Bears')
    g.players[0].mana = 3
    act(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 1 } })
    const bears = unitNamed(g, 'Polar Bears')!
    expect(g.players[0].mana, 'full cost').toBe(0)
    expect(effAttack(g, bears)).toBe(3)
    expect(isDisabled(g, bears)).toBe(false)
    endTurn(g)
    settlePrompts(g)
    expect(g.flow?.ancientThaw, 'cleared at the end of the turn').toBeUndefined()
  })

  it('Full-tilt Goliaths charges Vindictive Nation only for sites it actually silences', () => {
    const g = board()
    const swap = (x: number, y: number, name: string) => { delete g.sites[siteAt(g, x, y)!.id]; return placeSite(g, 1, name, x, y) }
    swap(2, 3, 'Vindictive Nation')
    swap(2, 2, 'Bedrock')
    swap(1, 2, 'Rustic Village')
    const silent = swap(3, 2, 'Rustic Village')
    g.flow.siteSilences = [{ siteIds: [silent.id], player: 1, turn: g.turn }]
    const life = g.units[g.players[0].avatarUnitId].life!
    castMinion(g, 0, 'Full-tilt Goliaths', 2, 1)
    expect(g.units[g.players[0].avatarUnitId].life, 'only (1,2) was modified').toBe(life - 1)
  })

  it('a Legion that left the realm has its freeze dropped at the next state check', () => {
    const g = board()
    const legion = summonCard(g, 0, 'Hibernal Legion', 2, 1)
    summonCard(g, 1, 'Stygian Archers', 2, 1)
    endTurn(g)
    settlePrompts(g)
    expect(g.flow.hibernalFreezes?.length).toBe(1)
    killUnit(g, legion.id)
    checkStateBased(g)
    expect(g.flow?.hibernalFreezes).toBeUndefined()
  })
})

describe('Ancient Thaw — the Alpha printing of the copy you own', () => {
  const thawDeck = (art?: Record<string, string>): DeckList => {
    const base = starterDecks[0]
    return { ...base, collection: { 'Polar Bears': 1, 'Grey Wolves': 1 }, ...(art ? { art } : {}) } as DeckList
  }
  function start(deck0: DeckList): GameState {
    const g = createGame([deck0, starterDecks[1]], ['Alice', 'Bob'], 42, 0)
    g.players[0].firstSiteDone = true; g.players[1].firstSiteDone = true
    keepBoth(g)
    waiveThreshold(g, 0)
    fillSites(g)
    return g
  }

  it('the printings list has a separate Alpha entry for Polar Bears; an Alpha slug stays Alpha', () => {
    const alpha = printingsFor('Polar Bears').find((pr) => pr.set === 'Alpha')
    expect(alpha?.slug).toBe('001-polar_bears-b-s')
    expect(printingsFor('Polar Bears').some((pr) => pr.slug === '002-polar_bears-b-s')).toBe(true)
    expect(canonicalArtSlug('Polar Bears', '001-polar_bears-b-f'), 'an Alpha foil → the Alpha art').toBe('001-polar_bears-b-s')
    expect(canonicalArtSlug('Polar Bears', '002-polar_bears-b-f'), 'a Beta foil → the Beta art').toBe('002-polar_bears-b-s')
  })

  it('a constructed deck with Polar Bears marked Alpha: cast through the Thaw as a 2-power Bears for 2', () => {
    const g = start(thawDeck({ 'Polar Bears': '001-polar_bears-b-s' }))
    expect(g.players[0].collectionAlpha).toEqual(['Polar Bears'])
    g.players[0].mana = 1
    playSite(g, 0, 'Ancient Thaw', 2, 1)
    const bears = unitNamed(g, 'Polar Bears')!
    expect(bears, 'the only Alpha copy: no prompt').toBeDefined()
    expect(g.players[0].mana).toBe(0)
    expect(effAttack(g, bears)).toBe(2)
    expect(g.cards[bears.cardId].art, 'the cast copy shows its Alpha art').toBe('001-polar_bears-b-s')
    expect(unitNamed(g, 'Grey Wolves'), 'Grey Wolves had an Alpha printing, but this copy is not one').toBeUndefined()
  })

  it('the same deck without the Alpha mark: nothing is offered', () => {
    const g = start(thawDeck())
    expect(g.players[0].collectionAlpha).toBeUndefined()
    g.players[0].mana = 10
    playSite(g, 0, 'Ancient Thaw', 2, 1)
    expect(g.prompts.length).toBe(0)
    expect(unitNamed(g, 'Polar Bears')).toBeUndefined()
  })

  it('the Frost Mage precon: its copies are FvL printings — the Thaw finds nothing, even with Alpha art chosen', () => {
    const precon = PRECONS.find((p) => p.avatar === 'Frost Mage')!
    const deck = { avatar: precon.avatar, spellbook: precon.spellbook, atlas: precon.atlas, collection: precon.collection,
      art: { 'Plumed Pegasus': '001-plumed_pegasus-b-s', 'Tufted Turtles': '001-tufted_turtles-b-s' } } as unknown as DeckList
    expect(matchPrecon(deck)).toBeTruthy()
    const g = start(deck)
    expect(g.players[0].collectionAlpha).toBeUndefined()
    expect(Object.values(g.cards).some((c) => c.owner === 0 && c.alpha), 'no Alpha copy anywhere').toBe(false)
    g.players[0].mana = 10
    playSite(g, 0, 'Ancient Thaw', 2, 1)
    expect(g.prompts.length, 'no prompt').toBe(0)
    expect(Object.values(g.units).some((u) => u.name === 'Plumed Pegasus' || u.name === 'Tufted Turtles')).toBe(false)
  })

  it('the opponent never sees an unrevealed Alpha flag', () => {
    const deck = { ...thawDeck({ 'Polar Bears': '001-polar_bears-b-s' }), spellbook: { ...starterDecks[0].spellbook, 'Polar Bears': 2 } } as DeckList
    const g = start(deck)
    const hidden = g.players[0].spellbook.find((id) => g.cards[id].name === 'Polar Bears')!
    expect(g.cards[hidden].alpha).toBe(true)
    const theirs = viewFor(g, 1)
    expect(theirs.cards[hidden], 'a spellbook card is not sent at all').toBeUndefined()
    expect(theirs.players[0].collectionAlpha).toBeUndefined()
    expect(viewFor(g, 0).players[0].collectionAlpha).toEqual(['Polar Bears'])
  })
})

describe('Permafrost — owner ruling: only a disable that actually landed is held', () => {
  it('a Yeti So Shy on an outer Permafrost square is never disabled, so never held', () => {
    const g = board()
    const pf = playSite(g, 0, 'Permafrost', 0, 1)
    const yeti = summonCard(g, 1, 'A Yeti So Shy', 0, 1)
    checkStateBased(g)
    expect(isDisabled(g, yeti)).toBe(false)
    expect((g.flow?.permafrostHolds ?? []).some((h: { unitId: string }) => h.unitId === yeti.id)).toBe(false)
    passRound(g)
    expect(isDisabled(g, g.units[yeti.id])).toBe(false)
    expect(g.sites[pf]).toBeDefined()
  })

  it('an Outerbound Yeti really disabled at Permafrost stays disabled after its condition would end', () => {
    const g = board()
    playSite(g, 0, 'Permafrost', 0, 1)
    const yeti = summonCard(g, 1, 'A Yeti So Shy', 0, 1)
    const carrier = summonCard(g, 0, 'Stygian Archers', 4, 3)
    const globe = giveArtifact(g, carrier, 'Magellan Globe') // edges connected: no square is on the outside
    checkStateBased(g)
    expect(isDisabled(g, yeti), 'Outerbound: nowhere is outside under the Globe').toBe(true)
    delete g.artifacts[globe.id]
    carrier.carrying = []
    expect(isDisabled(g, g.units[yeti.id]), 'back on the outside — but Permafrost holds the disable').toBe(true)
    shove(g, yeti.id, 0, 2)
    expect(isDisabled(g, g.units[yeti.id]), 'released as it leaves (and it is on the outside)').toBe(false)
  })

  it('an Arctic Fox ("can’t be disabled") is never held', () => {
    const g = board()
    playSite(g, 0, 'Permafrost', 2, 2)
    const fox = summonCard(g, 1, 'Arctic Fox', 2, 2)
    disableUntilYourNextTurn(g, fox.id, 0)
    checkStateBased(g)
    expect(isDisabled(g, g.units[fox.id])).toBe(false)
    expect((g.flow?.permafrostHolds ?? []).some((h: { unitId: string }) => h.unitId === fox.id)).toBe(false)
  })

  it('a disable a protection prevented is never held', () => {
    const g = board()
    playSite(g, 0, 'Permafrost', 2, 2)
    const ally = summonCard(g, 0, 'Stygian Archers', 2, 2)
    playSite(g, 0, 'Humming Hummocks', 2, 1)
    const bears = summonCard(g, 0, 'Brown Bears', 2, 1)
    castMagic(g, 0, 'Frost Breath', { casterId: bears.id })
    answer(g, 'n')
    checkStateBased(g)
    expect(isDisabled(g, g.units[ally.id])).toBe(false)
    expect((g.flow?.permafrostHolds ?? []).some((h: { unitId: string }) => h.unitId === ally.id)).toBe(false)
  })
})
