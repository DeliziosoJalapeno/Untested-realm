// Review 3, batch 12h-h: Magellan follow-up (12H #59 extras) + THEIRS_12H.md #85–#96.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, act, actFail, answer, castMagic, waiveThreshold, defaultAnswer, fillSites } from './helpers'
import { applyAction, avatarOf, checkStateBased, isDisabled, legalStepsFrom, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

function settle(g: GameState, seen: { kind: string; title: string; player: number }[] = [], pick?: (p: GameState['prompts'][number]) => any): void {
  for (let i = 0; i < 40 && g.prompts.length; i++) {
    const p = g.prompts[0]
    seen.push({ kind: p.kind, title: p.title, player: p.player })
    const c = pick?.(p)
    answer(g, c !== undefined ? c : defaultAnswer(p))
  }
}
function game(first: PlayerId = 0): GameState {
  const g = newGame(42, first); keepBoth(g); g.turn = 5
  const a0 = avatarOf(g, 0); a0.x = 0; a0.y = 3
  const a1 = avatarOf(g, 1); a1.x = 4; a1.y = 0
  placeSite(g, 0, 'Rustic Village', 0, 3)
  placeSite(g, 1, 'Rustic Village', 4, 0)
  return g
}
const stepKeys = (g: GameState, u: any) => legalStepsFrom(g, u, { x: u.x, y: u.y, region: u.region }).map((s) => `${s.x},${s.y},${s.region}`)

describe('12H #59 follow-up — Magellan / top-bottom wraps for Voidwalk', () => {
  it('Dormant Monstrosity in a corner void steps into the void across the joined edge', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 1, 1)
    const holder = summonCard(g, 0, 'Bosk Troll', 1, 1); giveArtifact(g, holder, 'Magellan Globe')
    const mon = summonCard(g, 0, 'Dormant Monstrosity', 0, 1, 'void')
    expect(stepKeys(g, mon)).toContain('4,1,void')
  })

  it('Ruler of Thul: a Voidwalk ally on the top row may step into the bottom-row void of its column', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 3)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    summonCard(g, 0, 'Ruler of Thul', 3, 3)
    const walker = summonCard(g, 0, 'Forsaken', 2, 3) // Voidwalk
    expect(stepKeys(g, walker)).toContain('2,0,void')
  })

  it('Ruler of Thul: from the void, onto the site across the edge', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 0)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    summonCard(g, 0, 'Ruler of Thul', 3, 3)
    const walker = summonCard(g, 0, 'Forsaken', 2, 3, 'void')
    expect(stepKeys(g, walker)).toContain('2,0,surface')
  })

  it('control: a non-Voidwalk ally is not offered the void across the edge', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 3)
    summonCard(g, 0, 'Ruler of Thul', 2, 3)
    const troll = summonCard(g, 0, 'Bosk Troll', 2, 3)
    expect(stepKeys(g, troll)).not.toContain('2,0,void')
  })
})

describe('12H #85 — Sir Lancelot untaps after his first fight, defending and never struck', () => {
  it('defends, kills the attacker first, untaps', () => {
    const g = game(1)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const lance = summonCard(g, 0, 'Sir Lancelot', 2, 2)
    giveArtifact(g, lance, 'Rhongomyniad')
    const uni = summonCard(g, 0, 'Autumn Unicorn', 2, 2)
    const faith = summonCard(g, 1, 'Faith Incarnate', 2, 1)
    act(g, 1, { t: 'moveAttack', unitId: faith.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: uni.id } })
    settle(g, [], (p) => (p.kind === 'defend' ? [lance.id] : p.kind === 'stayInFight' ? false : undefined))
    expect(g.units[faith.id]).toBeUndefined()
    expect(lance.damage).toBe(0)
    expect(lance.tapped).toBe(false)
  })
})

describe('12H #86 — an older Hillock Basilisk disables a newer Sister Stefánia', () => {
  it('the Wolves stay disabled; Stefánia has no Ward', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const wolves = summonCard(g, 0, 'Grey Wolves', 2, 2)
    summonCard(g, 1, 'Hillock Basilisk', 2, 2)
    const stef = summonCard(g, 1, 'Sister Stefánia', 2, 2); stef.ward = true
    checkStateBased(g)
    expect(isDisabled(g, wolves), 'the Wolves stay disabled').toBe(true)
    expect(stef.ward).toBeFalsy()
  })

  it('Stefánia one-way (behind the Basilisk, out of its gaze) silences it and frees the Wolves', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 3)
    const wolves = summonCard(g, 0, 'Grey Wolves', 2, 2)
    summonCard(g, 1, 'Hillock Basilisk', 2, 2)
    summonCard(g, 1, 'Sister Stefánia', 2, 3)
    checkStateBased(g)
    expect(isDisabled(g, wolves)).toBe(false)
  })

  it('control: Stefánia older than the Basilisk silences it and frees the Wolves', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const wolves = summonCard(g, 0, 'Grey Wolves', 2, 2)
    const stef = summonCard(g, 1, 'Sister Stefánia', 2, 2); stef.ward = true
    summonCard(g, 1, 'Hillock Basilisk', 2, 2)
    checkStateBased(g)
    expect(isDisabled(g, wolves)).toBe(false)
  })
})

