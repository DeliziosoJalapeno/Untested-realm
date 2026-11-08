// THEIRS_12H.md #25–#36, plus LOOP #39's follow-up (Ordinary spells/abilities can't target the Earl).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, castMagic, castMagicFail, waiveThreshold, act, answer, settlePrompts, injectToHand } from './helpers'
import { avatarOf, sourceMana, siteSilenced, type GameState } from '../src'
import '../src/cards/scripts/index'

function game(): GameState {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  for (const s of Object.values(g.sites)) delete g.sites[s.id]
  return g
}
const sites = (g: GameState, p: 0 | 1, ...sq: [number, number][]) => { for (const [x, y] of sq) placeSite(g, p, 'Rustic Village', x, y) }
const squaresOf = (g: GameState) => ((g.prompts[0]?.data?.squares ?? []) as { x: number; y: number }[]).map((s) => `${s.x},${s.y}`)

describe('LOOP #39 follow-up: Ordinary spells and abilities can\'t target Earl of the Ivory Towers', () => {
  function board() {
    const g = game()
    const av = avatarOf(g, 0); av.x = 1; av.y = 1
    sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
    const earl = summonCard(g, 1, 'Earl of the Ivory Towers', 1, 2)
    const troll = summonCard(g, 1, 'Bosk Troll', 1, 2)
    return { g, earl, troll }
  }
  it('Arc Lightning (Ordinary) can\'t target him', () => {
    const { g, earl } = board()
    castMagicFail(g, 0, 'Arc Lightning', { targets: [earl.id] })
  })
  it('control: it can target the Troll beside him', () => {
    const { g, troll } = board()
    castMagic(g, 0, 'Arc Lightning', { targets: [troll.id] })
    expect(g.units[troll.id]).toBeUndefined()
  })
})

describe('12H #25 a silenced Avalon provides only for its controller', () => {
  it('Smokestacks of Gnaak next to Avalon: the opponent gets no Avalon mana', () => {
    const g = game()
    placeSite(g, 0, 'Smokestacks of Gnaak', 0, 0); const avalon = placeSite(g, 0, 'Avalon', 1, 0); placeSite(g, 0, 'Fertile Earth', 2, 0)
    placeSite(g, 1, 'Fertile Earth', 0, 3); placeSite(g, 1, 'Valley', 1, 3); placeSite(g, 1, 'Valley', 2, 3)
    expect(siteSilenced(g, avalon)).toBe(true)
    expect(sourceMana(g, 1)).toBe(3)
  })
})

describe('12H #26 Baba Yaga\'s Hut may swap with an empty Rubble', () => {
  it('offers the Rubble in the back row', () => {
    const g = game()
    const av = avatarOf(g, 0); av.x = 4; av.y = 2 // off the back row, so the sites there are empty
    const hut = placeSite(g, 0, "Baba Yaga's Hut", 0, 0); placeSite(g, 0, 'Poisoned Well', 2, 0)
    const rubble = placeSite(g, 0, 'Rustic Village', 3, 0); rubble.isRubble = true
    act(g, 0, { t: 'activate', sourceId: hut.id, ability: 'walk' })
    expect(squaresOf(g)).toEqual(expect.arrayContaining(['2,0', '3,0']))
  })
})

describe('12H #27 Balor\'s gaze may pick his own Stealthed ally', () => {
  it('the Winter Nymph is hit', () => {
    const g = game()
    sites(g, 0, [1, 1], [1, 2])
    const balor = summonCard(g, 0, 'Balor of the Evil Eye', 1, 1)
    const nymph = summonCard(g, 0, 'Winter Nymph', 1, 2); nymph.stealth = true
    act(g, 0, { t: 'activate', sourceId: balor.id, ability: 'gaze' })
    answer(g, 'n')
    settlePrompts(g)
    expect(g.units[nymph.id]?.damage ?? 99).toBeGreaterThan(0)
  })
})

