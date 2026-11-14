// Frost Mage vs Lavamancer, the released set (13 Nov 2026): the cards that were never spoiled. One
// scenario per card's rules text; rulings quoted are from the 13 Nov 2026 FAQ.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, answer, act, actFail, waiveThreshold, giveMana, injectToHand, fillSites, settlePrompts } from './helpers'
import {
  allCards, getCard, getKeywords, isDisabled, effKeywords, effAttack, legalStepsFrom, endTurn, GRID_W, GRID_H,
  type GameState, type PlayerId, type UnitState,
} from '../src'
import '../src/cards/scripts/index'

const avatarOf = (g: GameState, p: PlayerId) => g.units[g.players[p].avatarUnitId]

function board(): GameState {
  const g = newGame() as GameState
  keepBoth(g)
  waiveThreshold(g, 0)
  return g
}

/** cast a minion from hand to (x,y) with all the mana it needs — a real cast, so its Genesis fires */
function castMinion(g: GameState, p: PlayerId, name: string, x: number, y: number): UnitState {
  const cardId = injectToHand(g, p, name)
  giveMana(g, p, 20)
  const before = new Set(Object.keys(g.units))
  act(g, p, { t: 'castSpell', cardId, casterId: g.players[p].avatarUnitId, at: { x, y } })
  const id = Object.keys(g.units).find((k) => !before.has(k) && g.units[k].name === name)
  if (!id) throw new Error(`${name} did not enter the realm`)
  return g.units[id]
}

function passRound(g: GameState): void {
  const p = g.activePlayer
  endTurn(g); settlePrompts(g)
  endTurn(g); settlePrompts(g)
  expect(g.activePlayer).toBe(p)
}

describe('Frost Mage vs Lavamancer — the released card pool', () => {
  it('has all 120 cards of the set, with the printed card winning where the API disagrees', () => {
    const set = allCards.filter((c) => c.sets?.includes('Frost Mage vs Lavamancer'))
    expect(set.length).toBe(120)
    expect(getCard('A Yeti So Shy').cost).toBe(4)
    expect(getCard('Runeling').rarity).toBe('Exceptional')
    expect(getCard('Reed Cord Measurer').rarity).toBe('Exceptional')
    expect(getCard('Nanurluk').subtypes).toEqual(['Spirit', 'Beast'])
    // official art for every card that is new in the set
    for (const c of set) if (c.sets.length === 1) expect(c.img).toMatch(/\/cards\/008-.*-pd-s\.png$/)
  })
})

describe('Chart / Research', () => {
  it('Chart draws two sites, Research two spells', () => {
    const g = board()
    const p = g.players[0]
    const sitesBefore = p.atlas.length, spellsBefore = p.spellbook.length, hand = p.hand.length
    castMagic(g, 0, 'Chart')
    expect(p.atlas.length).toBe(sitesBefore - 2)
    castMagic(g, 0, 'Research')
    expect(p.spellbook.length).toBe(spellsBefore - 2)
    expect(p.hand.length).toBe(hand + 4)
  })
})

describe('Reed Cord Measurer', () => {
  it('Genesis: draw a site, or play one from hand', () => {
    const g = board()
    const av = avatarOf(g, 0)
    const here = placeSite(g, 0, 'Rustic Village', av.x, av.y)
    const p = g.players[0]
    p.hand = p.hand.filter((id) => getCard(g.cards[id].name).type !== 'Site')
    const atlas = p.atlas.length
    castMinion(g, 0, 'Reed Cord Measurer', here.x, here.y)
    settlePrompts(g) // no site in hand: it simply draws
    expect(p.atlas.length).toBe(atlas - 1)

    // with a site in hand the player chooses; playing it puts it into the realm
    const sitesInRealm = Object.keys(g.sites).length
    castMinion(g, 0, 'Reed Cord Measurer', here.x, here.y)
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    answer(g, 'Play a site from hand')
    answer(g, (g.prompts[0] as any).data.options[0])
    answer(g, (g.prompts[0] as any).data.squares[0])
    expect(Object.keys(g.sites).length).toBe(sitesInRealm + 1)
  })
})

