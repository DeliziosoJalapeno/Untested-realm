// Frost Mage vs Lavamancer, the released set (13 Nov 2026): the cards that were never spoiled. One
// scenario per card's rules text; rulings quoted are from the 13 Nov 2026 FAQ.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, answer, act, actFail, waiveThreshold, giveMana, injectToHand, fillSites, settlePrompts } from './helpers'
import {
  allCards, getCard, getKeywords, isDisabled, effKeywords, effAttack, legalStepsFrom, endTurn, enterSite, siteAt, siteSilenced,
  protectedFromSites, isMagicProtected, siteDisabled, checkStateBased, occupiedSquares, GRID_W, GRID_H,
  type GameState, type PlayerId, type UnitState,
} from '../src'
import '../src/cards/scripts/index'

const avatarOf = (g: GameState, p: PlayerId) => g.units[g.players[p].avatarUnitId]
const avatarLife = (g: GameState, p: PlayerId): number => (avatarOf(g, p) as any).life ?? (g.players[p] as any).life

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
    const foe = summonCard(g, 1, 'Slag Slug', 1, 2) // 4 power: would kill the 2-defence Devil
    act(g, 0, { t: 'moveAttack', unitId: devil.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: foe.id } })
    settlePrompts(g)
    expect(g.units[devil.id]?.damage).toBe(0)
    expect(g.units[foe.id].damage).toBe(2)
    expect(getKeywords('Dust Devil').movement).toBe(1)

    endTurn(g); settlePrompts(g)
    act(g, 1, { t: 'moveAttack', unitId: foe.id, path: [], attack: { unit: devil.id } })
    settlePrompts(g)
    expect(g.units[devil.id]).toBeUndefined()
  })
})

describe('Highgate Guide / Humming Hummocks', () => {
  it('Highgate Guide: nearby allies are Protected from sites — not himself, not enemies, not far allies', () => {
    const g = board()
    fillSites(g)
    const guide = summonCard(g, 0, 'Highgate Guide', 1, 1)
    const near = summonCard(g, 0, 'Wild Boars', 2, 2)
    const far = summonCard(g, 0, 'Wild Boars', 4, 3)
    const foe = summonCard(g, 1, 'Wild Boars', 1, 1)
    expect(protectedFromSites(g, near)).toBe(true)
    expect(protectedFromSites(g, far)).toBe(false)
    expect(protectedFromSites(g, foe)).toBe(false)
    expect(protectedFromSites(g, guide)).toBe(false)
    guide.silenced = true
    expect(protectedFromSites(g, near)).toBe(false)
  })

  it('Humming Hummocks: until your next turn, allies nearby it are protected from sites and magic', () => {
    const g = board()
    fillSites(g)
    const cardId = injectToHand(g, 0, 'Humming Hummocks')
    for (const s of Object.values(g.sites)) if (s.x === 1 && s.y === 1) delete g.sites[s.id]
    g.players[0].hand.splice(g.players[0].hand.indexOf(cardId), 1)
    const hummocks = enterSite(g, 0, cardId, 1, 1)
    settlePrompts(g)
    const ally = summonCard(g, 0, 'Wild Boars', 2, 1)
    const walkedIn = summonCard(g, 0, 'Wild Boars', 0, 0) // arrived after the Genesis: still covered (FAQ)
    const away = summonCard(g, 0, 'Wild Boars', 4, 3)
    const foe = summonCard(g, 1, 'Wild Boars', 1, 1)
    expect(hummocks).toBeTruthy()
    for (const u of [ally, walkedIn]) {
      expect(protectedFromSites(g, u)).toBe(true)
      expect(isMagicProtected(g, u)).toBe(true)
    }
    expect(isMagicProtected(g, away)).toBe(false)
    expect(isMagicProtected(g, foe)).toBe(false)
    passRound(g) // the start of its controller's next turn ends it
    expect(isMagicProtected(g, g.units[ally.id])).toBe(false)
  })
})