describe('12H #28 Candlemas Monks dying in the end phase don\'t end the next turn', () => {
  it('the opponent gets a normal main phase', () => {
    const g = game()
    placeSite(g, 0, 'Thin Ice', 1, 1)
    const monks = summonCard(g, 0, 'Candlemas Monks', 1, 1)
    summonCard(g, 0, 'Bosk Troll', 1, 1)
    act(g, 0, { t: 'endTurn' }); settlePrompts(g)
    expect(g.units[monks.id], 'the Monks drowned').toBeUndefined()
    expect(g.activePlayer).toBe(1)
    expect(g.phase).toBe('main')
  })
})

describe('12H #29 an Omphalos draw is the player\'s draw for Chains of Prometheus', () => {
  it('the Autumn Unicorn is tapped when the Dank Omphalos draws', () => {
    const g = game()
    sites(g, 0, [1, 1]); sites(g, 1, [3, 3])
    g.cards.cdo = { id: 'cdo', name: 'Dank Omphalos', owner: 0 } as any
    g.artifacts.ado = { id: 'ado', cardId: 'cdo', name: 'Dank Omphalos', conjuredBy: 0, x: 1, y: 1, region: 'surface', carriedBy: null, tapped: false } as any
    g.cards.ccp = { id: 'ccp', name: 'Chains of Prometheus', owner: 1 } as any
    g.artifacts.acp = { id: 'acp', cardId: 'ccp', name: 'Chains of Prometheus', conjuredBy: 1, x: 3, y: 3, region: 'surface', carriedBy: null, tapped: false } as any
    const uni = summonCard(g, 0, 'Autumn Unicorn', 1, 1)
    act(g, 0, { t: 'endTurn' }); settlePrompts(g)
    expect(g.units[uni.id].tapped).toBe(true)
  })
})

describe('12H #30 Coy Nixie can make The Doom of Dilmun take a step', () => {
  it('it steps onto her square and is tapped', () => {
    const g = game()
    sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
    const nixie = summonCard(g, 0, 'Coy Nixie', 1, 1)
    const doom = summonCard(g, 1, 'The Doom of Dilmun', 1, 2)
    act(g, 0, { t: 'activate', sourceId: nixie.id, ability: 'beckon', targets: [doom.id] })
    settlePrompts(g)
    expect([g.units[doom.id].x, g.units[doom.id].y]).toEqual([1, 1])
    expect(g.units[doom.id].tapped).toBe(true)
  })
  it('Wuthering Heights flies it to a nearby site (being moved is not a modification)', () => {
    const g = game()
    const wh = placeSite(g, 0, 'Wuthering Heights', 1, 1); sites(g, 0, [1, 2])
    const doom = summonCard(g, 1, 'The Doom of Dilmun', 1, 1)
    act(g, 0, { t: 'activate', sourceId: wh.id, ability: 'gust' })
    if (g.prompts[0]?.kind === 'chooseTargets') answer(g, [doom.id])
    answer(g, { x: 1, y: 2 })
    settlePrompts(g)
    expect([g.units[doom.id].x, g.units[doom.id].y]).toEqual([1, 2])
  })
})

describe('12H #31 Wuthering Heights won\'t fly an Evil minion onto a Crucifix location', () => {
  it('the Crucifix bearer\'s square is not offered', () => {
    const g = game()
    const wh = placeSite(g, 0, 'Wuthering Heights', 1, 1); sites(g, 0, [2, 1], [2, 2], [1, 2])
    const sk = summonCard(g, 0, 'Skeleton', 1, 1)
    const boars = summonCard(g, 0, 'Wild Boars', 2, 1)
    giveArtifact(g, boars, 'Crucifix')
    act(g, 0, { t: 'activate', sourceId: wh.id, ability: 'gust' })
    if (g.prompts[0]?.kind === 'chooseTargets') answer(g, [sk.id])
    const sq = squaresOf(g)
    expect(sq).toEqual(expect.arrayContaining(['2,2', '1,2']))
    expect(sq).not.toContain('2,1')
  })
})