describe('Runeling', () => {
  it('draws his own spell, which only he can cast', () => {
    const g = board()
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Rustic Village', av.x, av.y)
    const before = g.players[0].spellbook.length
    const rune = castMinion(g, 0, 'Runeling', av.x, av.y)
    expect(g.players[0].spellbook.length).toBe(before - 1)
    const locked = (g.flow?.lockedCards ?? []) as { cardId: string; casterId: string }[]
    expect(locked.some((l) => l.casterId === rune.id)).toBe(true)
    expect(getKeywords('Runeling').spellcaster).toBe(true)
  })
})

describe('Gnarled Laborers', () => {
  it('untap the first time they take damage each turn, not the second', () => {
    const g = board()
    fillSites(g)
    const lab = summonCard(g, 0, 'Gnarled Laborers', 1, 1)
    lab.tapped = true
    const foe = summonCard(g, 1, 'Flametongue Newt', 1, 2)
    g.activePlayer = 1
    act(g, 1, { t: 'activate', sourceId: foe.id, ability: 'spit' })
    answer(g, 's')
    expect(g.units[lab.id].damage).toBe(1)
    expect(g.units[lab.id].tapped).toBe(false)
    g.units[lab.id].tapped = true
    const foe2 = summonCard(g, 1, 'Flametongue Newt', 1, 2)
    act(g, 1, { t: 'activate', sourceId: foe2.id, ability: 'spit' })
    answer(g, 's')
    expect(g.units[lab.id].damage).toBe(2)
    expect(g.units[lab.id].tapped).toBe(true)
  })
})

describe('Flametongue Newt / Sunspear Tribe', () => {
  it('Flametongue Newt shoots a 1-damage projectile once on each of its turns, without tapping', () => {
    const g = board()
    fillSites(g)
    const newt = summonCard(g, 0, 'Flametongue Newt', 1, 0)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 2)
    act(g, 0, { t: 'activate', sourceId: newt.id, ability: 'spit' })
    answer(g, 'n')
    expect(g.units[foe.id].damage).toBe(1)
    expect(g.units[newt.id].tapped).toBe(false)
    expect(actFail(g, 0, { t: 'activate', sourceId: newt.id, ability: 'spit' })).toMatch(/Already used/)
    passRound(g)
    act(g, 0, { t: 'activate', sourceId: newt.id, ability: 'spit' })
    answer(g, 'n')
    expect(g.units[foe.id].damage).toBe(1) // last turn's damage healed; this is the new shot
  })

  it('Sunspear Tribe throw one spear in the whole game', () => {
    const g = board()
    fillSites(g)
    const tribe = summonCard(g, 0, 'Sunspear Tribe', 1, 0)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 2)
    act(g, 0, { t: 'activate', sourceId: tribe.id, ability: 'spear' })
    answer(g, 'n')
    expect(g.units[foe.id].damage).toBe(1)
    passRound(g)
    expect(() => act(g, 0, { t: 'activate', sourceId: tribe.id, ability: 'spear' })).toThrow()
  })
})

describe('Arctic Fox', () => {
  it("can't be disabled, and from the cemetery gives an ally Stealth and the same immunity", () => {
    const g = board()
    fillSites(g)
    const fox = summonCard(g, 0, 'Arctic Fox', 1, 1)
    fox.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'permanent', turn: g.turn, sourcePlayer: 1 } as any)
    expect(isDisabled(g, fox)).toBe(false)
    expect(getKeywords('Arctic Fox').stealth).toBe(true)

    const ally = summonCard(g, 0, 'Escyllion Cyclops', 2, 1)
    const cardId = `ctest${g.nextId++}`
    g.cards[cardId] = { id: cardId, name: 'Arctic Fox', owner: 0 }
    g.players[0].cemetery.push(cardId)
    giveMana(g, 0, 1)
    act(g, 0, { t: 'activate', sourceId: avatarOf(g, 0).id, ability: `fox:${cardId}` })
    answer(g, [ally.id])
    expect(g.players[0].cemetery).not.toContain(cardId)
    expect(g.players[0].banished).toContain(cardId)
    expect(effKeywords(g, g.units[ally.id]).stealth).toBe(true)
    g.units[ally.id].modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'permanent', turn: g.turn, sourcePlayer: 1 } as any)
    expect(isDisabled(g, g.units[ally.id])).toBe(false)
  })
})

