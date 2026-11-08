// Review 3, batch loop-c: THEIR_ISSUES_REPRO_LOOP.md #25–#36 (comparison with another engine).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, act, answer, castMagic, waiveThreshold, defaultAnswer } from './helpers'
import { avatarOf, checkStateBased, type GameState } from '../src'
import '../src/cards/scripts/index'

function settle(g: GameState, seen: string[] = [], pick?: (p: GameState['prompts'][number]) => any): void {
  for (let i = 0; i < 30 && g.prompts.length; i++) {
    const p = g.prompts[0]
    seen.push(p.kind)
    const c = pick?.(p)
    answer(g, c !== undefined ? c : defaultAnswer(p))
  }
}
function game(): GameState {
  const g = newGame(); keepBoth(g)
  // park both Avatars out of the way unless a test moves them
  const a0 = avatarOf(g, 0); a0.x = 0; a0.y = 0
  const a1 = avatarOf(g, 1); a1.x = 4; a1.y = 3
  return g
}

describe('LOOP #25 — Escyllion Cyclops strikes in a fight that is not an attack', () => {
  it("the Giant Shark's fight: both strike", () => {
    const g = game()
    placeSite(g, 0, 'Stream', 2, 2)
    placeSite(g, 0, 'Stream', 2, 1)
    const cyclops = summonCard(g, 0, 'Escyllion Cyclops', 2, 2)
    const shark = summonCard(g, 0, 'Giant Shark', 2, 1)
    act(g, 0, { t: 'moveAttack', unitId: cyclops.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    settle(g)
    expect(g.units[shark.id], 'the Cyclops struck the Shark for 6').toBeUndefined()
    expect(g.units[cyclops.id]?.damage).toBe(5)
  })
})

describe('LOOP #26 (owner ruling: kept) — Failed Mutation blocks magic projectiles at its square', () => {
  it('Firebolts into a square with Failed Mutation and a Siege Giant: every bolt fizzles, nobody is hit', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 3)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    const mutation = summonCard(g, 0, 'Failed Mutation', 2, 3)
    const giant = summonCard(g, 1, 'Siege Giant', 2, 3)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Firebolts', { extra: { direction: 'n' } })
    const seen: string[] = []
    settle(g, seen, (p) => (p.kind === 'chooseTargets' ? [giant.id] : undefined))
    expect(seen.filter((k) => k === 'chooseTargets'), 'no choice offered').toHaveLength(0)
    expect(mutation.damage).toBe(0)
    expect(giant.damage).toBe(0)
  })

  it('a unit beyond the Mutation is not reached', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 3)
    placeSite(g, 0, 'Rustic Village', 2, 4)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    summonCard(g, 0, 'Failed Mutation', 2, 3)
    const giant = summonCard(g, 1, 'Siege Giant', 2, 4)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Firebolts', { extra: { direction: 'n' } })
    settle(g, [], (p) => (p.kind === 'chooseTargets' ? [giant.id] : undefined))
    expect(giant.damage).toBe(0)
  })
})

describe('LOOP #27/#28 — Fourberie Knot protects only a minion that can be modified', () => {
  it('an Avatar bearer is not protected', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; av.life = 20
    giveArtifact(g, av, 'Fourberie Knot')
    const garg = summonCard(g, 1, 'Gargantula', 2, 1)
    act(g, 0, { t: 'moveAttack', unitId: av.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: garg.id } })
    settle(g)
    expect(av.life).toBe(16)
  })

  it('Monks of Kobalsa (can\'t be modified) are not protected', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const monks = summonCard(g, 0, 'Monks of Kobalsa', 2, 2)
    giveArtifact(g, monks, 'Fourberie Knot')
    const garg = summonCard(g, 1, 'Gargantula', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: monks.id, path: [], attack: { unit: garg.id } })
    settle(g)
    expect(g.units[garg.id]).toBeUndefined()
    expect(g.units[monks.id], 'the Monks take 4 and die').toBeUndefined()
  })

  it('control: an ordinary minion bearer is protected', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const troll = summonCard(g, 0, 'Stygian Archers', 2, 2)
    giveArtifact(g, troll, 'Fourberie Knot')
    const garg = summonCard(g, 1, 'Gargantula', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: troll.id, path: [], attack: { unit: garg.id } })
    settle(g)
    expect(g.units[troll.id]?.damage).toBe(0)
  })
})

describe('LOOP #29 — Golden Harp caps the life loss from a strike on a site', () => {
  it('Saracen Raiders holding the Harp strike an undefended site: 2 life, not 3', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const bloom = placeSite(g, 1, 'Desert Bloom', 2, 1)
    const opp = avatarOf(g, 1); opp.life = 17
    const raiders = summonCard(g, 0, 'Saracen Raiders', 2, 2)
    giveArtifact(g, raiders, 'Golden Harp')
    act(g, 0, { t: 'moveAttack', unitId: raiders.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { site: bloom.id } })
    settle(g)
    expect(opp.life).toBe(15)
  })
})

describe('LOOP #30 — Hellstar can intercept', () => {
  it('is offered as an interceptor', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    summonCard(g, 1, 'Hellstar', 2, 1)
    const hounds = summonCard(g, 0, 'Hellhounds', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: hounds.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    expect(g.prompts[0]?.kind).toBe('intercept')
  })
})

