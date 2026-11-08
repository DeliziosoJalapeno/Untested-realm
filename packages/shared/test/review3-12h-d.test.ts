// Review 3, batch 12h-d: THEIRS_12H.md #37–#48 (comparison with another engine).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, act, actFail, answer, castMagic, waiveThreshold, defaultAnswer, injectToHand } from './helpers'
import { avatarOf, effAttack, type GameState } from '../src'
import '../src/cards/scripts/index'

function settle(g: GameState, seen: { kind: string; title: string }[] = [], pick?: (p: GameState['prompts'][number]) => any): void {
  for (let i = 0; i < 30 && g.prompts.length; i++) {
    const p = g.prompts[0]
    seen.push({ kind: p.kind, title: p.title })
    const c = pick?.(p)
    answer(g, c !== undefined ? c : defaultAnswer(p))
  }
}
function game(): GameState {
  const g = newGame(); keepBoth(g); g.turn = 5
  const a0 = avatarOf(g, 0); a0.x = 0; a0.y = 0
  const a1 = avatarOf(g, 1); a1.x = 4; a1.y = 3
  placeSite(g, 0, 'Rustic Village', 0, 0)
  placeSite(g, 1, 'Rustic Village', 4, 3)
  return g
}
const named = (g: GameState, name: string) => Object.values(g.units).filter((u) => u.name === name)

describe('12H #37 — Druid: Bruin can\'t be summoned onto Gnome Hollows', () => {
  it('the Druid taps and flips, but no Bruin enters the Hollows', () => {
    const g = game()
    const av = avatarOf(g, 0); av.name = 'Druid'; av.x = 2; av.y = 2
    placeSite(g, 0, 'Gnome Hollows', 2, 2)
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'bruin' })
    settle(g)
    expect(named(g, 'Bruin')).toHaveLength(0)
  })
})

describe('12H #38 — False Idol sees a tap made by an effect', () => {
  it('Infiltrate taps an enemy minion next to the Idol: a spell is drawn', () => {
    const g = game()
    placeSite(g, 0, 'Steppe', 2, 2)
    const mine = summonCard(g, 0, 'Grey Wolves', 2, 2)
    giveArtifact(g, mine, 'False Idol')
    const foe = summonCard(g, 1, 'Grey Wolves', 2, 2)
    waiveThreshold(g, 0)
    const hands = [g.players[0].hand.length, g.players[1].hand.length]
    castMagic(g, 0, 'Infiltrate', { targets: [foe.id] })
    settle(g)
    expect(foe.tapped).toBe(true)
    // the caster's hand: -1 cast +1 inject, then the Idol's spell (its opponent at the moment it tapped)
    expect(g.players[0].hand.length + g.players[1].hand.length).toBe(hands[0] + hands[1] + 1)
  })
})

describe('12H #39 — Flagellant heals after the whole damage event', () => {
  it('Flayer hits the Avatar and the Flagellant at once: back to 20', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 1)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 3)
    const av = avatarOf(g, 0); av.x = 2; av.y = 1; av.life = 20
    const flag = summonCard(g, 0, 'Flagellant', 2, 3); flag.tapped = true
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Flayer', { at: { x: 2, y: 2 } })
    settle(g)
    expect(flag.damage).toBe(1)
    expect(av.life).toBe(20)
  })
})

