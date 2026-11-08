// THEIRS_12H.md #73–#84, plus two follow-ups: King Arthur blocks every control change at the moment
// of the steal (12H #55), and an Ordinary source's target picks never include the Earl (LOOP #39).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, castMagic, castMagicFail, waiveThreshold, act, answer, settlePrompts, injectToHand } from './helpers'
import { avatarOf, legalTargetsFor, getScript, summonToken, type GameState } from '../src'
import '../src/cards/scripts/index'

function game(): GameState {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  for (const s of Object.values(g.sites)) delete g.sites[s.id]
  return g
}
const sites = (g: GameState, p: 0 | 1, ...sq: [number, number][]) => { for (const [x, y] of sq) placeSite(g, p, 'Rustic Village', x, y) }
const aura = (g: GameState, name: string, owner: 0 | 1, squares: { x: number; y: number }[]) => {
  g.cards['c' + name] = { id: 'c' + name, name, owner } as any
  g.auras['a' + name] = { id: 'a' + name, cardId: 'c' + name, name, controller: owner, owner, squares, anchor: squares[0] } as any
  return g.auras['a' + name]
}

describe('12H #55 follow-up: King Arthur blocks every steal', () => {
  it('Puppet Master takes no tapped enemy while King Arthur is in the realm', () => {
    const g = game()
    sites(g, 0, [1, 1], [3, 1])
    const foe = summonCard(g, 1, 'Bosk Troll', 1, 1); foe.tapped = true
    summonCard(g, 1, 'King Arthur', 3, 1)
    castMagic(g, 0, 'Puppet Master', { at: { x: 1, y: 1 } })
    settlePrompts(g)
    expect(g.units[foe.id].controller).toBe(1)
  })
  it('control: without King Arthur the Puppet Master takes it', () => {
    const g = game()
    sites(g, 0, [1, 1])
    const foe = summonCard(g, 1, 'Bosk Troll', 1, 1); foe.tapped = true
    castMagic(g, 0, 'Puppet Master', { at: { x: 1, y: 1 } })
    settlePrompts(g)
    expect(g.units[foe.id].controller).toBe(0)
  })
  it('Seasoned Sellsword can\'t be hired while King Arthur is in the realm', () => {
    const g = game()
    const av = avatarOf(g, 0); av.x = 1; av.y = 1
    sites(g, 0, [1, 1], [3, 1])
    const sword = summonCard(g, 1, 'Seasoned Sellsword', 1, 1)
    summonCard(g, 1, 'King Arthur', 3, 1)
    injectToHand(g, 0, 'Bosk Troll')
    const ab = getScript('Seasoned Sellsword')!.grantsAbilities!(g, sword.id, av)[0]
    act(g, 0, { t: 'activate', sourceId: av.id, ability: ab.key } as any)
    settlePrompts(g)
    expect(g.units[sword.id].controller).toBe(1)
  })
})

describe('LOOP #39 follow-up: an Ordinary Genesis can\'t target the Earl', () => {
  it('Angry Mob (Ordinary) may not pick Earl of the Ivory Towers', () => {
    const g = game()
    sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
    const earl = summonCard(g, 1, 'Earl of the Ivory Towers', 1, 2)
    castMagicFail(g, 0, 'Angry Mob', { at: { x: 1, y: 1 }, targets: [earl.id] })
    const caster = avatarOf(g, 0)
    const pick = { script: getScript('Angry Mob'), specs: getScript('Angry Mob')!.genesisTargets!, caster: { ...caster, x: 1, y: 1 }, player: 0 as const, source: 'Angry Mob' }
    expect(legalTargetsFor(g, pick, []).some((r) => 'unit' in r && r.unit === earl.id)).toBe(false)
  })
})

describe('12H #73/#74 Rest in Peace', () => {
  it('#73 a Skeleton burrowed on a covered land site dies', () => {
    const g = game()
    sites(g, 0, [1, 0], [1, 1])
    aura(g, 'Rest in Peace', 0, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }])
    const sk = summonCard(g, 0, 'Skeleton', 1, 0)
    act(g, 0, { t: 'moveAttack', unitId: sk.id, path: [{ x: 1, y: 1, region: 'surface' }] })
    settlePrompts(g)
    expect(g.units[sk.id]).toBeUndefined()
  })
  it('#74 a Spectral Stalker on a covered WATER site stays on the surface', () => {
    const g = game()
    sites(g, 0, [1, 0]); placeSite(g, 1, 'Innsmouth Dock', 1, 1)
    aura(g, 'Rest in Peace', 1, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }])
    const st = summonCard(g, 0, 'Spectral Stalker', 1, 0)
    act(g, 0, { t: 'moveAttack', unitId: st.id, path: [{ x: 1, y: 1, region: 'surface' }] })
    settlePrompts(g)
    expect(g.units[st.id]?.region).toBe('surface')
  })
})

