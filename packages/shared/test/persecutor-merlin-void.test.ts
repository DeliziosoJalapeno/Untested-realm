import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, act, answer, castMagic, castMagicFail, waiveThreshold } from './helpers'
import { isEvilUnit, isEvilUnitIntrinsic, effSubtypes, effKeywords, wardUnit, checkStateBased, makeCtx, getScript, applyJudge, avatarOf, type GameState } from '../src'
import { effectiveCost, resolveCaster } from '../src/engine/casting'

describe('Persecutor brand — treated as Evil, but not REAL Evil', () => {
  it('a branded minion counts as Evil for targeting, but keeps its Ward and is not a Monster', () => {
    const g = newGame(); keepBoth(g)
    // Sister Stefánia PRINTS Ward — so "Evil can't be warded" (statics effKeywords strip) actually applies
    // to her. A non-evil enemy branded by Persecutor must keep that Ward.
    const foe = summonCard(g, 1, 'Sister Stefánia', 3, 2) // non-evil (Mortal), printed Ward
    wardUnit(g, foe)
    expect(effKeywords(g, foe).ward, 'warded before branding').toBe(true)
    g.flow = g.flow ?? {}; (g.flow as any).branded = { unitId: foe.id, by: 0, turn: g.turn }
    checkStateBased(g)
    expect(isEvilUnit(g, foe), 'branded → treated as Evil (targetable by Evil-targeting cards)').toBe(true)
    expect(isEvilUnitIntrinsic(g, foe), 'but it is NOT real Evil').toBe(false)
    // the EFFECTIVE ward is what "Evil can't be warded" strips (statics effKeywords) — it must survive
    expect(effKeywords(g, foe).ward, 'the brand does NOT break its (effective) Ward').toBe(true)
    expect(g.units[foe.id]?.ward, 'and the ward token is intact').toBe(true)
    expect(effSubtypes(g, foe).includes('Monster'), 'the brand does NOT make it a Monster').toBe(false)
  })

  it('the brand expires at end of the branding turn', () => {
    const g = newGame(); keepBoth(g)
    const foe = summonCard(g, 1, 'Apprentice Wizard', 3, 2)
    g.flow = g.flow ?? {}; (g.flow as any).branded = { unitId: foe.id, by: 0, turn: g.turn }
    expect(isEvilUnit(g, foe)).toBe(true)
    g.turn++ // a later turn
    expect(isEvilUnit(g, foe), 'brand is gone the next turn').toBe(false)
  })

  it("the real Persecutor ability brands the chosen enemy (end-to-end)", () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.name = 'Persecutor'
    const foeA = summonCard(g, 1, 'Apprentice Wizard', 3, 2)
    summonCard(g, 1, 'Apprentice Wizard', 4, 2) // a 2nd enemy so the brand prompt actually offers a choice
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'zeal' } as any)
    answer(g, 'brands an enemy as Evil')
    answer(g, [foeA.id])
    expect((g.flow as any)?.branded?.unitId, 'the chosen enemy is branded').toBe(foeA.id)
    expect(isEvilUnit(g, foeA), 'and is now Evil for your cards').toBe(true)
    expect(isEvilUnitIntrinsic(g, foeA), 'without being really Evil').toBe(false)
  })

  it("deferUse: the once-per-turn use is spent only when the brand actually COMMITS", () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); av.name = 'Persecutor'
    const foeA = summonCard(g, 1, 'Apprentice Wizard', 3, 2)
    summonCard(g, 1, 'Apprentice Wizard', 4, 2) // 2nd enemy so the brand prompt is a real choice
    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'zeal' } as any)
    expect(av.usedThisTurn.zeal, 'not spent at activation (you can still back out)').not.toBe(1)
    answer(g, 'brands an enemy as Evil')
    expect(av.usedThisTurn.zeal, 'still not spent while choosing the enemy').not.toBe(1)
    answer(g, [foeA.id])
    expect(av.usedThisTurn.zeal, 'spent once the brand commits').toBe(1)
  })

  it('an Evil-targeting card (Begone!) can banish a branded enemy — but NOT before the brand', () => {
    const g = newGame(); keepBoth(g)
    waiveThreshold(g, 0)
    const foe = summonCard(g, 1, 'Apprentice Wizard', 3, 2) // non-evil
    // before branding: not a legal "Evil minion" target → the cast is rejected
    const err = castMagicFail(g, 0, 'Begone!', { targets: [foe.id] })
    expect(err, 'Begone! cannot target a non-Evil minion').toBeTruthy()
    expect(g.units[foe.id], 'it survives').toBeTruthy()
    // brand it, then Begone! banishes it
    g.flow = g.flow ?? {}; (g.flow as any).branded = { unitId: foe.id, by: 0, turn: g.turn }
    castMagic(g, 0, 'Begone!', { targets: [foe.id] })
    expect(g.units[foe.id], 'branded → a legal Evil target → banished').toBeUndefined()
  })

  it('branding a WARDED minion does NOT strip its ward (branding is not real Evil)', () => {
    const g = newGame(); keepBoth(g)
    const foe = summonCard(g, 1, 'Sister Stefánia', 3, 2); wardUnit(g, foe) // printed Ward, non-evil
    expect(effKeywords(g, foe).ward, 'warded to start').toBe(true)
    g.flow = g.flow ?? {}; (g.flow as any).branded = { unitId: foe.id, by: 0, turn: g.turn }
    checkStateBased(g) // the "Evil can't be warded" state-based strip runs here
    expect(effKeywords(g, foe).ward, 'the brand did NOT strip the (effective) ward').toBe(true)
    expect(g.units[foe.id]?.ward, 'ward token intact').toBe(true)
    expect(isEvilUnit(g, foe), 'yet it is still targetable as Evil').toBe(true)
    expect(isEvilUnitIntrinsic(g, foe), 'because it is not really Evil').toBe(false)
  })
})