describe('LOOP #31 — Interrogator triggers on an ally\'s ranged shot at the enemy Avatar', () => {
  it('asks the opponent to pay 3 life or let me draw', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 3)
    g.units[g.players[0].avatarUnitId].name = 'Interrogator'
    const enemy = avatarOf(g, 1); enemy.x = 2; enemy.y = 3; enemy.life = 15
    const archers = summonCard(g, 0, 'Stygian Archers', 2, 2)
    act(g, 0, { t: 'activate', sourceId: archers.id, ability: 'ranged', extra: { direction: 'n' } })
    expect(enemy.life).toBe(12)
    expect(g.prompts.some((p) => /Interrogation/.test(p.title))).toBe(true)
  })
})

describe('LOOP #32 — a Land Deed bearer controls its site at once', () => {
  it('walking onto an enemy site with the Deed takes control before the turn ends', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const hills = placeSite(g, 1, 'Silent Hills', 2, 1)
    const bearer = summonCard(g, 0, 'Quarrelsome Kobolds', 2, 2)
    giveArtifact(g, bearer, 'Land Deed')
    act(g, 0, { t: 'moveAttack', unitId: bearer.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    settle(g)
    expect(hills.controller).toBe(0)
  })

  it('a bearer already on the site: the site is mine, so it can\'t be attacked', () => {
    const g = game()
    const hills = placeSite(g, 1, 'Silent Hills', 2, 1)
    const bearer = summonCard(g, 0, 'Quarrelsome Kobolds', 2, 1)
    giveArtifact(g, bearer, 'Land Deed')
    const skel = summonCard(g, 0, 'Skeleton', 2, 1)
    checkStateBased(g)
    expect(hills.controller).toBe(0)
    const opp = avatarOf(g, 1); const life = opp.life
    act(g, 0, { t: 'moveAttack', unitId: skel.id, path: [], attack: { site: hills.id } })
    settle(g)
    expect(g.log.some((l: any) => /cannot attack: you can only attack enemy sites/.test(l.msg)), 'the attack is refused').toBe(true)
    expect(opp.life).toBe(life)
  })
})

describe('LOOP #33 — Lord of Destruction breaks a Ward at the site it destroys', () => {
  it('my warded Order of the White Wing survives, unwarded', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const valley = placeSite(g, 1, 'Valley', 2, 1)
    const lord = summonCard(g, 0, 'Lord of Destruction', 2, 2)
    const order = summonCard(g, 0, 'Order of the White Wing', 2, 1); order.tapped = true; order.ward = true
    act(g, 0, { t: 'moveAttack', unitId: lord.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { site: valley.id } })
    settle(g)
    expect(g.sites[valley.id]?.isRubble ?? true, 'the Valley is destroyed').toBe(true)
    expect(g.units[order.id], 'the Order lives').toBeTruthy()
    expect(order.ward).toBeFalsy()
  })
})

describe('LOOP #34 — Men of Leng make the Avatar discard even when they die in the same fight', () => {
  it('a Lethal Avatar kills them, yet discards a random card', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2
    giveArtifact(g, av, 'Poisonous Dagger')
    const men = summonCard(g, 1, 'Men of Leng', 2, 1)
    const hand = g.players[0].hand.length
    expect(hand).toBeGreaterThan(0)
    act(g, 0, { t: 'moveAttack', unitId: av.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: men.id } })
    settle(g)
    expect(g.units[men.id]).toBeUndefined()
    expect(g.players[0].hand.length).toBe(hand - 1)
  })
})

describe('LOOP #36 — two Sister Stefánias: the older one\'s silence wins', () => {
  it('the newer one is silenced (and, silenced, still keeps her Ward mark); the older keeps hers', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const mine = summonCard(g, 0, 'Sister Stefánia', 2, 2); mine.ward = true; mine.enteredTurn = 0
    const theirs = summonCard(g, 1, 'Sister Stefánia', 2, 1); theirs.ward = true; theirs.enteredTurn = 1
    checkStateBased(g)
    expect(mine.silenced, 'the older Stefánia is not silenced').toBeFalsy()
    expect(mine.ward, 'and keeps her Ward').toBe(true)
    expect(theirs.silenced, 'the newer one is silenced').toBe(true)
    // Codex, Silenced: "If a minion already has a Stealth or Ward mark and then is affected by Silence,
    // it will retain the mark!" (only a DISABLED minion loses it — Codex, Ward). Owner ruling 2026-11-08.
    expect(theirs.ward, 'a silenced minion keeps its Ward mark').toBe(true)
    act(g, 0, { t: 'moveAttack', unitId: mine.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: theirs.id } })
    settle(g)
    // each Ward absorbs the other's strike and breaks: both survive
    expect(g.units[theirs.id]?.ward, 'her Ward broke on my strike').toBeFalsy()
    expect(g.units[mine.id]?.ward, 'mine broke on hers').toBeFalsy()
    expect(g.units[theirs.id]).toBeTruthy()
    expect(g.units[mine.id]).toBeTruthy()
  })
})