describe('12H #75 Rhongomyniad hits an enemy on the bearer\'s own square', () => {
  it('the Death Knight dies', () => {
    const g = game()
    placeSite(g, 0, 'Wasteland', 1, 1); sites(g, 0, [1, 2], [1, 0], [0, 1], [2, 1])
    const hy = summonCard(g, 0, 'Redmane Hyena', 1, 1)
    const rh = giveArtifact(g, hy, 'Rhongomyniad')
    const dk = summonCard(g, 1, 'Death Knight', 1, 1)
    act(g, 0, { t: 'activate', sourceId: rh.id, ability: 'hurl' })
    answer(g, 'n')
    settlePrompts(g)
    expect(g.units[dk.id]).toBeUndefined()
  })
})

describe('12H #76 River Rapids can\'t push an underwater minion onto land', () => {
  it('no land destination is offered for the underwater Frog', () => {
    const g = game()
    const rr = placeSite(g, 0, 'River Rapids', 1, 1); placeSite(g, 0, 'Steppe', 1, 0); placeSite(g, 0, 'Steppe', 0, 1)
    const frog = summonToken(g, 'Frog', 0, 1, 1, 'underwater')!
    act(g, 0, { t: 'activate', sourceId: rr.id, ability: 'rapids' })
    if (g.prompts[0]?.kind === 'chooseTargets') answer(g, [frog.id])
    const sq = ((g.prompts[0]?.kind === 'chooseSquare' ? g.prompts[0].data.squares : []) as { x: number; y: number }[]).map((s) => `${s.x},${s.y}`)
    expect(sq).not.toContain('1,0')
    expect(sq).not.toContain('0,1')
    settlePrompts(g)
    expect(g.units[frog.id]).toBeDefined()
  })
})

describe('12H #77 Rolling Boulder\'s damage is the Boulder\'s, not the pusher\'s', () => {
  it('Sir Kay (Fire) pushes; the Askelon Phoenix takes the 4 and dies', () => {
    const g = game()
    sites(g, 0, [1, 0], [2, 0], [3, 0])
    const kay = summonCard(g, 0, 'Sir Kay', 1, 0)
    const phoenix = summonCard(g, 0, 'Askelon Phoenix', 1, 0)
    g.cards.crb = { id: 'crb', name: 'Rolling Boulder', owner: 0 } as any
    g.artifacts.arb = { id: 'arb', cardId: 'crb', name: 'Rolling Boulder', conjuredBy: 0, x: 1, y: 0, region: 'surface', carriedBy: null, tapped: false } as any
    act(g, 0, { t: 'activate', sourceId: kay.id, ability: 'boulder:push' } as any)
    answer(g, 'e')
    settlePrompts(g)
    expect(g.units[phoenix.id]).toBeUndefined()
  })
})

describe('12H #78 Saintweald\'s echo of Nosferatu\'s Deathrite', () => {
  it('Nosferatu cast onto Saintweald stays in play', () => {
    const g = game()
    const av = avatarOf(g, 0)
    placeSite(g, 0, 'Saintweald', 2, 0); av.x = 2; av.y = 0
    castMagic(g, 0, 'Nosferatu', { at: { x: 2, y: 0 } })
    settlePrompts(g)
    expect(Object.values(g.units).some((u) => u.name === 'Nosferatu')).toBe(true)
    expect(g.players[0].banished.some((id) => g.cards[id].name === 'Nosferatu')).toBe(false)
  })
})

