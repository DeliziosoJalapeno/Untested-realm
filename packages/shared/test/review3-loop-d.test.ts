// Third comparison list (THEIR_ISSUES_REPRO_LOOP.md #37–#48).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, castMagicFail, waiveThreshold, act, actFail, settlePrompts, injectToHand } from './helpers'
import { checkStateBased, effKeywords, avatarOf, type GameState, type Action } from '../src'
import { emitUnitEnters } from '../src/engine/effects'
import '../src/cards/scripts/index'

function game(): GameState {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  for (const s of Object.values(g.sites)) delete g.sites[s.id]
  return g
}
const sites = (g: GameState, p: 0 | 1, ...sq: [number, number][]) => { for (const [x, y] of sq) placeSite(g, p, 'Rustic Village', x, y) }

describe('#37 Order of the Pale Worm strips Ward from units it moves next to', () => {
  it('the Holy Warrior loses its Ward as the Worm arrives', () => {
    const g = game()
    sites(g, 0, [1, 0]); sites(g, 1, [1, 1], [1, 2])
    const worm = summonCard(g, 0, 'Order of the Pale Worm', 1, 0)
    const hw = summonCard(g, 1, 'Holy Warrior', 1, 2); hw.ward = true
    checkStateBased(g)
    expect(hw.ward, 'not nearby yet').toBe(true)
    act(g, 0, { t: 'moveAttack', unitId: worm.id, path: [{ x: 1, y: 1, region: 'surface' }] })
    settlePrompts(g)
    expect(g.units[hw.id].ward).toBeFalsy()
  })
})

describe('#38 Order of the White Wing only sees summons in its own region', () => {
  function enter(region: 'surface' | 'underground') {
    const g = game()
    sites(g, 0, [1, 1], [1, 2])
    summonCard(g, 0, 'Order of the White Wing', 1, 1)
    const trolls = summonCard(g, 0, 'Cave Trolls', 1, 2, region)
    emitUnitEnters(g, trolls)
    return !!g.units[trolls.id]
  }
  it('a minion summoned underground next to it stays', () => expect(enter('underground')).toBe(true))
  it('control: one summoned on the surface is banished', () => expect(enter('surface')).toBe(false))
})

describe('#39 an Ordinary unit cannot attack Earl of the Ivory Towers', () => {
  function attack(name: string, refused = false) {
    const g = game()
    sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
    const earl = summonCard(g, 1, 'Earl of the Ivory Towers', 1, 2)
    const att = summonCard(g, 0, name, 1, 1)
    const action = { t: 'moveAttack', unitId: att.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: earl.id } } as Action
    if (refused) actFail(g, 0, action)
    else act(g, 0, action)
    settlePrompts(g)
    return { g, att }
  }
  it('the Skeleton (Ordinary) is refused at declaration: it neither moves nor taps', () => {
    const { g, att } = attack('Skeleton', true)
    expect(g.units[att.id], 'no fight with the Earl').toBeDefined()
    expect(g.units[att.id].tapped).toBe(false)
    expect(g.units[att.id].y).toBe(1)
  })
  it('control: Gyre Hippogriffs (Exceptional) fight him', () => {
    const { g, att } = attack('Gyre Hippogriffs')
    expect(g.units[att.id]?.damage ?? 3, 'the Earl struck back').toBe(3)
  })
})

describe('#41 Putrid Presence lets a unit attack the nearby subsurface', () => {
  it('a Bosk Troll on a Stream attacks the Coy Nixie underwater beneath it', () => {
    const g = game()
    placeSite(g, 1, 'Stream', 1, 2); sites(g, 0, [2, 1])
    const nixie = summonCard(g, 1, 'Coy Nixie', 1, 2, 'underwater'); nixie.tapped = true
    const troll = summonCard(g, 0, 'Bosk Troll', 1, 2)
    summonCard(g, 0, 'Putrid Presence', 2, 1)
    act(g, 0, { t: 'moveAttack', unitId: troll.id, path: [], attack: { unit: nixie.id } })
    settlePrompts(g)
    expect(g.units[nixie.id]).toBeUndefined()
    expect(g.units[troll.id].damage).toBe(2)
  })
})

describe('#42 Satanic Panic\'s "one other target minion" is not a Demon', () => {
  function board() {
    const g = game()
    sites(g, 1, [1, 2], [3, 2])
    const martyrs = summonCard(g, 1, 'Martyrs of Tomorrow', 1, 2)
    const ifrit = summonCard(g, 1, 'Màzuj Ifrit', 3, 2)
    return { g, martyrs, ifrit }
  }
  it('a Demon is not a legal target', () => {
    const { g, ifrit } = board()
    castMagicFail(g, 0, 'Satanic Panic', { targets: [ifrit.id] })
  })
  it('choosing the Martyrs kills both', () => {
    const { g, martyrs, ifrit } = board()
    castMagic(g, 0, 'Satanic Panic', { targets: [martyrs.id] })
    settlePrompts(g)
    expect(g.units[martyrs.id]).toBeUndefined()
    expect(g.units[ifrit.id]).toBeUndefined()
  })
})

