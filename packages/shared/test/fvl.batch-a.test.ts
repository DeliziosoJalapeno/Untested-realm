// Frost Mage vs Lavamancer, batch A: the draw spells (Chart, Research), the site/spell Genesis minions
// (Reed Cord Measurer, Runeling) and the static minions. One scenario per card's rules text.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, answer, act, actFail, waiveThreshold, giveMana, injectToHand, settlePrompts } from './helpers'
import {
  getCard, getKeywords, isDisabled, effKeywords, canCast, makeCtx, checkStateBased, dealDamageToUnit, grantedAbilities, protectedFromSites,
  type GameState, type PlayerId, type UnitState,
} from '../src'
import '../src/cards/scripts/index'

function board(): GameState {
  const g = newGame() as GameState
  keepBoth(g)
  waiveThreshold(g, 0)
  return g
}

const avatarOf = (g: GameState, p: PlayerId) => g.units[g.players[p].avatarUnitId]
const isSiteCard = (g: GameState, id: string) => getCard(g.cards[id].name).type === 'Site'
const handSites = (g: GameState, p: PlayerId) => g.players[p].hand.filter((id) => isSiteCard(g, id)).length

/** put a real card into a player's cemetery, return its id */
function toCemetery(g: GameState, p: PlayerId, name: string): string {
  const id = `ctest${g.nextId++}`
  g.cards[id] = { id, name, owner: p }
  g.players[p].cemetery.push(id)
  return id
}

/** cast a minion from hand onto (x,y) — Genesis fires */
function castMinion(g: GameState, name: string, x: number, y: number): UnitState {
  placeSite(g, 0, 'Rustic Village', x, y)
  const cid = injectToHand(g, 0, name)
  giveMana(g, 0, 10)
  act(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, at: { x, y } })
  return Object.values(g.units).find((u) => u.cardId === cid)!
}

describe('Chart / Research', () => {
  it('Chart draws two sites', () => {
    const g = board()
    const atlas = g.players[0].atlas.length
    const sites = handSites(g, 0)
    castMagic(g, 0, 'Chart')
    expect(g.players[0].atlas.length).toBe(atlas - 2)
    expect(handSites(g, 0)).toBe(sites + 2)
  })
  it('Research draws two spells', () => {
    const g = board()
    const book = g.players[0].spellbook.length
    const atlas = g.players[0].atlas.length
    castMagic(g, 0, 'Research')
    expect(g.players[0].spellbook.length).toBe(book - 2)
    expect(g.players[0].atlas.length, 'no site drawn').toBe(atlas)
  })
})

describe('Reed Cord Measurer — Genesis → Play or draw a site', () => {
  /** leave exactly one site card (a Rustic Village) in hand */
  function oneSiteInHand(g: GameState): string {
    g.players[0].hand = g.players[0].hand.filter((id) => !isSiteCard(g, id))
    return injectToHand(g, 0, 'Rustic Village')
  }

  it('draw: takes the top site of the atlas', () => {
    const g = board()
    oneSiteInHand(g)
    const top = g.players[0].atlas[0]
    castMinion(g, 'Reed Cord Measurer', 2, 1)
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    expect(g.prompts[0].data.options).toEqual(['Play a site', 'Draw a site'])
    answer(g, 'Draw a site')
    expect(g.players[0].hand).toContain(top)
  })

  it('play: puts a site from hand onto a chosen legal square', () => {
    const g = board()
    const site = oneSiteInHand(g)
    castMinion(g, 'Reed Cord Measurer', 2, 1)
    answer(g, 'Play a site')
    expect(g.prompts[0]?.kind, 'one site name in hand → straight to the square').toBe('chooseSquare')
    const sq = g.prompts[0].data.squares.find((q: { x: number; y: number }) => q.x === 1 && q.y === 1)
    expect(sq, '(1,1) borders your sites').toBeTruthy()
    answer(g, sq)
    expect(g.players[0].hand).not.toContain(site)
    expect(Object.values(g.sites).some((s) => s.cardId === site && s.x === 1 && s.y === 1)).toBe(true)
  })

  it('no site in hand → it just draws, no question', () => {
    const g = board()
    g.players[0].hand = g.players[0].hand.filter((id) => !isSiteCard(g, id))
    const top = g.players[0].atlas[0]
    castMinion(g, 'Reed Cord Measurer', 2, 1)
    expect(g.prompts.length).toBe(0)
    expect(g.players[0].hand).toContain(top)
  })
})