describe('12H #79 Sawbones heals only after the whole simultaneous strike', () => {
  it('two defenders\' 1 + 2 kill the 3-power Knight', () => {
    const g = game()
    sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
    const knight = summonCard(g, 0, 'Penitent Knight', 1, 1)
    summonCard(g, 0, 'Sawbones', 1, 1)
    const crawler = summonCard(g, 1, 'Crawler', 1, 2)
    const town = summonCard(g, 1, 'Serava Townsfolk', 1, 2)
    const jester = summonCard(g, 1, 'Court Jester', 1, 1)
    act(g, 0, { t: 'moveAttack', unitId: knight.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: crawler.id } })
    answer(g, [town.id, jester.id])
    if (g.prompts[0]?.kind === 'stayInFight') answer(g, false)
    if (g.prompts[0]?.kind === 'allocateDamage') answer(g, { strikerId: knight.id, allocation: { [jester.id]: 1, [town.id]: 2 } })
    settlePrompts(g)
    expect(g.units[knight.id]).toBeUndefined()
  })
})

describe('12H #80/#81 Scorched Earth destroys everything there', () => {
  it('#80 the artifact an enemy Avatar carries on the site is destroyed', () => {
    const g = game()
    const pyre = placeSite(g, 0, 'Funeral Pyre', 1, 1)
    const foeAv = avatarOf(g, 1); foeAv.x = 1; foeAv.y = 1
    const hw = giveArtifact(g, foeAv, 'Holy Water')
    castMagic(g, 0, 'Scorched Earth')
    answer(g, [pyre.id])
    settlePrompts(g)
    expect(g.artifacts[hw.id]).toBeUndefined()
    expect(g.players[1].cemetery).toContain(hw.cardId)
  })
  it('#81 an aura over the site is destroyed', () => {
    const g = game()
    const w = placeSite(g, 0, 'Wasteland', 1, 1); sites(g, 0, [2, 1], [1, 2], [2, 2])
    const j = aura(g, 'Jihad', 1, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }])
    castMagic(g, 0, 'Scorched Earth')
    answer(g, [w.id])
    settlePrompts(g)
    expect(g.auras[j.id]).toBeUndefined()
  })
})

describe('12H #82 Seasoned Sellsword costs a discard', () => {
  it('hiring discards a card', () => {
    const g = game()
    const av = avatarOf(g, 0); av.x = 1; av.y = 1
    sites(g, 0, [1, 1])
    const sword = summonCard(g, 1, 'Seasoned Sellsword', 1, 1)
    injectToHand(g, 0, 'Bosk Troll')
    const before = g.players[0].hand.length
    const ab = getScript('Seasoned Sellsword')!.grantsAbilities!(g, sword.id, av)[0]
    act(g, 0, { t: 'activate', sourceId: av.id, ability: ab.key } as any)
    settlePrompts(g)
    expect(g.units[sword.id].controller).toBe(0)
    expect(g.players[0].hand.length).toBe(before - 1)
  })
})

describe('12H #83 Siege Ballista can\'t target a Stealthed enemy', () => {
  it('the Poachers are not offered', () => {
    const g = game()
    sites(g, 0, [1, 1]); sites(g, 1, [2, 1])
    const rb = summonCard(g, 0, 'Bosk Troll', 1, 1)
    const crew = summonCard(g, 0, 'Bosk Troll', 1, 1)
    const bal = giveArtifact(g, rb, 'Siege Ballista')
    const po = summonCard(g, 1, 'Kingswood Poachers', 1, 1); po.stealth = true
    const other = summonCard(g, 1, 'Bosk Troll', 2, 1)
    act(g, 0, { t: 'activate', sourceId: bal.id, ability: 'ballista' })
    if (g.prompts[0]?.data?.candidates?.includes(crew.id)) answer(g, [crew.id])
    const cands = (g.prompts[0]?.data?.candidates ?? []) as string[]
    expect(cands).toContain(other.id)
    expect(cands).not.toContain(po.id)
  })
})

describe('12H #84 Sir Agravaine strikes even if the attacking ally died', () => {
  it('Aino dies to Agravaine\'s strike after the Cottagers fall', () => {
    const g = game()
    sites(g, 0, [1, 1]); sites(g, 1, [1, 2])
    const cot = summonCard(g, 0, 'Common Cottagers', 1, 1)
    summonCard(g, 0, 'Sir Agravaine', 1, 1)
    const aino = summonCard(g, 1, 'Aino', 1, 2)
    act(g, 0, { t: 'moveAttack', unitId: cot.id, path: [{ x: 1, y: 2, region: 'surface' }], attack: { unit: aino.id } })
    settlePrompts(g)
    expect(g.units[cot.id]).toBeUndefined()
    expect(g.units[aino.id]).toBeUndefined()
  })
})