describe('12H #40 — Flame of the First Ones fires when its bearer dies on arrival', () => {
  it('Wind Sylph dies to the Briar Patch, the Flame still stops there', () => {
    const g = game()
    placeSite(g, 0, 'Valley', 2, 2)
    placeSite(g, 1, 'Briar Patch', 2, 1)
    const av = avatarOf(g, 0); av.life = 15
    const opp = avatarOf(g, 1); opp.life = 20
    const sylph = summonCard(g, 0, 'Wind Sylph', 2, 2)
    giveArtifact(g, sylph, 'Flame of the First Ones')
    act(g, 0, { t: 'moveAttack', unitId: sylph.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    settle(g)
    expect(g.units[sylph.id], 'the Sylph died').toBeUndefined()
    expect(av.life).toBe(16)
    expect(opp.life).toBe(19)
  })
})

describe('12H #41 — a Flaming Sword splash kills only after all strikes land', () => {
  it('(a) Squirming Mass does not grow before the strike back: it dies with the Revenant', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const mass = summonCard(g, 0, 'Squirming Mass', 2, 2)
    giveArtifact(g, mass, 'Flaming Sword')
    const troll = summonCard(g, 1, 'Bosk Troll', 2, 1)
    const rev = summonCard(g, 1, 'Revered Revenant', 2, 1); rev.ward = false
    act(g, 0, { t: 'moveAttack', unitId: mass.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: troll.id } })
    settle(g)
    expect(g.units[rev.id], 'the splash killed the Revenant').toBeUndefined()
    expect(g.units[mass.id], 'the Mass took 3 at power 1 and died').toBeUndefined()
  })

  it('(b) the Death Dealer\'s strike back is still doubled by its Mask', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; av.life = 20
    giveArtifact(g, av, 'Flaming Sword')
    const dd = summonCard(g, 1, 'Death Dealer', 2, 1)
    giveArtifact(g, dd, 'Mask of Mayhem')
    const before = effAttack(g, dd)
    act(g, 0, { t: 'moveAttack', unitId: av.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: dd.id } })
    settle(g)
    expect(g.units[dd.id]).toBeUndefined()
    expect(av.life).toBe(20 - 2 * before)
  })
})

describe('12H #42 — Geomancer replaces the Rubble he stands on', () => {
  it('his own square is adjacent', () => {
    const g = game()
    const av = avatarOf(g, 0); av.name = 'Geomancer'; av.x = 2; av.y = 0
    const rubble = placeSite(g, 0, 'Rustic Village', 2, 0); rubble.isRubble = true
    placeSite(g, 0, 'Boulevard of Bones', 1, 0)
    placeSite(g, 0, 'Wasteland', 2, 1)
    expect(g.players[0].atlas.length).toBeGreaterThan(0)
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'reclaim' })
    settle(g)
    const here = Object.values(g.sites).find((s) => s.x === 2 && s.y === 0)!
    expect(here.isRubble).toBeFalsy()
  })
})

describe('12H #43 — Giant Shark: a unit entering outside its body of water is not its prey', () => {
  it('Great Old One floods the realm from a cut-off Babbling Brook: the Shark stays put', () => {
    const g = game()
    placeSite(g, 0, 'Maelström', 0, 1)
    placeSite(g, 0, 'Wasteland', 1, 1)
    placeSite(g, 0, 'Babbling Brook', 2, 1)
    const av = avatarOf(g, 0); av.x = 2; av.y = 1
    const shark = summonCard(g, 0, 'Giant Shark', 0, 1)
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Great Old One', { at: { x: 2, y: 1 } })
    settle(g)
    expect(g.units[shark.id], 'the Shark lives').toBeTruthy()
    expect([shark.x, shark.y]).toEqual([0, 1])
  })
})

describe('12H #44 — Lucid Dreamers grant Voidwalk only to minions CAST to their void', () => {
  it('Gift of the Frog on the Dreamers: the Frog is banished, the spell is still drawn', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 1, 1)
    const dreamers = summonCard(g, 0, 'Lucid Dreamers', 2, 1, 'void'); dreamers.tapped = true
    waiveThreshold(g, 0)
    const hand = g.players[0].hand.length
    castMagic(g, 0, 'Gift of the Frog', { targets: [dreamers.id] })
    settle(g)
    expect(named(g, 'Frog')).toHaveLength(0)
    expect(g.players[0].hand.length).toBe(hand + 1)
  })
})