describe('Runeling — draws his own spell, which only he can cast', () => {
  it('the Genesis spell is locked to the Runeling', () => {
    const g = board()
    const top = g.players[0].spellbook[0]
    const rune = castMinion(g, 'Runeling', 2, 1)
    expect(g.players[0].hand).toContain(top)
    expect(g.flow.lockedCards).toEqual([expect.objectContaining({ cardId: top, casterId: rune.id, grantsCasting: false })])
    expect(effKeywords(g, rune).spellcaster).toBe(true)
    giveMana(g, 0, 20)
    expect(canCast(g, 0, top, avatarOf(g, 0).id).ok, 'not the Avatar').toBe(false)
  })
})

describe('A Yeti So Shy — Stealth, Outerbound', () => {
  it('is disabled off the outer squares; silenced, it loses Outerbound', () => {
    const g = board()
    expect(getKeywords('A Yeti So Shy').stealth).toBe(true)
    const edge = summonCard(g, 0, 'A Yeti So Shy', 0, 2)
    const inner = summonCard(g, 0, 'A Yeti So Shy', 2, 1)
    const corner = summonCard(g, 0, 'A Yeti So Shy', 4, 3)
    expect(isDisabled(g, edge)).toBe(false)
    expect(isDisabled(g, corner)).toBe(false)
    expect(isDisabled(g, inner), 'interior square: four neighbours').toBe(true)
    inner.silenced = true
    expect(isDisabled(g, inner), 'silenced, it has lost Outerbound').toBe(false)
  })
  it('an interior Yeti loses its Stealth mark (Codex: disabled → remove the mark)', () => {
    const g = board()
    const inner = summonCard(g, 0, 'A Yeti So Shy', 1, 2)
    inner.stealth = true
    checkStateBased(g)
    expect(inner.stealth).toBe(false)
  })
})

describe("Arctic Fox — Stealth, Can't be disabled; cemetery grant", () => {
  it("can't be disabled; an ordinary minion can", () => {
    const g = board()
    const fox = summonCard(g, 0, 'Arctic Fox', 1, 1)
    const other = summonCard(g, 0, 'Bone Jumble', 1, 1)
    const ctx = makeCtx(g, avatarOf(g, 1).id, 1, [])
    ctx.grantKeyword(fox.id, 'disabled', 'endOfTurn')
    ctx.grantKeyword(other.id, 'disabled', 'endOfTurn')
    expect(isDisabled(g, fox)).toBe(false)
    expect(isDisabled(g, other)).toBe(true)
  })

  it('(1), banish it from the cemetery → the only allied minion gains Stealth and Can\'t be disabled', () => {
    const g = board()
    const ally = summonCard(g, 0, 'Bone Jumble', 1, 1)
    const fox = toCemetery(g, 0, 'Arctic Fox')
    const av = avatarOf(g, 0)
    const ab = grantedAbilities(g, av).find((a) => a.key === `arcticFox:${fox}`)!
    expect(ab).toBeTruthy()
    giveMana(g, 0, 1)
    const mana = g.players[0].mana
    act(g, 0, { t: 'activate', sourceId: av.id, ability: ab.key })
    expect(g.players[0].mana).toBe(mana - 1)
    expect(g.players[0].cemetery).not.toContain(fox)
    expect(g.players[0].banished).toContain(fox)
    expect(ally.stealth).toBe(true)
    makeCtx(g, avatarOf(g, 1).id, 1, []).grantKeyword(ally.id, 'disabled', 'endOfTurn')
    expect(isDisabled(g, ally), 'it now can\'t be disabled').toBe(false)
    checkStateBased(g)
    expect(ally.stealth, 'so it keeps its Stealth mark').toBe(true)
  })

  it('with two allied minions the player picks; with none it is unavailable', () => {
    const g = board()
    const fox = toCemetery(g, 0, 'Arctic Fox')
    const av = avatarOf(g, 0)
    const ab = () => grantedAbilities(g, av).find((a) => a.key === `arcticFox:${fox}`)!
    giveMana(g, 0, 2)
    expect(ab().available!(g, av.id), 'no allied minion').toBe(false)
    expect(actFail(g, 0, { t: 'activate', sourceId: av.id, ability: ab().key })).toBeTruthy()
    const a = summonCard(g, 0, 'Bone Jumble', 1, 1)
    const b = summonCard(g, 0, 'Bone Jumble', 3, 1)
    act(g, 0, { t: 'activate', sourceId: av.id, ability: ab().key })
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    answer(g, [b.id])
    expect(b.stealth).toBe(true)
    expect(a.stealth).toBeFalsy()
  })
})