describe('A Yeti So Shy', () => {
  it('Outerbound: disabled anywhere but the outside of the realm', () => {
    const g = board()
    fillSites(g)
    const inner = summonCard(g, 0, 'A Yeti So Shy', 2, 1)
    const edge = summonCard(g, 0, 'A Yeti So Shy', 0, 1)
    const corner = summonCard(g, 0, 'A Yeti So Shy', GRID_W - 1, GRID_H - 1)
    expect(isDisabled(g, inner)).toBe(true)
    expect(isDisabled(g, edge)).toBe(false)
    expect(isDisabled(g, corner)).toBe(false)
    expect(getKeywords('A Yeti So Shy')).toMatchObject({ stealth: true, outerbound: true })
  })
})

describe('Nanurluk', () => {
  it('has Charge once a Bear or a site lies in its controller\'s cemetery', () => {
    const g = board()
    fillSites(g)
    const nan = summonCard(g, 0, 'Nanurluk', 1, 1)
    g.players[0].cemetery = []
    expect(effKeywords(g, nan).charge).toBeFalsy()
    const bears = `ctest${g.nextId++}`
    g.cards[bears] = { id: bears, name: 'Polar Bears', owner: 0 }
    g.players[0].cemetery.push(bears)
    expect(effKeywords(g, nan).charge).toBe(true)
    g.players[0].cemetery = []
    const site = `ctest${g.nextId++}`
    g.cards[site] = { id: site, name: 'Rustic Village', owner: 0 }
    g.players[0].cemetery.push(site)
    expect(effKeywords(g, nan).charge).toBe(true)
  })
})

describe('Myrmidons', () => {
  it('have +1 power for each site in their span of land', () => {
    const g = board()
    for (const s of Object.values(g.sites)) delete g.sites[s.id]
    placeSite(g, 0, 'Rustic Village', 0, 0)
    placeSite(g, 0, 'Rustic Village', 1, 0)
    placeSite(g, 1, 'Rustic Village', 1, 1) // an enemy's site is part of the span too
    placeSite(g, 0, 'Rustic Village', 4, 3) // not connected
    const m = summonCard(g, 0, 'Myrmidons', 0, 0)
    expect(effAttack(g, m)).toBe(3)
    expect(getKeywords('Myrmidons').burrowing).toBe(true)
  })
})

describe('Slag Slug', () => {
  it('deals 2 damage to the units at a site it leaves, never to itself', () => {
    const g = board()
    fillSites(g)
    const slug = summonCard(g, 0, 'Slag Slug', 1, 0)
    const ally = summonCard(g, 0, 'Escyllion Cyclops', 1, 0)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 0)
    act(g, 0, { t: 'moveAttack', unitId: slug.id, path: [{ x: 1, y: 1, region: 'surface' }] })
    settlePrompts(g)
    expect(g.units[ally.id].damage).toBe(2)
    expect(g.units[foe.id].damage).toBe(2)
    expect(g.units[slug.id].damage).toBe(0)
  })
})

describe('Jussi Puffins', () => {
  it('step across both pairs of opposite edges', () => {
    const g = board()
    fillSites(g)
    const puffins = summonCard(g, 0, 'Jussi Puffins', 0, 0)
    const steps = legalStepsFrom(g, puffins, { x: 0, y: 0, region: 'surface' }).filter((s) => s.region === 'surface')
    expect(steps.some((s) => s.x === GRID_W - 1 && s.y === 0)).toBe(true)
    expect(steps.some((s) => s.x === 0 && s.y === GRID_H - 1)).toBe(true)
    expect(getKeywords('Jussi Puffins')).toMatchObject({ airborne: true, submerge: true })
  })
})

describe('Dust Devil', () => {
  it('takes no damage in a fight it attacks in, and full damage when it is attacked', () => {
    const g = board()
    fillSites(g)
    const devil = summonCard(g, 0, 'Dust Devil', 1, 1)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 2) // 4 power
    act(g, 0, { t: 'moveAttack', unitId: devil.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: foe.id } })
    settlePrompts(g)
    expect(g.units[devil.id]?.damage).toBe(0)
    expect(g.units[foe.id].damage).toBe(2)
    expect(getKeywords('Dust Devil').movement).toBe(1)

    endTurn(g); settlePrompts(g)
    const foe2 = summonCard(g, 1, 'Slag Slug', 1, 2) // 4 power, attacks the Devil (defence 2)
    act(g, 1, { t: 'moveAttack', unitId: foe2.id, path: [], attack: { unit: devil.id } })
    settlePrompts(g)
    expect(g.units[devil.id]).toBeUndefined()
  })
})