describe('12H #45 — Gnarled Wendigo: no discount without a sacrifice at its summoning location', () => {
  it('cast underground below the Lacuna Entity: full price, the Lacuna stays', () => {
    const g = game()
    placeSite(g, 0, 'Accursed Tower', 2, 2)
    placeSite(g, 1, 'Hellmouth', 2, 1)
    const av = avatarOf(g, 0); av.x = 2; av.y = 3
    placeSite(g, 0, 'Rustic Village', 2, 3)
    const lacuna = summonCard(g, 0, 'Lacuna Entity', 2, 2)
    const card = injectToHand(g, 0, 'Gnarled Wendigo')
    waiveThreshold(g, 0)
    g.players[0].mana = 6
    const r = (() => { try { act(g, 0, { t: 'castSpell', cardId: card, casterId: av.id, at: { x: 2, y: 2, region: 'underground' }, extra: { sacrifice: [lacuna.id] } }); return 'ok' } catch (e) { return String(e) } })()
    expect(r, 'the surface Lacuna is not at the underground summoning location').not.toBe('ok')
    expect(g.units[lacuna.id]).toBeTruthy()
  })
})

describe('12H #46 — Golgor banishes every qualifying minion together', () => {
  it('the Demon Hunter with a Pendragon Banner goes with the Crones', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Garden of Eden', 2, 1)
    const golgor = summonCard(g, 0, 'Golgor', 2, 2)
    const crones = summonCard(g, 1, 'Cauldron Crones', 2, 1)
    const hunter = summonCard(g, 0, 'Demon Hunter', 2, 1)
    giveArtifact(g, hunter, 'Pendragon Banner')
    act(g, 0, { t: 'activate', sourceId: golgor.id, ability: 'maw', targets: ['sq:2,1,surface'] })
    settle(g)
    expect(g.units[crones.id]).toBeUndefined()
    expect(g.units[hunter.id]).toBeUndefined()
  })
})

describe('12H #47 — Rasputin from the cemetery is a cast: (2) and (F)(F)', () => {
  function board(mana: number, fire: boolean) {
    const g = game()
    for (const s of Object.values(g.sites)) if (s.controller === 0) delete g.sites[s.id]
    placeSite(g, 0, fire ? 'Red Desert' : 'Steppe', 0, 0)
    placeSite(g, 0, fire ? 'Arid Desert' : 'Steppe', 1, 0)
    summonCard(g, 0, 'Skeleton', 1, 0)
    const cardId = `cras${g.nextId++}`
    ;(g.cards as any)[cardId] = { id: cardId, name: 'Grigori Rasputin', owner: 0 }
    g.players[0].cemetery.push(cardId)
    g.players[0].mana = mana
    return { g, cardId }
  }
  it('not offered with 0 mana and no fire threshold', () => {
    const { g, cardId } = board(0, false)
    actFail(g, 0, { t: 'activate', sourceId: avatarOf(g, 0).id, ability: `rasputin:${cardId}` })
  })
  it('with 2 mana and (F)(F) he is cast for 2', () => {
    const { g, cardId } = board(2, true)
    act(g, 0, { t: 'activate', sourceId: avatarOf(g, 0).id, ability: `rasputin:${cardId}` })
    settle(g)
    expect(named(g, 'Grigori Rasputin')).toHaveLength(1)
    expect(g.players[0].mana).toBe(0)
  })
})

describe('12H #48 — Harassing Ruffians\' attack on a SITE can be defended', () => {
  it('the Balor is offered as a defender', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const river = placeSite(g, 1, 'River of Flame', 2, 1)
    summonCard(g, 1, 'Balor of the Evil Eye', 2, 1)
    const ruff = summonCard(g, 0, 'Harassing Ruffians', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: ruff.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { site: river.id } })
    expect(g.prompts[0]?.kind).toBe('defend')
  })

  it('control: their attack on a unit still can\'t be defended', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'River of Flame', 2, 1)
    summonCard(g, 1, 'Balor of the Evil Eye', 2, 1)
    const pudge = summonCard(g, 1, 'Pudge Butcher', 2, 1); pudge.tapped = true
    const ruff = summonCard(g, 0, 'Harassing Ruffians', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: ruff.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: pudge.id } })
    expect(g.prompts.some((p) => p.kind === 'defend')).toBe(false)
  })
})