describe("Evil minions can't be warded (wardUnit refuses — printed OR Corruptor-made Evil)", () => {
  it('cannot ward a real (printed) Evil minion', () => {
    const g = newGame(); keepBoth(g)
    const evil = summonCard(g, 1, 'Stygian Archers', 3, 2) // Undead = intrinsically Evil
    expect(wardUnit(g, evil), 'warding a real Evil minion is refused').toBe(false)
    expect(evil.ward, 'it gains no ward').toBeFalsy()
  })

  it('cannot ward a Mortal that a Corruptor has made Evil (non-printed-Evil)', () => {
    const g = newGame(); keepBoth(g)
    const mortal = summonCard(g, 0, 'Kite Archer', 2, 2) // Mortal
    avatarOf(g, 0).name = 'Corruptor' // "your Mortals are Undead" → really Evil now
    expect(isEvilUnitIntrinsic(g, mortal), 'the Corruptor makes it really Evil').toBe(true)
    expect(wardUnit(g, mortal), 'so warding it is refused').toBe(false)
    expect(mortal.ward, 'it gains no ward').toBeFalsy()
  })

  it('CAN still ward a plain non-Evil Mortal', () => {
    const g = newGame(); keepBoth(g)
    const mortal = summonCard(g, 0, 'Kite Archer', 2, 2)
    expect(wardUnit(g, mortal), 'a non-Evil minion wards fine').toBe(true)
    expect(mortal.ward).toBe(true)
  })

  it('a minion that BECOMES Evil immediately loses its ward (enemy warded Foot Soldier grabbed by King of the Realm under your Corruptor)', () => {
    const g = newGame(); keepBoth(g)
    avatarOf(g, 0).name = 'Corruptor' // "your Mortals are Undead"
    // the enemy's Foot Soldier is a Mortal — wardable while it's theirs (no Corruptor on them)
    const fs = summonCard(g, 1, 'Foot Soldier', 2, 2); fs.enteredTurn = 0
    expect(wardUnit(g, fs), 'the enemy can ward their non-Evil Mortal').toBe(true)
    checkStateBased(g)
    // a GRANTED ward is the raw token (checkWard reads it); Foot Soldier prints no Ward keyword
    expect(fs.ward, 'it is warded while under the enemy').toBe(true)
    // you summon King of the Realm — "you control all Mortals" → the Foot Soldier becomes YOURS, and
    // your Corruptor makes your Mortals Undead → it is now really Evil → it loses its ward.
    const king = summonCard(g, 0, 'King of the Realm', 1, 1); king.enteredTurn = 0
    getScript('King of the Realm')!.genesis!(makeCtx(g, king.id, 0, [])) // its "control all Mortals" claim
    checkStateBased(g)
    expect(fs.controller, 'King of the Realm took control of the Mortal').toBe(0)
    expect(isEvilUnitIntrinsic(g, fs), 'your Mortal is now Undead via the Corruptor').toBe(true)
    expect(fs.ward, 'so it immediately loses its ward').toBeFalsy()
  })
})

describe("Merlin's Tower — the 3-off discount applies to MAGIC only", () => {
  function tower(g: GameState) {
    (g.flow as any) = g.flow ?? {}; (g.flow as any).judgeThresh = { 0: { air: 5, earth: 5, fire: 5, water: 5 } }
    g.players[0].mana = 20
    applyJudge(g, 0, { k: 'placeSite', name: "Merlin's Tower", player: 0, x: 2, y: 0 })
    const t = Object.values(g.sites).find((s) => s.name === "Merlin's Tower")!
    getScript("Merlin's Tower")!.genesis!(makeCtx(g, t.id, 0, []) as any)
    return resolveCaster(g, t.id, 0)!
  }
  it('discounts a Magic cast through the tower', () => {
    const g = newGame(); keepBoth(g)
    const caster = tower(g)
    const base = effectiveCost(g, 0, 'Lightning Bolt', g.units[g.players[0].avatarUnitId]!, undefined)
    const via = effectiveCost(g, 0, 'Lightning Bolt', caster, undefined)
    expect(via, 'a Magic gets 3 off through the tower').toBe(Math.max(0, base - 3))
    expect(via).toBeLessThan(base)
  })
  it('does NOT discount a Minion cast through the tower', () => {
    const g = newGame(); keepBoth(g)
    const caster = tower(g)
    const base = effectiveCost(g, 0, 'Bone Jumble', g.units[g.players[0].avatarUnitId]!, undefined)
    const via = effectiveCost(g, 0, 'Bone Jumble', caster, undefined)
    expect(via, 'a Minion is NOT discounted — "its next MAGIC costs 3 less"').toBe(base)
  })
})

describe('Artifacts in the void rise onto a site placed under them', () => {
  it('a ground artifact in the void becomes surface once a site appears beneath it', () => {
    const g = newGame(); keepBoth(g)
    ;(g.cards as any).cav = { id: 'cav', name: 'Grim Guisarme', owner: 0 }
    ;(g.artifacts as any).av = { id: 'av', cardId: 'cav', name: 'Grim Guisarme', conjuredBy: 0, x: 2, y: 2, region: 'void', carriedBy: null, tapped: false }
    checkStateBased(g)
    expect(g.artifacts.av.region, 'stays in the void while the square is siteless').toBe('void')
    placeSite(g, 0, 'Rustic Village', 2, 2)
    checkStateBased(g)
    expect(g.artifacts.av.region, 'lifted onto the new site').toBe('surface')
  })
})