// REVERSED (owner ruling 2026-11-08, Codex Silenced): a flood GRANTED by another card survives the silence
// ("If a site is Flooded via Floodplain, The Flood, Great Old One, etc. and then is silenced, it will still be
// Flooded"); only a printed Flooded (Mismanaged Mortuary) is lost — silence.keeps-granted.test.ts.
describe('12H #87 — Smokestacks of Gnaak does NOT remove a granted Flooded', () => {
  it('Avatar of Water floods a Valley under the Smokestacks: still water, the Shark comes and fights', () => {
    const g = game()
    const av = avatarOf(g, 0); av.name = 'Avatar of Water'; av.x = 2; av.y = 1; av.life = 20
    placeSite(g, 0, 'Stream', 2, 1)
    placeSite(g, 0, 'Stream', 1, 1)
    const valley = placeSite(g, 0, 'Valley', 2, 2)
    placeSite(g, 1, 'Smokestacks of Gnaak', 3, 2)
    summonCard(g, 1, 'Giant Shark', 1, 1)
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'flood', targets: [valley.id] })
    settle(g, [], (p) => (p.kind === 'yesNo' ? true : undefined))
    expect([av.x, av.y]).toEqual([2, 2])
    expect(valley.flooded).toBe(true)
    expect(av.life, 'the Giant Shark (5) moved in and fought').toBe(15)
  })
})

describe('12H #88 — Smokestacks silencing Vindictive Nation and a nearby allied site: 1 life each', () => {
  it('lose 2', () => {
    const g = game()
    const av = avatarOf(g, 0); av.x = 2; av.y = 1; av.life = 20
    for (const y of [0, 1, 2]) placeSite(g, 0, 'Steppe', 2, y)
    placeSite(g, 1, 'Vindictive Nation', 3, 3)
    placeSite(g, 1, 'Glastonbury Tor', 2, 3)
    const card = (() => { const id = `ctest${g.nextId++}`; g.cards[id] = { id, name: 'Smokestacks of Gnaak', owner: 0 } as any; g.players[0].hand.push(id); return id })()
    act(g, 0, { t: 'avatarSite', mode: 'play', cardId: card, x: 3, y: 2 })
    settle(g)
    expect(av.life).toBe(18)
  })
})

describe('12H #89 — Sneak Thief can\'t target itself', () => {
  it('alone: the steal can\'t be used', () => {
    const g = game()
    placeSite(g, 0, 'Wasteland', 2, 2)
    const thief = summonCard(g, 0, 'Sneak Thief', 2, 2)
    actFail(g, 0, { t: 'activate', sourceId: thief.id, ability: 'steal', targets: [thief.id] })
    expect(thief.tapped).toBe(false)
  })
})

describe('12H #90 — Sylvan Splendor is dispelled by a 0-power attack on an undefended site', () => {
  it('a Frog strikes the enemy site for 0: the aura is dispelled', () => {
    const g = game()
    const target = placeSite(g, 1, 'The Manor at Daperyll Hill', 2, 1)
    placeSite(g, 0, 'Kelp Cavern', 2, 2)
    g.cards.css = { id: 'css', name: 'Sylvan Splendor', owner: 0 } as any
    g.auras.ass = { id: 'ass', cardId: 'css', name: 'Sylvan Splendor', controller: 0, owner: 0, squares: [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }, { x: 3, y: 2 }], anchor: { x: 2, y: 1 } } as any
    const frog = summonCard(g, 0, 'Frog', 2, 1)
    act(g, 0, { t: 'moveAttack', unitId: frog.id, path: [], attack: { site: target.id } })
    settle(g)
    expect(g.auras.ass).toBeUndefined()
  })
})

describe('12H #91 — Temple of Moloch sacrifices a silenced minion', () => {
  it('the Troll next to an enemy Stefánia is sacrificed for (2)', () => {
    const g = game()
    const temple = placeSite(g, 0, 'Temple of Moloch', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const troll = summonCard(g, 0, 'Bosk Troll', 2, 2)
    summonCard(g, 1, 'Sister Stefánia', 2, 1)
    checkStateBased(g)
    expect(troll.silenced).toBe(true)
    g.players[0].mana = 0
    act(g, 0, { t: 'activate', sourceId: troll.id, ability: 'moloch:offer' })
    settle(g)
    expect(g.units[troll.id]).toBeUndefined()
    expect(g.players[0].mana).toBe(2)
    void temple
  })
})

describe('12H #92 — a Phantasmal Shade destroyed for being struck still strikes as a living unit', () => {
  it('The Faerie Queene takes nothing from the 4-power Shade', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const queene = summonCard(g, 0, 'The Faerie Queene', 2, 2)
    const shade = summonCard(g, 1, 'Phantasmal Shade', 2, 1)
    act(g, 0, { t: 'moveAttack', unitId: queene.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: shade.id } })
    settle(g)
    expect(g.units[shade.id]).toBeUndefined()
    expect(g.units[queene.id]?.damage).toBe(0)
  })

  it('a Golden Harp next to the Shade caps its strike at 2', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    placeSite(g, 1, 'Rustic Village', 2, 0)
    const dread = summonCard(g, 0, 'Dreadwing', 2, 2)
    const shade = summonCard(g, 1, 'Phantasmal Shade', 2, 1)
    const skel = summonCard(g, 1, 'Skeleton', 2, 0)
    giveArtifact(g, skel, 'Golden Harp')
    act(g, 0, { t: 'moveAttack', unitId: dread.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: shade.id } })
    settle(g)
    expect(g.units[shade.id]).toBeUndefined()
    expect(g.units[dread.id]?.damage).toBe(2)
  })
})