describe('Full-tilt Goliaths', () => {
  it('silence the sites nearby when they arrive, until their controller\'s next turn', () => {
    const g = board()
    fillSites(g)
    const av = avatarOf(g, 0)
    const gol = castMinion(g, 0, 'Full-tilt Goliaths', av.x, av.y)
    settlePrompts(g)
    expect(getKeywords('Full-tilt Goliaths').charge).toBe(true)
    expect(siteSilenced(g, { x: gol.x, y: gol.y })).toBe(true)
    expect(siteSilenced(g, { x: gol.x + 1, y: gol.y + 1 })).toBe(true)
    expect(siteSilenced(g, { x: gol.x, y: gol.y + 2 })).toBe(false)
    passRound(g)
    expect(siteSilenced(g, { x: gol.x, y: gol.y })).toBe(false)
  })
})

describe('Sissi Marksmen', () => {
  it('shoot across the top and bottom edges of the realm', () => {
    const g = board()
    fillSites(g)
    const sissi = summonCard(g, 0, 'Sissi Marksmen', 3, GRID_H - 1)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 3, 0)
    act(g, 0, { t: 'activate', sourceId: sissi.id, ability: 'ranged', extra: { direction: 'n' } })
    settlePrompts(g)
    expect(g.units[foe.id].damage).toBe(2)
  })
})

describe('Hailstriker', () => {
  it('Genesis: each minion at a target adjacent location takes 1 damage and is disabled', () => {
    const g = board()
    fillSites(g)
    const av = avatarOf(g, 0)
    const a = summonCard(g, 1, 'Escyllion Cyclops', av.x + 1, av.y)
    const b = summonCard(g, 1, 'Escyllion Cyclops', av.x + 1, av.y)
    const cardId = injectToHand(g, 0, 'Hailstriker')
    giveMana(g, 0, 20)
    act(g, 0, { t: 'castSpell', cardId, casterId: av.id, at: { x: av.x, y: av.y }, targets: [`sq:${av.x + 1},${av.y},surface`] })
    settlePrompts(g)
    for (const u of [a, b]) {
      expect(g.units[u.id].damage).toBe(1)
      expect(isDisabled(g, g.units[u.id])).toBe(true)
    }
    expect(getKeywords('Hailstriker').ranged).toBe(1)
  })
})

describe("Tusslin' Trolls", () => {
  it('strike an adjacent minion for 1-6 at the end of their turn; alone, they strike themselves', () => {
    const g = board()
    fillSites(g)
    const trolls = summonCard(g, 0, "Tusslin' Trolls", 1, 1)
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 1, 2)
    endTurn(g)
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    expect((g.prompts[0] as any).data.candidates).toEqual([foe.id])
    answer(g, [foe.id])
    // the turn has passed; damage on a surviving minion is healed at end of turn, so read the log
    expect(g.log.some((e) => /The Trolls roll a [1-6] and clobber Escyllion Cyclops/.test(e.msg))).toBe(true)

    const g2 = board()
    fillSites(g2)
    const lone = summonCard(g2, 0, "Tusslin' Trolls", 1, 1)
    endTurn(g2)
    expect((g2.prompts[0] as any).data.candidates).toEqual([lone.id])
    answer(g2, [lone.id])
    expect(g2.log.some((e) => /clobber themselves/.test(e.msg))).toBe(true)
  })
})

describe('King Krakalak', () => {
  it('Genesis: sacrifices his site, then 5 damage there and 3 at each nearby site, to everyone but himself', () => {
    const g = board()
    fillSites(g)
    const av = avatarOf(g, 0)
    const x = av.x + 1, y = av.y + 1
    const here = summonCard(g, 1, 'Escyllion Cyclops', x, y)
    const beside = summonCard(g, 1, 'Escyllion Cyclops', x + 1, y + 1)
    const far = summonCard(g, 1, 'Escyllion Cyclops', x - 1, y + 2)
    const king = castMinion(g, 0, 'King Krakalak', x, y)
    settlePrompts(g)
    expect(siteAt(g, x, y)?.isRubble).toBe(true)
    expect(g.units[here.id].damage).toBe(5)
    expect(g.units[beside.id].damage).toBe(3)
    expect(g.units[far.id].damage).toBe(0)
    expect(g.units[king.id].damage).toBe(0)
  })
})

