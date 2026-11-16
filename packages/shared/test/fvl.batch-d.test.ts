// Frost Mage vs Lavamancer, batch D: damage, projectiles, transforms — King Krakalak, None Survive the Sun,
// Tusslin' Trolls, Bearserker, Sunspear Tribe, Flametongue Newt, Sissi Marksmen.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer, act, actFail, waiveThreshold, giveMana, giveArtifact, injectToHand, fillSites, settlePrompts } from './helpers'
import { siteAt, endTurn, getScript, makeCtx, GRID_H, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

const avatarOf = (g: GameState, p: PlayerId) => g.units[g.players[p].avatarUnitId]

function board(): GameState {
  const g = newGame() as GameState
  keepBoth(g)
  waiveThreshold(g, 0)
  return g
}

/** an ability's threshold: abilities aren't covered by waiveThreshold, so grant the affinity */
function grantAffinity(g: GameState, p: PlayerId, t: Partial<Record<'air' | 'earth' | 'fire' | 'water', number>>): void {
  g.flow = g.flow ?? {}
  g.flow.judgeThresh = { ...(g.flow.judgeThresh ?? {}), [p]: { air: 0, earth: 0, fire: 0, water: 0, ...t } }
}

/** cast a minion/aura from an injected hand copy (full mana) */
function cast(g: GameState, p: PlayerId, name: string, at: { x: number; y: number }): void {
  const cardId = injectToHand(g, p, name)
  giveMana(g, p, 20)
  act(g, p, { t: 'castSpell', cardId, casterId: avatarOf(g, p).id, at })
}

describe('King Krakalak', () => {
  it('sacrifices its site to blast 5 there and 3 at the eight sites around, every region, sparing itself', () => {
    const g = board()
    fillSites(g, 0)
    const centre = siteAt(g, 1, 1)!
    const here = summonCard(g, 1, 'Ten-tonne Slug', 1, 1)
    const orth = summonCard(g, 1, 'Ten-tonne Slug', 2, 1)
    const diag = summonCard(g, 1, 'Ten-tonne Slug', 0, 2)
    const ally = summonCard(g, 0, 'Ten-tonne Slug', 1, 0)
    const far = summonCard(g, 1, 'Ten-tonne Slug', 3, 1)
    cast(g, 0, 'King Krakalak', { x: 1, y: 1 })
    settlePrompts(g)
    const king = Object.values(g.units).find((u) => u.name === 'King Krakalak')!
    expect(king.damage, 'each OTHER unit').toBe(0)
    expect(g.units[here.id].damage).toBe(5)
    expect(g.units[orth.id].damage).toBe(3)
    expect(g.units[diag.id].damage).toBe(3)
    expect(g.units[ally.id].damage, 'allies too').toBe(3)
    expect(g.units[far.id].damage).toBe(0)
    expect(g.sites[centre.id], 'the site is sacrificed').toBeUndefined()
    expect(siteAt(g, 1, 1)?.isRubble, 'replaced by Rubble').toBe(true)
    expect(g.players[0].cemetery).toContain(centre.cardId)
  })

  it('a Ward does not save the sacrificed site', () => {
    const g = board()
    fillSites(g, 0)
    const centre = siteAt(g, 1, 1)!
    centre.ward = true
    cast(g, 0, 'King Krakalak', { x: 1, y: 1 })
    settlePrompts(g)
    expect(siteAt(g, 1, 1)?.isRubble).toBe(true)
  })

  it('on a site it does not control, there is nothing to sacrifice and no blast', () => {
    const g = board()
    fillSites(g, 0)
    const theirs = siteAt(g, 1, 1)!
    theirs.controller = 1
    const foe = summonCard(g, 1, 'Ten-tonne Slug', 2, 1)
    // summoned by an effect onto the enemy site (the cast path needs a site of yours)
    const king = summonCard(g, 0, 'King Krakalak', 1, 1)
    g.units[king.id].enteredTurn = g.turn
    // fire the Genesis directly through the script
    getScript('King Krakalak')!.genesis!(makeCtx(g, king.id, 0, []))
    expect(g.units[foe.id].damage).toBe(0)
    expect(g.sites[theirs.id]).toBeDefined()
  })
})

describe('None Survive the Sun', () => {
  it('at the end of each turn burns surface minions (20 here, 1 elsewhere), then moves one step west, then sets', () => {
    const g = board()
    fillSites(g, 0)
    cast(g, 0, 'None Survive the Sun', { x: 1, y: 1 })
    settlePrompts(g)
    const sun = Object.values(g.auras).find((a) => a.name === 'None Survive the Sun')!
    expect(sun.squares).toHaveLength(4)
    const slug = summonCard(g, 1, 'Ten-tonne Slug', 2, 2) // under the sun
    const jumble = summonCard(g, 1, 'Bone Jumble', 4, 3) // elsewhere: 1 damage kills a 1/1
    const archers = summonCard(g, 0, 'Stygian Archers', 4, 0) // elsewhere: survives 1
    const lifeBefore = [avatarOf(g, 0).life, avatarOf(g, 1).life]
    endTurn(g)
    settlePrompts(g)
    expect(g.units[slug.id], '20 under the sun').toBeUndefined()
    expect(g.units[jumble.id], '1 elsewhere').toBeUndefined()
    expect(g.units[archers.id]).toBeDefined()
    expect([avatarOf(g, 0).life, avatarOf(g, 1).life], 'minions only').toEqual(lifeBefore)
    const moved = g.auras[sun.id]
    expect(moved.anchor).toEqual({ x: 0, y: 1 })
    expect(moved.squares.map((s) => `${s.x},${s.y}`).sort()).toEqual(['0,1', '0,2', '1,1', '1,2'])
    // the next end of turn: burns at its new place, then can't go further west → dispelled
    const westSlug = summonCard(g, 0, 'Ten-tonne Slug', 0, 1)
    endTurn(g)
    settlePrompts(g)
    expect(g.units[westSlug.id]).toBeUndefined()
    expect(g.auras[sun.id], 'dispelled at the western edge').toBeUndefined()
    expect(g.players[0].cemetery).toContain(sun.cardId)
  })
})

describe('None Survive the Sun — FAQ / codex rulings', () => {
  it('FAQ: minions in the void do not burn — only "minions on the surface"', () => {
    const g = board()
    fillSites(g, 0)
    const gap = siteAt(g, 4, 2)!
    delete g.sites[gap.id]
    const revenant = summonCard(g, 1, 'Vril Revenant', 4, 2, 'void') // a 1/1 Voidwalker
    cast(g, 0, 'None Survive the Sun', { x: 1, y: 1 })
    settlePrompts(g)
    endTurn(g)
    settlePrompts(g)
    expect(g.units[revenant.id], 'untouched in the void').toBeDefined()
  })

  it('codex East and West: west is the FIRST player’s left, whoever controls the sun', () => {
    const g = newGame(42, 1) as GameState // player 1 goes first: their left is +x
    keepBoth(g)
    waiveThreshold(g, 1)
    fillSites(g, 1)
    cast(g, 1, 'None Survive the Sun', { x: 2, y: 1 })
    settlePrompts(g)
    const sun = Object.values(g.auras).find((a) => a.name === 'None Survive the Sun')!
    endTurn(g)
    settlePrompts(g)
    expect(g.auras[sun.id].anchor, 'one step toward +x').toEqual({ x: 3, y: 1 })
    endTurn(g)
    settlePrompts(g)
    expect(g.auras[sun.id], 'past the first player’s western edge → dispelled').toBeUndefined()
  })

  it('FAQ: with Magellan Globe the sun wraps around the realm and sticks around forever', () => {
    const g = board()
    fillSites(g, 0)
    const cid = `ctest${g.nextId++}`
    g.cards[cid] = { id: cid, name: 'Magellan Globe', owner: 0 } as any
    const aid = `atest${g.nextId++}`
    g.artifacts[aid] = { id: aid, cardId: cid, name: 'Magellan Globe', conjuredBy: 0, x: 4, y: 3, region: 'surface', carriedBy: null, tapped: false } as any
    cast(g, 0, 'None Survive the Sun', { x: 0, y: 1 })
    settlePrompts(g)
    const sun = Object.values(g.auras).find((a) => a.name === 'None Survive the Sun')!
    endTurn(g)
    settlePrompts(g)
    expect(g.auras[sun.id].anchor).toEqual({ x: 4, y: 1 })
    expect(g.auras[sun.id].squares.map((q) => `${q.x},${q.y}`).sort()).toEqual(['0,1', '0,2', '4,1', '4,2'])
    for (let i = 0; i < 6; i++) { endTurn(g); settlePrompts(g) }
    expect(g.auras[sun.id], 'still in the sky').toBeDefined()
  })
})

describe("Tusslin' Trolls", () => {
  function setup(roll: number) {
    const g = board()
    fillSites(g, 0)
    const trolls = summonCard(g, 0, "Tusslin' Trolls", 1, 1)
    const holder = summonCard(g, 0, 'Bone Jumble', 4, 0)
    giveArtifact(g, holder, 'Kythera Mechanism') // you determine the D6
    const foe = summonCard(g, 1, 'Stygian Archers', 1, 2) // adjacent, 3/3
    const far = summonCard(g, 1, 'Stygian Archers', 3, 1) // two steps away
    const below = summonCard(g, 1, 'Stygian Archers', 1, 1)
    below.region = 'underground' // not in the Trolls' region
    endTurn(g)
    const p = g.prompts[0] as any
    expect(p?.kind).toBe('chooseTargets')
    expect(p.data.candidates).toContain(foe.id)
    expect(p.data.candidates).not.toContain(far.id)
    expect(p.data.candidates).not.toContain(below.id)
    expect(p.data.candidates, 'no "other": the Trolls are a minion adjacent to themselves').toContain(trolls.id)
    answer(g, [foe.id])
    expect(g.prompts[0]?.kind, 'then the D6').toBe('chooseOption')
    answer(g, String(roll))
    settlePrompts(g)
    return { g, foe }
  }

  it('at the end of your turn strikes a target adjacent minion for the D6 roll: 3 kills a 3/3', () => {
    const { g, foe } = setup(3)
    expect(g.units[foe.id]).toBeUndefined()
  })

  it('a roll of 2 does not', () => {
    const { g, foe } = setup(2)
    expect(g.units[foe.id]).toBeDefined()
  })
})

describe("Tusslin' Trolls — FAQ rulings", () => {
  it('FAQ: with no other adjacent minion they must strike themselves', () => {
    const g = board()
    fillSites(g, 0)
    const trolls = summonCard(g, 0, "Tusslin' Trolls", 0, 2)
    const holder = summonCard(g, 0, 'Bone Jumble', 4, 0)
    giveArtifact(g, holder, 'Kythera Mechanism')
    endTurn(g)
    const p = g.prompts[0] as any
    if (p?.kind === 'chooseTargets') {
      expect(p.data.candidates).toEqual([trolls.id])
      expect(p.data.upTo, 'not optional').toBe(false)
      answer(g, [trolls.id])
    }
    expect(g.prompts[0]?.kind, 'the D6').toBe('chooseOption')
    answer(g, '4')
    settlePrompts(g)
    expect(g.units[trolls.id], 'a 4/4 struck for 4 by itself').toBeUndefined()
  })

  it('FAQ: the target is picked first; the D6 is rolled as the ability resolves', () => {
    const g = board()
    fillSites(g, 0)
    summonCard(g, 0, "Tusslin' Trolls", 1, 1)
    const holder = summonCard(g, 0, 'Bone Jumble', 4, 0)
    giveArtifact(g, holder, 'Kythera Mechanism')
    const foe = summonCard(g, 1, 'Stygian Archers', 1, 2)
    endTurn(g)
    expect(g.prompts[0]?.kind, 'no roll before the target').toBe('chooseTargets')
    expect(g.prompts.some((q) => q.kind === 'chooseOption')).toBe(false)
    answer(g, [foe.id])
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    expect((g.prompts[0] as any).data.options).toEqual(['1', '2', '3', '4', '5', '6'])
  })
})

describe('Bearserker', () => {
  it('(W)(W): pay the difference to transform a Mortal into Bearserker from hand, untapped, keeping its damage', () => {
    const g = board()
    grantAffinity(g, 0, { water: 2 })
    const knight = summonCard(g, 0, 'Penitent Knight', 1, 1) // Mortal, cost 3 → pay 2
    knight.tapped = true
    knight.damage = 1
    const oldCard = knight.cardId
    const card = injectToHand(g, 0, 'Bearserker')
    g.players[0].mana = 2
    act(g, 0, { t: 'activate', sourceId: avatarOf(g, 0).id, ability: `bearserker:${card}` })
    answer(g, [knight.id])
    const u = g.units[knight.id]
    expect(u.name).toBe('Bearserker')
    expect(u.cardId).toBe(card)
    expect(u.tapped).toBe(false)
    expect(u.damage, 'same game object: damage stays').toBe(1)
    expect(g.players[0].mana).toBe(0)
    expect(g.players[0].hand).not.toContain(card)
    expect(g.players[0].banished, 'the old form is banished').toContain(oldCard)
  })

  it('a Bear qualifies by name (Brown Bears, cost 4 → pay 1); without (W)(W) the ability is refused', () => {
    const g = board()
    const bears = summonCard(g, 0, 'Brown Bears', 1, 1)
    const card = injectToHand(g, 0, 'Bearserker')
    g.players[0].mana = 1
    grantAffinity(g, 0, { water: 1 })
    actFail(g, 0, { t: 'activate', sourceId: avatarOf(g, 0).id, ability: `bearserker:${card}` })
    grantAffinity(g, 0, { water: 2 })
    act(g, 0, { t: 'activate', sourceId: avatarOf(g, 0).id, ability: `bearserker:${card}` })
    answer(g, [bears.id])
    expect(g.units[bears.id].name).toBe('Bearserker')
    expect(g.players[0].mana).toBe(0)
  })

  it('a non-Mortal, non-Bear is not offered; an enemy Mortal is, and stays under its controller', () => {
    const g = board()
    grantAffinity(g, 0, { water: 2 })
    const troll = summonCard(g, 0, 'Bosk Troll', 1, 1)
    const enemy = summonCard(g, 1, 'Amazon Warriors', 3, 2) // Mortal, cost 5 → pay 0
    const card = injectToHand(g, 0, 'Bearserker')
    g.players[0].mana = 0
    act(g, 0, { t: 'activate', sourceId: avatarOf(g, 0).id, ability: `bearserker:${card}` })
    const cands = (g.prompts[0] as any).data.candidates as string[]
    expect(cands).not.toContain(troll.id)
    expect(cands).toContain(enemy.id)
    answer(g, [enemy.id])
    expect(g.units[enemy.id].name).toBe('Bearserker')
    expect(g.units[enemy.id].controller).toBe(1)
    expect(g.cards[card].owner).toBe(0)
  })
})

describe('Bearserker — review fix', () => {
  it('a Bearserker is not offered: it cannot untap for free by transforming into itself', () => {
    const g = board()
    grantAffinity(g, 0, { water: 2 })
    const berserk = summonCard(g, 0, 'Bearserker', 1, 1)
    berserk.tapped = true
    const card = injectToHand(g, 0, 'Bearserker')
    g.players[0].mana = 0
    actFail(g, 0, { t: 'activate', sourceId: avatarOf(g, 0).id, ability: `bearserker:${card}` })
    const knight = summonCard(g, 0, 'Amazon Warriors', 2, 1) // another Mortal makes the ability available
    act(g, 0, { t: 'activate', sourceId: avatarOf(g, 0).id, ability: `bearserker:${card}` })
    const cands = (g.prompts[0] as any).data.candidates as string[]
    expect(cands).toContain(knight.id)
    expect(cands).not.toContain(berserk.id)
  })
})

describe('Sunspear Tribe', () => {
  it('once per game throws a projectile for 1', () => {
    const g = board()
    fillSites(g, 0)
    const tribe = summonCard(g, 0, 'Sunspear Tribe', 0, 1)
    const a = summonCard(g, 1, 'Bone Jumble', 3, 1)
    const b = summonCard(g, 1, 'Bone Jumble', 4, 1)
    act(g, 0, { t: 'activate', sourceId: tribe.id, ability: 'spear' })
    answer(g, 'e')
    expect(g.units[a.id], 'the first unit along the line').toBeUndefined()
    expect(g.units[b.id]).toBeDefined()
    expect(actFail(g, 0, { t: 'activate', sourceId: tribe.id, ability: 'spear' })).toBeTruthy()
    endTurn(g); settlePrompts(g); endTurn(g); settlePrompts(g)
    expect(actFail(g, 0, { t: 'activate', sourceId: tribe.id, ability: 'spear' }), 'still spent next turn').toBeTruthy()
  })
})

describe('Flametongue Newt', () => {
  it('once on your turn shoots a projectile for 1', () => {
    const g = board()
    fillSites(g, 0)
    const newt = summonCard(g, 0, 'Flametongue Newt', 0, 1)
    const a = summonCard(g, 1, 'Bone Jumble', 3, 1)
    const b = summonCard(g, 1, 'Bone Jumble', 4, 1)
    act(g, 0, { t: 'activate', sourceId: newt.id, ability: 'spit' })
    answer(g, 'e')
    expect(g.units[a.id]).toBeUndefined()
    expect(actFail(g, 0, { t: 'activate', sourceId: newt.id, ability: 'spit' })).toBeTruthy()
    endTurn(g); settlePrompts(g); endTurn(g); settlePrompts(g)
    act(g, 0, { t: 'activate', sourceId: newt.id, ability: 'spit' })
    answer(g, 'e')
    expect(g.units[b.id], 'again on your next turn').toBeUndefined()
  })
})

describe('Sissi Marksmen', () => {
  const top = GRID_H - 1
  function setup() {
    const g = board()
    fillSites(g, 0)
    const sissi = summonCard(g, 0, 'Sissi Marksmen', 0, top)
    return { g, sissi }
  }

  it('may shoot across the top edge onto the bottom row (asked, since it would hit)', () => {
    const { g, sissi } = setup()
    const foe = summonCard(g, 1, 'Bone Jumble', 0, 0)
    act(g, 0, { t: 'activate', sourceId: sissi.id, ability: 'ranged', extra: { direction: 'n' } })
    expect(g.prompts[0]?.kind).toBe('yesNo')
    answer(g, true)
    expect(g.units[foe.id]).toBeUndefined()
  })

  it('declining keeps the shot on this side: it hits nothing', () => {
    const { g, sissi } = setup()
    const ally = summonCard(g, 0, 'Bone Jumble', 0, 0)
    act(g, 0, { t: 'activate', sourceId: sissi.id, ability: 'ranged', extra: { direction: 'n' } })
    answer(g, false)
    expect(g.units[ally.id]).toBeDefined()
    expect(g.units[sissi.id].tapped).toBe(true)
  })

  it('no prompt when nothing is across the edge, nor for an east/west shot', () => {
    const { g, sissi } = setup()
    act(g, 0, { t: 'activate', sourceId: sissi.id, ability: 'ranged', extra: { direction: 'n' } })
    expect(g.prompts.length).toBe(0)
    const { g: g2, sissi: s2 } = setup()
    summonCard(g2, 1, 'Bone Jumble', 4, top) // across the east/west edge: never reachable
    act(g2, 0, { t: 'activate', sourceId: s2.id, ability: 'ranged', extra: { direction: 'w' } })
    expect(g2.prompts.length).toBe(0)
  })

  it('an ordinary Ranged minion cannot shoot across', () => {
    const g = board()
    fillSites(g, 0)
    const archers = summonCard(g, 0, 'Stygian Archers', 0, top)
    const foe = summonCard(g, 1, 'Bone Jumble', 0, 0)
    act(g, 0, { t: 'activate', sourceId: archers.id, ability: 'ranged', extra: { direction: 'n' } })
    expect(g.prompts.length).toBe(0)
    expect(g.units[foe.id]).toBeDefined()
  })
})
