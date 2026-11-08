// Review 3, batch loop-e: THEIR_ISSUES_REPRO_LOOP.md #49–#59 (comparison with another engine).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer, castMagic, waiveThreshold, defaultAnswer } from './helpers'
import { avatarOf, effKeywords, type GameState } from '../src'
import { sourceMana } from '../src/engine/turn'
import { affinity } from '../src/engine/statics'
import '../src/cards/scripts/index'

function settle(g: GameState, seen: { kind: string; player: number; title: string }[] = [], pick?: (p: GameState['prompts'][number]) => any): void {
  for (let i = 0; i < 30 && g.prompts.length; i++) {
    const p = g.prompts[0]
    seen.push({ kind: p.kind, player: p.player, title: p.title })
    const c = pick?.(p)
    answer(g, c !== undefined ? c : defaultAnswer(p))
  }
}
function game(): GameState {
  const g = newGame(); keepBoth(g)
  // park both Avatars out of the way unless a test moves them
  const a0 = avatarOf(g, 0); a0.x = 0; a0.y = 0
  const a1 = avatarOf(g, 1); a1.x = 4; a1.y = 3
  placeSite(g, 0, 'Rustic Village', 0, 0)
  placeSite(g, 1, 'Rustic Village', 4, 3)
  return g
}
const handOf = (g: GameState, p: 0 | 1) => g.players[p].hand.length

describe('LOOP #49/#50 — Sir Pellinore', () => {
  it('draws nothing for killing his own Giant Shark', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Stream', 2, 1)
    const shark = summonCard(g, 0, 'Giant Shark', 2, 1); shark.tapped = true
    const pell = summonCard(g, 0, 'Sir Pellinore', 2, 2)
    summonCard(g, 1, 'Highland Princess', 4, 3)
    const hand = handOf(g, 0)
    act(g, 0, { t: 'moveAttack', unitId: pell.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    settle(g)
    expect(g.units[shark.id], 'the Shark died').toBeUndefined()
    expect(handOf(g, 0), 'no card for an allied victim').toBe(hand)
  })

  it('a tie for strongest is the active player\'s choice', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const troll = summonCard(g, 0, 'Bosk Troll', 2, 2)
    summonCard(g, 0, 'Hellhounds', 0, 0)
    summonCard(g, 1, 'Sir Pellinore', 2, 1)
    const hand = handOf(g, 1)
    act(g, 0, { t: 'moveAttack', unitId: troll.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: Object.values(g.units).find((u) => u.name === 'Sir Pellinore')!.id } })
    const seen: { kind: string; player: number; title: string }[] = []
    settle(g, seen, (p) => (p.kind === 'yesNo' && /Pellinore/.test(p.title) ? false : undefined))
    expect(g.units[troll.id]).toBeUndefined()
    expect(seen.find((p) => /Pellinore/.test(p.title))?.player, 'the active player decides the tie').toBe(0)
    expect(handOf(g, 1), 'I named the Hellhounds: no draw').toBe(hand)
  })

  it('split power is compared by its average (Yellow Knight 3/2 is 2, below a Bosk Troll)', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const knight = summonCard(g, 0, 'Yellow Knight', 2, 2)
    summonCard(g, 0, 'Bosk Troll', 0, 0)
    const pell = summonCard(g, 1, 'Sir Pellinore', 2, 1)
    const hand = handOf(g, 1)
    act(g, 0, { t: 'moveAttack', unitId: knight.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: pell.id } })
    const seen: { kind: string; player: number; title: string }[] = []
    settle(g, seen)
    expect(g.units[knight.id]).toBeUndefined()
    expect(seen.some((p) => /Pellinore/.test(p.title)), 'no tie to decide').toBe(false)
    expect(handOf(g, 1)).toBe(hand)
  })

  it('control: killing the strictly strongest enemy minion still draws', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const knight = summonCard(g, 0, 'Yellow Knight', 2, 2)
    summonCard(g, 0, 'Grey Wolves', 0, 0)
    const pell = summonCard(g, 1, 'Sir Pellinore', 2, 1)
    const hand = handOf(g, 1)
    act(g, 0, { t: 'moveAttack', unitId: knight.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: pell.id } })
    settle(g)
    expect(handOf(g, 1)).toBe(hand + 1)
  })
})

describe('LOOP #51 — Stygian Archers make a Skeleton only for an enemy', () => {
  it('Backstab: the enemy Archers kill their own Skeleton — no new Skeleton', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const archers = summonCard(g, 1, 'Stygian Archers', 2, 2)
    const skel = summonCard(g, 1, 'Skeleton', 2, 2); skel.tapped = true
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Backstab', { targets: [archers.id, skel.id] })
    settle(g)
    expect(g.units[skel.id], 'the Skeleton died').toBeUndefined()
    expect(Object.values(g.units).filter((u) => u.name === 'Skeleton')).toHaveLength(0)
  })

  it('control: the enemy Archers killing MY tapped Skeleton make one', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const archers = summonCard(g, 1, 'Stygian Archers', 2, 2)
    const skel = summonCard(g, 0, 'Skeleton', 2, 2); skel.tapped = true
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Backstab', { targets: [archers.id, skel.id] })
    settle(g)
    expect(g.units[skel.id]).toBeUndefined()
    expect(Object.values(g.units).filter((u) => u.name === 'Skeleton' && u.controller === 1)).toHaveLength(1)
  })
})

describe('LOOP #52 — Thankless Squire enters with three Lances', () => {
  it('Lance, Lance, Lance → three Lance tokens', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 0, 1)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Thankless Squire', { at: { x: 0, y: 1 } })
    settle(g)
    const squire = Object.values(g.units).find((u) => u.name === 'Thankless Squire')!
    expect(squire.carrying.map((id) => g.artifacts[id]?.name)).toEqual(['Lance', 'Lance', 'Lance'])
  })
})

