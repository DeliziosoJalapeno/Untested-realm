// Batch-3 secret achievements — the diff detector (applyAchievements) for board/state feats, and the
// direct awardAchievement path for card-script feats (Common Sense tiers, whip on the King).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { applyAchievements, applyJudge, type GameState, type PlayerId } from '../src'
import { makeCtx, dealDamageToUnit } from '../src/engine/effects'
import { getScript } from '../src/cards/scripts/registry'

const clone = (g: GameState): GameState => JSON.parse(JSON.stringify(g))
const has = (g: GameState, id: string, seat: number) => (g.flow?.achievements ?? []).some((u: any) => u.id === id && u.seat === seat)
const av = (g: GameState, seat: PlayerId) => g.units[g.players[seat].avatarUnitId]

describe('batch 3 — diff-detected achievements', () => {
  it('true-elementalist: 4+ threshold of every element', () => {
    const g = newGame(); keepBoth(g)
    const prev = clone(g)
    g.flow = g.flow ?? {}
    ;(g.flow as any).judgeThresh = { 0: { air: 4, earth: 4, fire: 4, water: 4 } }
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    expect(has(g, 'true-elementalist', 0)).toBe(true)
    expect(has(g, 'true-elementalist', 1)).toBe(false)
  })

  it('mass-desertion: take control of >3 enemy minions at once', () => {
    const g = newGame(); keepBoth(g)
    for (let i = 0; i < 4; i++) applyJudge(g, 1, { k: 'summonUnit', name: 'Bone Jumble', player: 1, x: i, y: 3, region: 'surface', noGenesis: true })
    const mine = Object.values(g.units).filter((u) => u.name === 'Bone Jumble')
    const prev = clone(g)
    for (const u of mine) u.controller = 0 // owned by 1, now controlled by 0
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    expect(has(g, 'mass-desertion', 0)).toBe(true)
  })

  it('our-spellbook: a minion summoned from the opponent’s deck (owner=foe, controller=you)', () => {
    const g = newGame(); keepBoth(g)
    const prev = clone(g)
    const id = 'seduced1'
    g.cards[id] = { id, name: 'Bone Jumble', owner: 1 } as any
    g.units[id] = { id, cardId: id, name: 'Bone Jumble', owner: 1 as PlayerId, controller: 0 as PlayerId, isAvatar: false, x: 2, y: 2, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as any
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    expect(has(g, 'our-spellbook', 0)).toBe(true)
  })

  it('our-spellbook: casting a card OWNED by the opponent', () => {
    const g = newGame(); keepBoth(g)
    const id = 'oppcard1'
    g.cards[id] = { id, name: 'Lightning Bolt', owner: 1 } as any
    const prev = clone(g)
    applyAchievements(prev, g, 0, { t: 'castSpell', cardId: id, casterId: g.players[0].avatarUnitId, targets: [] } as any)
    expect(has(g, 'our-spellbook', 0)).toBe(true)
  })

  it('anime-betrayals: a betrayed minion attacks its own side’s Avatar', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 1, { k: 'summonUnit', name: 'Bone Jumble', player: 1, x: 2, y: 2, region: 'surface', noGenesis: true })
    const turncoat = Object.values(g.units).find((u) => u.name === 'Bone Jumble')!
    turncoat.controller = 0; turncoat.counters = { betrayed: 0 } // Betrayal marks this
    const prev = clone(g)
    const action = { t: 'moveAttack', unitId: turncoat.id, path: [], attack: { unit: g.players[1].avatarUnitId } } as any
    applyAchievements(prev, g, 0, action)
    expect(has(g, 'anime-betrayals', 0)).toBe(true)
  })

  it('hitting-yourself: reach death’s door on a Thaïs-piloted turn', () => {
    const g = newGame(); keepBoth(g)
    const prev = clone(g)
    g.flow = g.flow ?? {}
    ;(g.flow as any).thaisActive = 0 // seat 0 is being piloted by its opponent
    const a = av(g, 0); a.life = 0; a.deathsDoor = true
    applyAchievements(prev, g, 1, { t: 'endTurn' })
    expect(has(g, 'hitting-yourself', 0)).toBe(true)
  })

  it('nuclear-option: a single blast draws the game (both Avatars fall at once)', () => {
    const g = newGame(); keepBoth(g)
    const prev = clone(g)
    for (const s of [0, 1] as PlayerId[]) { const a = av(g, s); a.life = 0; a.deathsDoor = true }
    ;(g as any).draw = true; g.phase = 'over' // finalizeAvatarDeath declared the real draw
    ;(g.log ??= []).push({ player: 0, msg: 'Craterize erupts, incinerating both Avatars!' } as any)
    applyAchievements(prev, g, 0, { t: 'endTurn' })
    expect(has(g, 'nuclear-option', 0)).toBe(true)
    expect(has(g, 'nuclear-option', 1)).toBe(true)
  })
})

describe('simultaneous Avatar death is a DRAW (engine)', () => {
  it('both Avatars felled by one source → winner null, draw true, game over', () => {
    const g = newGame(); keepBoth(g)
    for (const s of [0, 1] as PlayerId[]) { const a = av(g, s); a.life = 0; a.deathsDoor = true; a.doorTurn = g.turn - 1 }
    const src = { player: 0 as PlayerId, kind: 'effect' as const, name: 'Craterize' }
    dealDamageToUnit(g as GameState, av(g, 0), 5, 0, { source: src }) // first blow — normally a win
    dealDamageToUnit(g as GameState, av(g, 1), 5, 1, { source: src }) // same source fells the "winner" too
    expect(g.winner).toBe(null)
    expect((g as any).draw).toBe(true)
    expect(g.phase).toBe('over')
  })

  it('a single Avatar death is still a normal win (not a draw)', () => {
    const g = newGame(); keepBoth(g)
    const a = av(g, 1); a.life = 0; a.deathsDoor = true; a.doorTurn = g.turn - 1
    dealDamageToUnit(g as GameState, a, 5, 0, { source: { player: 0, kind: 'effect' } })
    expect(g.winner).toBe(0)
    expect((g as any).draw).toBeFalsy()
  })
})

describe('batch 3 — script-awarded achievements', () => {
  it('kink-of-realm: a whip (Lash) used on the King of the Realm', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'summonUnit', name: 'King of the Realm', player: 1, x: 2, y: 2, region: 'surface', noGenesis: true })
    const king = Object.values(g.units).find((u) => u.name === 'King of the Realm')!
    const ctx = makeCtx(g as GameState, g.players[0].avatarUnitId, 0, [{ unit: king.id }])
    getScript('Lash')!.onCast!(ctx)
    expect(has(g, 'kink-of-realm', 0)).toBe(true)
  })

  it('exceptional/elite/unique sense: fetch Common Sense with Common Sense N times in a turn', () => {
    const g = newGame(); keepBoth(g)
    const p = g.players[0]
    for (let i = 0; i < 3; i++) { const id = `cs${i}`; g.cards[id] = { id, name: 'Common Sense', owner: 0 } as any; p.spellbook.unshift(id) }
    const cont = getScript('Common Sense')!.conts!.tutorPick
    const run = () => cont(makeCtx(g as GameState, p.avatarUnitId, 0, []), {}, 'Common Sense')
    run(); expect(has(g, 'exceptional-sense', 0)).toBe(true)
    run(); expect(has(g, 'elite-sense', 0)).toBe(true)
    run(); expect(has(g, 'unique-sense', 0)).toBe(true)
  })
})