describe('Frost Breath', () => {
  it('a Beast may cast it; the pattern is 2 in front, 1 beyond and 1 either side, and the hit are disabled', () => {
    const g = board()
    fillSites(g)
    const beast = summonCard(g, 0, 'Wild Boars', 2, 1)
    const front = summonCard(g, 1, 'Escyllion Cyclops', 2, 2)
    const beyond = summonCard(g, 1, 'Escyllion Cyclops', 2, 3)
    const side = summonCard(g, 1, 'Escyllion Cyclops', 1, 2)
    const untouched = summonCard(g, 1, 'Escyllion Cyclops', 0, 2)
    castMagic(g, 0, 'Frost Breath', { casterId: beast.id })
    answer(g, 'n')
    expect(g.units[front.id].damage).toBe(2)
    expect(g.units[beyond.id].damage).toBe(1)
    expect(g.units[side.id].damage).toBe(1)
    expect(g.units[untouched.id].damage).toBe(0)
    for (const u of [front, beyond, side]) expect(isDisabled(g, g.units[u.id])).toBe(true)
    expect(isDisabled(g, g.units[untouched.id])).toBe(false)
  })
})

describe('Swealand Longship', () => {
  it('once on its turn moves to an adjacent water site without tapping', () => {
    const g = board()
    for (const s of Object.values(g.sites)) delete g.sites[s.id]
    placeSite(g, 0, 'Rustic Village', 1, 1)
    placeSite(g, 0, 'Stream', 2, 1)
    placeSite(g, 0, 'Rustic Village', 1, 2)
    const ship = summonCard(g, 0, 'Swealand Longship', 1, 1)
    act(g, 0, { t: 'activate', sourceId: ship.id, ability: 'sail' })
    expect((g.prompts[0] as any).data.squares).toEqual([{ x: 2, y: 1 }])
    answer(g, { x: 2, y: 1 })
    settlePrompts(g)
    expect([g.units[ship.id].x, g.units[ship.id].y]).toEqual([2, 1])
    expect(g.units[ship.id].tapped).toBe(false)
    expect(() => act(g, 0, { t: 'activate', sourceId: ship.id, ability: 'sail' })).toThrow()
  })
})

describe('Stomping Mammoth', () => {
  it("while attacking, damage beyond what kills the defender goes to the site it stands at", () => {
    const g = board()
    fillSites(g, 1)
    const mammoth = summonCard(g, 0, 'Stomping Mammoth', 1, 1) // 4 power
    const foe = summonCard(g, 1, 'Wild Boars', 1, 2) // 2 defence: 2 excess
    const life = g.units[g.players[1].avatarUnitId].life ?? avatarLife(g, 1)
    act(g, 0, { t: 'moveAttack', unitId: mammoth.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: foe.id } })
    settlePrompts(g)
    expect(g.units[foe.id]).toBeUndefined()
    expect(avatarLife(g, 1)).toBe(life - 2)
  })
})