describe('LOOP #53 — The Empyrean always provides its mana', () => {
  it('no nearby Angel or Ward: 1 mana, no threshold', () => {
    const g = game()
    for (const s of Object.values(g.sites)) if (s.controller === 1) delete g.sites[s.id]
    placeSite(g, 1, 'Valley', 1, 2)
    placeSite(g, 1, 'The Empyrean', 2, 2)
    expect(sourceMana(g, 1)).toBe(2)
    expect(affinity(g, 1).air).toBe(0)
  })

  it('a Warded site I control nearby turns its threshold on', () => {
    const g = game()
    for (const s of Object.values(g.sites)) if (s.controller === 1) delete g.sites[s.id]
    const village = placeSite(g, 1, 'Blessed Village', 1, 2); village.ward = true
    placeSite(g, 1, 'The Empyrean', 2, 2)
    expect(sourceMana(g, 1)).toBe(2)
    expect(affinity(g, 1).air).toBe(1)
  })
})

describe('LOOP #54 — no intercept for a mover that died on arrival', () => {
  it('Bottomless Pit', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Bottomless Pit', 2, 1)
    summonCard(g, 1, 'Hellhounds', 2, 1)
    const mine = summonCard(g, 0, 'Hellhounds', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: mine.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    const seen: { kind: string; player: number; title: string }[] = []
    settle(g, seen)
    expect(g.units[mine.id]).toBeUndefined()
    expect(seen.map((p) => p.kind)).not.toContain('intercept')
  })

  it('killed by a Giant Shark on arrival', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Stream', 2, 1)
    placeSite(g, 1, 'Stream', 3, 1)
    summonCard(g, 1, 'Giant Shark', 3, 1)
    summonCard(g, 1, 'Hellhounds', 2, 1)
    const mine = summonCard(g, 0, 'Hellhounds', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: mine.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    const seen: { kind: string; player: number; title: string }[] = []
    settle(g, seen)
    expect(g.units[mine.id]).toBeUndefined()
    expect(seen.map((p) => p.kind)).not.toContain('intercept')
  })
})

describe('LOOP #55 — The Void banishes a minion without Voidwalk moving onto it', () => {
  it('Shield Maidens are banished', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'The Void', 2, 1)
    const maidens = summonCard(g, 0, 'Shield Maidens', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: maidens.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    settle(g)
    expect(g.units[maidens.id]).toBeUndefined()
    expect(g.players[0].banished).toContain(maidens.cardId)
  })
})

describe('LOOP #56 — The Wild Hunt gives Charge to enemy Spirits too', () => {
  it('a Sturmgeist summoned this turn next to an enemy Hunt has Charge and can attack', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const hunt = summonCard(g, 1, 'The Wild Hunt', 2, 1)
    const sturm = summonCard(g, 0, 'Sturmgeist', 2, 2); sturm.enteredTurn = g.turn
    expect(effKeywords(g, sturm).charge).toBe(true)
    act(g, 0, { t: 'moveAttack', unitId: sturm.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: hunt.id } })
  })
})

describe('LOOP #57 — Vindictive Nation charges for Warding a nearby allied site', () => {
  it('Consecrate on the Ruins next to an enemy Vindictive Nation: lose 1 life', () => {
    const g = game()
    placeSite(g, 1, 'Vindictive Nation', 2, 2)
    placeSite(g, 1, 'Ruins', 2, 1)
    const renatus = summonCard(g, 0, 'Renatus Trueblood', 2, 1)
    const av = avatarOf(g, 0); av.life = 20
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Consecrate', { targets: [renatus.id] })
    settle(g, [], (p) => (p.kind === 'yesNo' ? false : undefined))
    expect(av.life).toBe(19)
  })
})

describe("LOOP #58 — Wizard's Den discards only when attacked successfully", () => {
  it('Blasphemy damaging the Den asks for no discard', () => {
    const g = game()
    placeSite(g, 0, "Wizard's Den", 2, 2)
    summonCard(g, 0, 'Renatus Trueblood', 2, 2)
    const av = avatarOf(g, 0); av.life = 20
    waiveThreshold(g, 0)
    const hand = handOf(g, 0)
    castMagic(g, 0, 'Blasphemy')
    const seen: { kind: string; player: number; title: string }[] = []
    settle(g, seen)
    expect(av.life).toBe(19)
    expect(seen.some((p) => /Den is raided/.test(p.title))).toBe(false)
    expect(handOf(g, 0)).toBe(hand)
  })

  it('control: an undefended attack on the Den does', () => {
    const g = game()
    const den = placeSite(g, 1, "Wizard's Den", 2, 2)
    const atk = summonCard(g, 0, 'Bosk Troll', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: atk.id, path: [], attack: { site: den.id } })
    expect(g.prompts.some((p) => /Den is raided/.test(p.title)) || g.log.some((l: any) => /Den is raided|discard/i.test(l.msg))).toBe(true)
  })
})

describe('LOOP #59 — Wrath of the Sea floods only the sites next to the water it starts with', () => {
  it('the Village two squares from the Stream stays dry; its Leprechaun lives', () => {
    const g = game()
    placeSite(g, 0, 'Stream', 2, 0)
    placeSite(g, 1, 'Steppe', 2, 1)
    placeSite(g, 1, 'Rustic Village', 2, 2)
    const lep = summonCard(g, 1, 'Kettletop Leprechaun', 2, 2)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Wrath of the Sea')
    settle(g)
    expect(g.units[lep.id], 'the Leprechaun stays on a dry site').toBeTruthy()
    expect(lep.region).toBe('surface')
  })
})