describe('Dust Devil — takes no damage while attacking', () => {
  it('attacking, the defender\'s strike back deals it nothing', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const devil = summonCard(g, 0, 'Dust Devil', 2, 1)
    const foe = summonCard(g, 1, 'Stygian Archers', 2, 1) // 3/3
    expect(getKeywords('Dust Devil').movement).toBe(1)
    act(g, 0, { t: 'moveAttack', unitId: devil.id, path: [], attack: { unit: foe.id } })
    settlePrompts(g)
    expect(g.units[devil.id], 'alive').toBeTruthy()
    expect(devil.damage).toBe(0)
    expect(foe.damage).toBe(2)
    expect(g.flow.attackingUnitId, 'the attack is over').toBeUndefined()
  })

  it('not attacking (attacked, or hit by an effect) it takes damage as usual', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const devil = summonCard(g, 0, 'Dust Devil', 2, 1)
    dealDamageToUnit(g, devil, 1, 1)
    expect(devil.damage).toBe(1)
    devil.damage = 0
    g.activePlayer = 1
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 1) // 1/1
    act(g, 1, { t: 'moveAttack', unitId: foe.id, path: [], attack: { unit: devil.id } })
    settlePrompts(g)
    expect(devil.damage, 'defending, it is struck').toBe(1)
  })
})

describe('Gnarled Laborers — untap the first time they take damage each turn', () => {
  it('first damage of the turn untaps them; the second does not; next turn it works again', () => {
    const g = board()
    const lab = summonCard(g, 0, 'Gnarled Laborers', 1, 1) // 3/3
    lab.tapped = true
    dealDamageToUnit(g, lab, 1, 1)
    expect(lab.tapped).toBe(false)
    lab.tapped = true
    dealDamageToUnit(g, lab, 1, 1)
    expect(lab.tapped, 'only the first time each turn').toBe(true)
    g.turn += 1
    lab.damage = 0
    dealDamageToUnit(g, lab, 1, 1)
    expect(lab.tapped).toBe(false)
  })
  it('a first hit taken while disabled still counts: no untap then, nor on a later hit that turn', () => {
    const g = board()
    const lab = summonCard(g, 0, 'Gnarled Laborers', 1, 1)
    lab.tapped = true
    makeCtx(g, avatarOf(g, 1).id, 1, []).grantKeyword(lab.id, 'disabled', 'endOfTurn')
    expect(isDisabled(g, lab)).toBe(true)
    dealDamageToUnit(g, lab, 1, 1)
    expect(lab.tapped, 'disabled: no abilities, no untap').toBe(true)
    lab.modifiers = lab.modifiers.filter((m) => !(m.kind === 'keyword' && m.keyword === 'disabled')) // the disable ends
    expect(isDisabled(g, lab)).toBe(false)
    dealDamageToUnit(g, lab, 1, 1)
    expect(lab.tapped, 'this was the second hit of the turn').toBe(true)
    g.turn += 1
    lab.damage = 0
    dealDamageToUnit(g, lab, 1, 1)
    expect(lab.tapped, 'next turn the first hit untaps them').toBe(false)
  })
  it('a first hit taken while silenced still counts: no untap after the silence ends that turn', () => {
    const g = board()
    const lab = summonCard(g, 0, 'Gnarled Laborers', 1, 1)
    lab.tapped = true
    lab.silenced = true
    dealDamageToUnit(g, lab, 1, 1)
    expect(lab.tapped, 'silenced: no abilities, no untap').toBe(true)
    lab.silenced = false // the silence ends
    dealDamageToUnit(g, lab, 1, 1)
    expect(lab.tapped, 'this was the second hit of the turn').toBe(true)
    g.turn += 1
    lab.damage = 0
    dealDamageToUnit(g, lab, 1, 1)
    expect(lab.tapped, 'next turn the first hit untaps them').toBe(false)
  })
  it('untapped at the first damage: the untap is spent for the turn', () => {
    const g = board()
    const lab = summonCard(g, 0, 'Gnarled Laborers', 1, 1)
    dealDamageToUnit(g, lab, 1, 1)
    lab.tapped = true
    dealDamageToUnit(g, lab, 1, 1)
    expect(lab.tapped).toBe(true)
  })
})