describe('12H #93 — The Great Drowning destroys every affected site before anything drowns', () => {
  it("Bladderblimp's Deathrite finds the enemy front site already Rubble", () => {
    const g = game()
    const a0 = avatarOf(g, 0); a0.x = 1; a0.y = 0; a0.life = 20
    const a1 = avatarOf(g, 1); a1.x = 1; a1.y = 3; a1.life = 20
    placeSite(g, 0, 'Steppe', 1, 0)
    placeSite(g, 0, 'Steppe', 1, 1)
    placeSite(g, 1, 'Steppe', 1, 2)
    placeSite(g, 1, 'Steppe', 1, 3)
    summonCard(g, 0, 'Bladderblimp', 1, 1)
    g.cards.cgd = { id: 'cgd', name: 'The Great Drowning of Men', owner: 1 } as any
    g.auras.agd = { id: 'agd', cardId: 'cgd', name: 'The Great Drowning of Men', controller: 1, owner: 1, squares: [{ x: 1, y: 1 }, { x: 1, y: 2 }] } as any
    act(g, 0, { t: 'endTurn' })
    settle(g)
    expect(a0.life, 'I lose 1 for my back Steppe').toBe(19)
    expect(a1.life, 'their front Steppe is Rubble by then').toBe(20)
  })
})

describe('12H #94 — The Great Famine stays when the killed minion\'s Deathrite asks a question', () => {
  it('the Sacred Stag dies; the Famine is not dispelled', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    summonCard(g, 0, 'Sacred Stag', 2, 2)
    g.cards.cgf = { id: 'cgf', name: 'The Great Famine', owner: 0 } as any
    g.auras.agf = { id: 'agf', cardId: 'cgf', name: 'The Great Famine', controller: 0, owner: 0, squares: [{ x: 2, y: 2 }] } as any
    act(g, 0, { t: 'endTurn' })
    settle(g, [], (p) => (p.kind === 'yesNo' ? true : undefined))
    expect(Object.values(g.units).some((u) => u.name === 'Sacred Stag')).toBe(false)
    expect(g.auras.agf, 'the Famine stays').toBeTruthy()
  })
})

describe('12H #95 — The Green Knight\'s Deathrite strike is not optional', () => {
  it('the prompt offers no "strike nobody"', () => {
    const g = game()
    placeSite(g, 0, 'Temple of Moloch', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 1)
    const knight = summonCard(g, 0, 'The Green Knight', 2, 2)
    summonCard(g, 1, 'Sewer Rats', 3, 1)
    act(g, 0, { t: 'activate', sourceId: knight.id, ability: 'moloch:offer' })
    const p = g.prompts.find((q) => /Green Knight/.test(q.title))
    if (p) expect((p.data as any).upTo).toBe(false)
    settle(g, [], (q) => (q.kind === 'chooseTargets' && (q.data as any).upTo ? [] : undefined))
    expect(Object.values(g.units).some((u) => u.name === 'Sewer Rats')).toBe(false)
  })
})

describe('12H #96 — The Manor at Daperyll Hill: the Deathrite resolves before the heal', () => {
  it('at 20 life, killing Maiden, Mother, Crone ends at 20', () => {
    const g = newGame(); keepBoth(g)
    const p = g.activePlayer, q = (1 - p) as PlayerId
    fillSites(g, p)
    for (const s of Object.values(g.sites)) if (s.x === 2 && s.y === 2) delete g.sites[s.id]
    const manor = placeSite(g, p, 'The Manor at Daperyll Hill', 2, 2)
    for (const s of Object.values(g.sites)) if (s.controller === p && s.id !== manor.id) { s.name = 'Spire'; g.cards[s.cardId] = { ...g.cards[s.cardId], name: 'Spire' } as any }
    const mmc = summonCard(g, q, 'Maiden, Mother, Crone', 2, 2)
    const me = g.units[g.players[p].avatarUnitId]; me.life = 20
    const r = applyAction(g, p, { t: 'activate', sourceId: manor.id, ability: 'feast' })
    expect(r.ok).toBe(true)
    if (g.prompts.length) answer(g, [mmc.id])
    settle(g)
    expect(g.units[mmc.id]).toBeUndefined()
    expect(me.life).toBe(20)
  })
})

void castMagic; void waiveThreshold