/** play a site card at (x,y) through the real site entry (Genesis fires; a Trap goes face-down) */
function playSiteCard(g: GameState, p: PlayerId, name: string, x: number, y: number): string {
  const old = siteAt(g, x, y)
  if (old) delete g.sites[old.id]
  const cid = `csite${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: p }
  return enterSite(g, p, cid, x, y)
}

const disableMark = (g: GameState, u: UnitState, by: PlayerId) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'disabled', duration: 'untilYourNextTurn', turn: g.turn, sourcePlayer: by } as any)

describe('Jormungand', () => {
  it("occupies every outer location, wherever it entered, and can't be modified", () => {
    const g = board()
    fillSites(g)
    const j = summonCard(g, 0, 'Jormungand', 2, 1) // an inner square
    checkStateBased(g)
    const squares = occupiedSquares(g.units[j.id])
    expect(squares.length).toBe(2 * GRID_W + 2 * GRID_H - 4)
    expect(squares.every((s) => s.x === 0 || s.y === 0 || s.x === GRID_W - 1 || s.y === GRID_H - 1)).toBe(true)
    disableMark(g, g.units[j.id], 1)
    expect(isDisabled(g, g.units[j.id])).toBe(false)
    expect(effAttack(g, g.units[j.id])).toBe(10)
  })
})

describe('Man-made Ice Age', () => {
  it('disables the minions atop the sites it covers — not Avatars, not those beneath or outside', () => {
    const g = board()
    fillSites(g)
    const cid = injectToHand(g, 0, 'Man-made Ice Age')
    giveMana(g, 0, 10)
    act(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, at: { x: 1, y: 1 } })
    settlePrompts(g)
    const ice = Object.values(g.auras).find((r) => r.name === 'Man-made Ice Age')!
    expect(ice.squares.length).toBe(4)
    const sq = ice.squares[0]
    const out = [0, 1, 2, 3, 4].flatMap((x) => [0, 1, 2, 3].map((y) => ({ x, y }))).find((q) => !ice.squares.some((s) => s.x === q.x && s.y === q.y))!
    const inside = summonCard(g, 1, 'Wild Boars', sq.x, sq.y)
    const mine = summonCard(g, 0, 'Wild Boars', sq.x, sq.y)
    const outside = summonCard(g, 1, 'Wild Boars', out.x, out.y)
    expect(isDisabled(g, inside)).toBe(true)
    expect(isDisabled(g, mine)).toBe(true)
    expect(isDisabled(g, outside)).toBe(false)
  })
})

describe('None Survive the Sun', () => {
  it('at the end of each turn burns the minions on the surface, steps west, and sets at the western edge', () => {
    const g = board()
    fillSites(g)
    const cid = injectToHand(g, 0, 'None Survive the Sun')
    giveMana(g, 0, 10)
    act(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, at: { x: 1, y: 1 } })
    settlePrompts(g)
    const sun = Object.values(g.auras).find((r) => r.name === 'None Survive the Sun')!
    const minX = Math.min(...sun.squares.map((s) => s.x))
    const here = summonCard(g, 1, 'Escyllion Cyclops', sun.squares[0].x, sun.squares[0].y)
    const far = summonCard(g, 1, 'Escyllion Cyclops', 4, 3)
    const under = summonCard(g, 1, 'Myrmidons', 4, 3, 'underground')
    const frail = summonCard(g, 0, 'Arctic Fox', 4, 0) // 1 defence: dies to the 1
    endTurn(g); settlePrompts(g)
    expect(g.units[here.id]).toBeUndefined()
    expect(g.units[frail.id]).toBeUndefined()
    expect(g.units[far.id]).toBeDefined()
    expect(g.units[under.id].damage).toBe(0)
    expect(g.log.some((e) => /Escyllion Cyclops takes 1 damage/.test(e.msg))).toBe(true)
    expect(Math.min(...g.auras[sun.id].squares.map((s) => s.x))).toBe(minX - 1)
    for (let i = 0; i < minX; i++) { endTurn(g); settlePrompts(g) }
    expect(g.auras[sun.id]).toBeUndefined()
  })
})

describe('Hibernal Legion', () => {
  it('at the end of its turn freezes its site and the other minions there, until it leaves the realm', () => {
    const g = board()
    fillSites(g)
    const legion = summonCard(g, 0, 'Hibernal Legion', 1, 1)
    const foe = summonCard(g, 1, 'Wild Boars', 1, 1)
    const ally = summonCard(g, 0, 'Wild Boars', 1, 1)
    const elsewhere = summonCard(g, 1, 'Wild Boars', 3, 3)
    endTurn(g); settlePrompts(g)
    expect(isDisabled(g, g.units[foe.id])).toBe(true)
    expect(isDisabled(g, g.units[ally.id])).toBe(true)
    expect(isDisabled(g, g.units[legion.id])).toBe(false)
    expect(isDisabled(g, g.units[elsewhere.id])).toBe(false)
    expect(siteDisabled(g, siteAt(g, 1, 1)!)).toBe(true)
    endTurn(g); settlePrompts(g) // it lasts beyond "your next turn"
    expect(isDisabled(g, g.units[foe.id])).toBe(true)
    delete g.units[legion.id] // the Legion leaves the realm
    expect(isDisabled(g, g.units[foe.id])).toBe(false)
    expect(siteDisabled(g, siteAt(g, 1, 1)!)).toBe(false)
  })
})

describe('Permafrost', () => {
  it('a timed disable on a minion there does not run out; leaving lifts it', () => {
    const g = board()
    fillSites(g)
    playSiteCard(g, 0, 'Permafrost', 1, 1)
    const stuck = summonCard(g, 1, 'Wild Boars', 1, 1)
    const free = summonCard(g, 1, 'Wild Boars', 3, 3)
    disableMark(g, stuck, 0); disableMark(g, free, 0)
    passRound(g) // player 0's next turn: the mark on `free` expires, the one on Permafrost stays
    expect(isDisabled(g, g.units[free.id])).toBe(false)
    expect(isDisabled(g, g.units[stuck.id])).toBe(true)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Slide', { targets: [stuck.id] }) // a disabled enemy may be slid (forced movement)
    answer(g, 'n')
    expect(g.units[stuck.id].y).toBe(GRID_H - 1)
    expect(isDisabled(g, g.units[stuck.id])).toBe(false)
  })

  it("a Slumbering Giantess there sleeps through damage (FAQ)", () => {
    const g = board()
    fillSites(g)
    playSiteCard(g, 0, 'Permafrost', 1, 1)
    const giantess = castMinionAt(g, 0, 'Slumbering Giantess', 1, 1)
    expect(isDisabled(g, giantess)).toBe(true)
    castMagic(g, 0, 'Lightning Bolt', { targets: ['sq:1,1,surface'] })
    settlePrompts(g)
    expect(g.units[giantess.id].damage).toBeGreaterThan(0)
    expect(isDisabled(g, g.units[giantess.id])).toBe(true)
  })
})

function castMinionAt(g: GameState, p: PlayerId, name: string, x: number, y: number): UnitState {
  const cardId = injectToHand(g, p, name)
  giveMana(g, p, 20)
  const before = new Set(Object.keys(g.units))
  act(g, p, { t: 'castSpell', cardId, casterId: g.players[p].avatarUnitId, at: { x, y } })
  settlePrompts(g)
  return g.units[Object.keys(g.units).find((k) => !before.has(k) && g.units[k].name === name)!]
}

describe('Landslide', () => {
  it('Trap (2): swaps with an adjacent site, each carrying what stands on it', () => {
    const g = board()
    fillSites(g)
    const id = playSiteCard(g, 0, 'Landslide', 1, 1)
    const rider = summonCard(g, 0, 'Wild Boars', 1, 1)
    const other = siteAt(g, 2, 1)!
    const passenger = summonCard(g, 1, 'Wild Boars', 2, 1)
    giveMana(g, 0, 2)
    waiveThreshold(g, 0)
    act(g, 0, { t: 'activate', sourceId: id, ability: 'trap:spring' })
    answer(g, { x: 2, y: 1 })
    settlePrompts(g)
    expect([g.sites[id].x, g.sites[id].y]).toEqual([2, 1])
    expect([g.sites[other.id].x, g.sites[other.id].y]).toEqual([1, 1])
    expect([g.units[rider.id].x, g.units[passenger.id].x]).toEqual([2, 1])
  })
})

describe('Slide', () => {
  it('slides an ally as far as possible in a direction, then draws a spell; an able enemy is no choice', () => {
    const g = board()
    fillSites(g)
    const ally = summonCard(g, 0, 'Wild Boars', 1, 1)
    const foe = summonCard(g, 1, 'Wild Boars', 2, 2)
    const spells = g.players[0].spellbook.length
    castMagic(g, 0, 'Slide', { targets: [ally.id] })
    answer(g, 'e')
    expect([g.units[ally.id].x, g.units[ally.id].y]).toEqual([GRID_W - 1, 1])
    expect(g.players[0].spellbook.length).toBe(spells - 1)
    const cid = injectToHand(g, 0, 'Slide')
    giveMana(g, 0, 5)
    expect(actFail(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, targets: [foe.id] })).toBeTruthy()
  })
})

describe('Bearserker', () => {
  it('from hand, a Mortal or Bear becomes Bearserker for the difference in cost, untapped', () => {
    const g = board()
    fillSites(g)
    const bears = summonCard(g, 0, 'Polar Bears', 1, 1) // cost 3 → pay 2
    bears.tapped = true
    bears.damage = 1
    const cardId = injectToHand(g, 0, 'Bearserker')
    g.flow = g.flow ?? {}
    g.flow.judgeThresh = { ...(g.flow.judgeThresh ?? {}), 0: { air: 0, earth: 0, fire: 0, water: 2 } }
    g.players[0].mana = 2
    act(g, 0, { t: 'activate', sourceId: g.players[0].avatarUnitId, ability: `bearserk:${cardId}:${bears.id}` })
    settlePrompts(g)
    const u = g.units[bears.id]
    expect(u.name).toBe('Bearserker')
    expect(u.tapped).toBe(false)
    expect(g.players[0].mana).toBe(0)
    expect(g.players[0].hand).not.toContain(cardId)
    expect(effAttack(g, u)).toBe(4)
  })
})

describe('Ancient Thaw', () => {
  it('Genesis: casts an Alpha Beast from the collection here, disabled; Polar Bears come as the Alpha 2/2 for 2', () => {
    const g = board()
    fillSites(g)
    g.players[0].collection = { 'Polar Bears': 1, 'Lightning Bolt': 1 }
    g.flow = g.flow ?? {}
    g.flow.judgeThresh = { ...(g.flow.judgeThresh ?? {}), 0: { air: 0, earth: 0, fire: 0, water: 1 } }
    g.players[0].mana = 2
    const id = playSiteCard(g, 0, 'Ancient Thaw', 1, 1)
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    expect((g.prompts[0] as any).data.options).toEqual(['Polar Bears', '(none)'])
    const manaBefore = g.players[0].mana
    answer(g, 'Polar Bears')
    settlePrompts(g)
    const bears = Object.values(g.units).find((u) => u.name === 'Polar Bears')!
    expect([bears.x, bears.y]).toEqual([g.sites[id].x, g.sites[id].y])
    expect(isDisabled(g, bears)).toBe(true)
    expect(effAttack(g, bears)).toBe(2)
    expect(g.players[0].mana).toBe(manaBefore - 2)
    expect(g.players[0].collection?.['Polar Bears'] ?? 0).toBe(0)
  })
})

describe('Terraform', () => {
  it("replaces each site in the caster's column from the top of its controller's atlas, back to front", () => {
    const g = board()
    const av = avatarOf(g, 0)
    for (const s of Object.values(g.sites)) delete g.sites[s.id]
    const mine = placeSite(g, 0, 'Rustic Village', av.x, 0)
    const theirs = placeSite(g, 1, 'Rustic Village', av.x, 2)
    const aside = placeSite(g, 0, 'Rustic Village', (av.x + 1) % GRID_W, 0)
    av.y = 0
    const myTop = g.cards[g.players[0].atlas[0]].name
    const theirTop = g.cards[g.players[1].atlas[0]].name
    const rider = summonCard(g, 0, 'Wild Boars', av.x, 2)
    castMagic(g, 0, 'Terraform')
    settlePrompts(g)
    expect(g.sites[mine.id]).toBeUndefined()
    expect(g.sites[theirs.id]).toBeUndefined()
    expect(g.sites[aside.id]).toBeDefined()
    const now0 = siteAt(g, av.x, 0)!, now2 = siteAt(g, av.x, 2)!
    expect(g.cards[now0.cardId].name).toBe(myTop)
    expect(now0.controller).toBe(0)
    expect(g.cards[now2.cardId].name).toBe(theirTop)
    expect(now2.controller).toBe(1)
    expect(g.units[rider.id]).toBeDefined()
    expect(g.players[0].cemetery.map((id) => g.cards[id].name)).toContain('Rustic Village')
  })
})

describe('When the Peaks Fell', () => {
  it('snow from the chosen sites carries surface units forward; where it stops they take 3 and are disabled', () => {
    const g = board()
    fillSites(g)
    const carried = summonCard(g, 1, 'Escyllion Cyclops', 1, 1)
    const atEnd = summonCard(g, 1, 'Escyllion Cyclops', 1, GRID_H - 1)
    const otherColumn = summonCard(g, 1, 'Escyllion Cyclops', 3, 1)
    const start = siteAt(g, 1, 0)!
    castMagic(g, 0, 'When the Peaks Fell')
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    answer(g, [start.id])
    settlePrompts(g)
    expect(g.units[carried.id].y).toBe(GRID_H - 1)
    for (const u of [carried, atEnd]) {
      expect(g.units[u.id].damage).toBe(3)
      expect(isDisabled(g, g.units[u.id])).toBe(true)
    }
    expect(g.units[otherColumn.id].damage).toBe(0)
  })

  it("snow that starts at the far edge never moves, so it never stops (FAQ)", () => {
    const g = board()
    fillSites(g)
    const there = summonCard(g, 1, 'Escyllion Cyclops', 1, GRID_H - 1)
    castMagic(g, 0, 'When the Peaks Fell')
    answer(g, [siteAt(g, 1, GRID_H - 1)!.id])
    settlePrompts(g)
    expect(g.units[there.id].damage).toBe(0)
    expect(isDisabled(g, g.units[there.id])).toBe(false)
  })
})