describe('Highgate Guide — nearby allies are Protected from sites', () => {
  function pitScene(guideAt: { x: number; y: number }) {
    const g = newGame(42, 0); keepBoth(g); g.turn = 5
    placeSite(g, 0, 'Bottomless Pit', 2, 1)
    const ally = summonCard(g, 1, 'Stygian Archers', 4, 3); ally.enteredTurn = -1
    summonCard(g, 1, 'Highgate Guide', guideAt.x, guideAt.y)
    makeCtx(g, ally.id, 1, []).teleport(ally.id, 2, 1, 'surface')
    checkStateBased(g)
    return { g, ally }
  }
  it('an ally dragged onto a Bottomless Pit next to the Guide ignores it', () => {
    const { g, ally } = pitScene({ x: 2, y: 2 })
    expect(g.units[ally.id]).toBeTruthy()
  })
  it('control: with the Guide far away the Pit claims it', () => {
    const { g, ally } = pitScene({ x: 0, y: 3 })
    expect(g.units[ally.id]).toBeFalsy()
  })
  it('the Guide protects itself and allies only, in its own region', () => {
    const g = board()
    const guide = summonCard(g, 0, 'Highgate Guide', 2, 1)
    const ally = summonCard(g, 0, 'Bone Jumble', 3, 2)
    const enemy = summonCard(g, 1, 'Bone Jumble', 3, 2)
    const below = summonCard(g, 0, 'Bone Jumble', 2, 1, 'underground')
    expect(protectedFromSites(g, guide)).toBe(true)
    expect(protectedFromSites(g, ally)).toBe(true)
    expect(protectedFromSites(g, enemy)).toBe(false)
    expect(protectedFromSites(g, below)).toBe(false)
    guide.silenced = true
    expect(protectedFromSites(g, ally), 'a silenced Guide grants nothing').toBe(false)
  })
})

describe('Nanurluk — Charge if Bears or sites are in your cemetery', () => {
  it('reads its controller\'s cemetery', () => {
    const g = board()
    g.players[0].cemetery = []
    g.players[1].cemetery = []
    const nan = summonCard(g, 0, 'Nanurluk', 1, 1)
    expect(effKeywords(g, nan).charge).toBeFalsy()
    toCemetery(g, 1, 'Polar Bears')
    expect(effKeywords(g, nan).charge, "the opponent's cemetery doesn't count").toBeFalsy()
    const bailiff = toCemetery(g, 0, 'Overbearing Bailiff')
    expect(effKeywords(g, nan).charge, 'not a Bear').toBeFalsy()
    const bears = toCemetery(g, 0, 'Brown Bears')
    expect(effKeywords(g, nan).charge).toBe(true)
    g.players[0].cemetery = [bailiff]
    toCemetery(g, 0, 'Rustic Village')
    expect(effKeywords(g, nan).charge, 'a site').toBe(true)
    expect(bears).toBeTruthy()
  })
})

describe('Swealand Longship — once on your turn, may move to an adjacent water site', () => {
  it('moves to the one adjacent water site, once per turn', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 2, 1)
    placeSite(g, 0, 'Stream', 2, 2)
    placeSite(g, 0, 'Stream', 3, 2) // diagonal: not adjacent
    const ship = summonCard(g, 0, 'Swealand Longship', 2, 1)
    act(g, 0, { t: 'activate', sourceId: ship.id, ability: 'sail' })
    expect([ship.x, ship.y]).toEqual([2, 2])
    expect(ship.tapped, 'no tap').toBe(false)
    expect(actFail(g, 0, { t: 'activate', sourceId: ship.id, ability: 'sail' })).toBeTruthy()
  })
  it('with two choices it asks; with no adjacent water site it is unavailable', () => {
    const g = board()
    placeSite(g, 0, 'Rustic Village', 2, 1)
    placeSite(g, 0, 'Rustic Village', 1, 1)
    const ship = summonCard(g, 0, 'Swealand Longship', 2, 1)
    expect(actFail(g, 0, { t: 'activate', sourceId: ship.id, ability: 'sail' })).toMatch(/can't use that/)
    placeSite(g, 0, 'Stream', 2, 2)
    const far = placeSite(g, 0, 'Stream', 3, 1)
    act(g, 0, { t: 'activate', sourceId: ship.id, ability: 'sail' })
    expect(g.prompts[0]?.kind).toBe('chooseTargets')
    answer(g, [far.id])
    expect([ship.x, ship.y]).toEqual([3, 1])
  })
})