describe('#43 Sea of Ash kills a minion already below a nearby site when it arrives', () => {
  it('the burrowed Bats under the Active Volcano die as Sea of Ash is played', () => {
    const g = game()
    const av = avatarOf(g, 0); av.x = 1; av.y = 3; av.tapped = false
    sites(g, 0, [1, 3]); placeSite(g, 0, 'Active Volcano', 1, 2)
    const bats = summonCard(g, 0, 'Palliburrie Bats', 1, 2, 'underground')
    const cid = injectToHand(g, 0, 'Sea of Ash')
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: cid, x: 2, y: 2 })
    settlePrompts(g)
    expect(Object.values(g.sites).some((s) => s.name === 'Sea of Ash'), 'Sea of Ash was played').toBe(true)
    expect(g.units[bats.id]).toBeUndefined()
  })
})

describe('#44 Second Wind lets a Voidwalk minion step from the void', () => {
  it('offers the neighbouring voids and site', () => {
    const g = game()
    placeSite(g, 1, 'Autumn River', 1, 1)
    const pa = summonCard(g, 0, 'Phase Assassin', 0, 1, 'void'); pa.tapped = true
    castMagic(g, 0, 'Second Wind', { targets: [pa.id] })
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    const sq = ((p?.data?.squares ?? []) as { x: number; y: number }[]).map((s) => `${s.x},${s.y}`)
    expect(sq).toEqual(expect.arrayContaining(['0,0', '0,2', '1,1']))
  })
})

describe('#45 silence ends when Sister Stefánia moves away', () => {
  it('Archangel Michael gets Airborne back', () => {
    const g = game()
    sites(g, 0, [1, 0], [1, 1], [1, 2])
    const stef = summonCard(g, 0, 'Sister Stefánia', 1, 1)
    const mich = summonCard(g, 0, 'Archangel Michael', 1, 2)
    checkStateBased(g)
    expect(mich.silenced).toBe(true)
    act(g, 0, { t: 'moveAttack', unitId: stef.id, path: [{ x: 1, y: 0, region: 'surface' }] })
    settlePrompts(g)
    expect(g.units[mich.id].silenced).toBeFalsy()
    expect(effKeywords(g, g.units[mich.id]).airborne).toBe(true)
  })
})

describe('#46 Sir Gawain takes damage for his own Avatar', () => {
  it('the attacked Avatar on his square takes nothing; Gawain takes the 3', () => {
    const g = game()
    sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
    const av = avatarOf(g, 1); av.x = 1; av.y = 2; av.tapped = true
    const life = av.life
    const gawain = summonCard(g, 1, 'Sir Gawain', 1, 2); gawain.tapped = true
    const troll = summonCard(g, 0, 'Bosk Troll', 1, 1)
    act(g, 0, { t: 'moveAttack', unitId: troll.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: av.id } })
    settlePrompts(g)
    expect(avatarOf(g, 1).life).toBe(life)
    expect(g.units[gawain.id].damage).toBe(3)
  })
})

describe('#47 Sir Kay untaps after attacking a weaker minion', () => {
  it('attacking Lilith (3 power) untaps him', () => {
    const g = game()
    sites(g, 0, [1, 1])
    const kay = summonCard(g, 0, 'Sir Kay', 1, 1)
    const lilith = summonCard(g, 1, 'Lilith', 1, 1); lilith.tapped = true
    act(g, 0, { t: 'moveAttack', unitId: kay.id, path: [], attack: { unit: lilith.id } })
    settlePrompts(g)
    expect(g.units[lilith.id]).toBeUndefined()
    expect(g.units[kay.id].tapped).toBe(false)
  })
})

describe('#48 Sir Lancelot does not untap after striking an undefended site', () => {
  it('stays tapped after hitting an empty Common Village', () => {
    const g = game()
    sites(g, 0, [1, 1])
    const village = placeSite(g, 1, 'Common Village', 1, 2)
    const lance = summonCard(g, 0, 'Sir Lancelot', 1, 1)
    act(g, 0, { t: 'moveAttack', unitId: lance.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { site: village.id } })
    settlePrompts(g)
    expect(g.units[lance.id].tapped).toBe(true)
  })
  it('control: a real fight untaps him', () => {
    const g = game()
    sites(g, 0, [1, 1])
    const lance = summonCard(g, 0, 'Sir Lancelot', 1, 1)
    const foe = summonCard(g, 1, 'Bosk Troll', 1, 1); foe.tapped = true
    act(g, 0, { t: 'moveAttack', unitId: lance.id, path: [], attack: { unit: foe.id } })
    settlePrompts(g)
    expect(g.units[lance.id].tapped).toBe(false)
  })
})