describe('12H #32 Crucifix lets a Monster in while Saint of Redemption is in the realm', () => {
  it('the Bodach Bogeyman attacks the Crucifix bearer', () => {
    const g = game()
    sites(g, 0, [1, 1], [1, 2], [3, 3])
    summonCard(g, 1, 'Saint of Redemption', 3, 3).tapped = true
    const bog = summonCard(g, 0, 'Bodach Bogeyman', 1, 1)
    const ill = summonCard(g, 1, 'Adept Illusionist', 1, 2)
    giveArtifact(g, ill, 'Crucifix')
    act(g, 0, { t: 'moveAttack', unitId: bog.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: ill.id } })
    settlePrompts(g)
    expect(g.units[ill.id]).toBeUndefined()
  })
})

describe('12H #33 a Ranged shot is a strike for strike effects', () => {
  const shoot = (g: GameState, id: string) => act(g, 0, { t: 'activate', sourceId: id, ability: 'ranged', extra: { direction: 'n' } })
  it('(a) Mask of Mayhem doubles it', () => {
    const g = game(); sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
    const sk = summonCard(g, 0, 'Skirmishers of Mu', 1, 1); giveArtifact(g, sk, 'Mask of Mayhem')
    const jinn = summonCard(g, 1, 'Nimbus Jinn', 1, 2)
    shoot(g, sk.id); settlePrompts(g)
    expect(g.units[jinn.id]).toBeUndefined()
  })
  it('(b) Doomsday Prophet does not double it', () => {
    const g = game(); sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
    const dp = summonCard(g, 0, 'Doomsday Prophet', 1, 1); giveArtifact(g, dp, 'Peacemaker Arbalest')
    const titan = summonCard(g, 1, 'Wraetannis Titan', 1, 2)
    shoot(g, dp.id); settlePrompts(g)
    expect(g.units[titan.id].damage).toBe(1)
  })
  it('(c) Goswhit Helmet prevents it and returns to hand', () => {
    const g = game(); sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
    const dr = summonCard(g, 0, 'Mordric Druids', 1, 1); giveArtifact(g, dr, 'Fail-not Bow')
    const fh = summonCard(g, 1, 'Frozen Horror', 1, 2); const helm = giveArtifact(g, fh, 'Goswhit Helmet')
    shoot(g, dr.id); settlePrompts(g)
    expect(g.units[fh.id].damage).toBe(0)
    expect(g.artifacts[helm.id]).toBeUndefined()
  })
})

describe('12H #34 Dark Alley gives no Stealth to The Doom of Dilmun', () => {
  it('it stays unstealthed', () => {
    const g = game()
    sites(g, 0, [1, 1]); placeSite(g, 0, 'Dark Alley', 1, 2)
    const doom = summonCard(g, 0, 'The Doom of Dilmun', 1, 1)
    act(g, 0, { t: 'moveAttack', unitId: doom.id, path: [{ x: 1, y: 2, region: 'surface' }] })
    settlePrompts(g)
    expect(g.units[doom.id].stealth).toBeFalsy()
  })
})

describe('12H #35 uncarried Eggs still work', () => {
  it('a Devil\'s Egg on your site costs you 1 at the end of the turn', () => {
    const g = game()
    sites(g, 0, [1, 1])
    g.cards.cde = { id: 'cde', name: "Devil's Egg", owner: 0 } as any
    g.artifacts.ade = { id: 'ade', cardId: 'cde', name: "Devil's Egg", conjuredBy: 0, x: 1, y: 1, region: 'surface', carriedBy: null, tapped: false } as any
    const life = avatarOf(g, 0).life!
    act(g, 0, { t: 'endTurn' }); settlePrompts(g)
    expect(avatarOf(g, 0).life).toBe(life - 1)
  })
})

describe('12H #36 Disintegrate banishes what the target carries', () => {
  it('the Sword and Shield ends in the banished pile', () => {
    const g = game()
    const av = avatarOf(g, 0); av.x = 1; av.y = 1
    sites(g, 0, [1, 1]); sites(g, 1, [2, 2])
    const bg = summonCard(g, 1, 'Royal Bodyguard', 2, 2)
    const sws = giveArtifact(g, bg, 'Sword and Shield')
    castMagic(g, 0, 'Disintegrate', { targets: [bg.id] })
    settlePrompts(g)
    expect(g.players[1].banished).toContain(sws.cardId)
    expect(g.players[1].banished).toContain(bg.cardId)
  })
})
