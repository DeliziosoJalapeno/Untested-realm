// Vivien has the OTHER PRINTED abilities of all realm Avatars/Spellcasters — every kind, wherever
// she is: Genesis, Deathrite, hand/cemetery/spellbook activated abilities, and cast-restrictions.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { effectSummonUnit, killUnit, makeCtx } from '../src/engine/effects'
import { grantedAbilities, validateSummonAt } from '../src'
import { getScript } from '../src/cards/scripts/registry'
import type { GameState, UnitState } from '../src'
import '../src/cards/scripts/index'

const SPELLCASTER = (turn: number) => ({ kind: 'keyword', keyword: 'spellcaster', duration: 'permanent', turn, sourcePlayer: 0 } as any)

function summonVivien(g: GameState, x: number, y: number): UnitState | null {
  const cid = `cv${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Vivien the Enchantress', owner: 0 } as any
  const uid = `uv${g.nextId++}`
  return effectSummonUnit(g, {
    id: uid, cardId: cid, name: 'Vivien the Enchantress', owner: 0, controller: 0, isAvatar: false,
    x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
    modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
  } as UnitState)
}

describe('Vivien copies GENESIS of realm Spellcasters', () => {
  it('entering with a Great-Old-One-Spellcaster in the realm floods the realm (its Genesis)', () => {
    const g: GameState = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const goo = summonCard(g, 0, 'Great Old One', 3, 3)
    goo.modifiers.push(SPELLCASTER(g.turn))
    summonVivien(g, 2, 2)
    expect(site.flooded, "Vivien's Genesis fired the Great Old One's deluge").toBe(true)
  })
})

describe('Vivien copies DEATHRITE of realm Spellcasters', () => {
  it('dying with a Nosferatu-Spellcaster re-forms HER underground (Nosferatu deathrite)', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0) // Nosferatu's reform spot (player 0: x=2,y=0), land
    placeSite(g, 0, 'Rustic Village', 4, 4)
    const nos = summonCard(g, 0, 'Nosferatu', 4, 4)
    nos.modifiers.push(SPELLCASTER(g.turn))
    const viv = summonVivien(g, 2, 0)!
    killUnit(g, viv.id)
    // Nosferatu's deathrite re-forms the dead body underground; with no Burrowing granted, Vivien
    // then dies there (exactly the card's implication) — so we assert the deathrite FIRED via its log.
    const msgs = g.log.map((l: any) => (typeof l === 'string' ? l : l.msg ?? ''))
    expect(msgs.some((m) => /seeps into the earth/i.test(m)), "Vivien performed Nosferatu's deathrite").toBe(true)
  })
})

describe('Vivien copies HAND / CEMETERY / SPELLBOOK abilities of realm Spellcasters', () => {
  it('in HAND, gains Sir Gareth\'s "reveal -> a Mortal becomes me" hand ability', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const gareth = summonCard(g, 0, 'Sir Gareth', 3, 3)
    gareth.modifiers.push(SPELLCASTER(g.turn))
    const vcard = `cv${g.nextId++}`; g.cards[vcard] = { id: vcard, name: 'Vivien the Enchantress', owner: 0 } as any
    g.players[0].hand.push(vcard)
    const avatar = g.units[g.players[0].avatarUnitId]
    const abils = grantedAbilities(g, avatar)
    expect(abils.some((a) => /Sir Gareth/.test(a.label)), 'the Sir Gareth hand ability is offered on Vivien-in-hand').toBe(true)
  })

  it('in the CEMETERY, gains Grigori Rasputin\'s "banish an Evil ally -> return me" ability', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const ras = summonCard(g, 0, 'Grigori Rasputin', 3, 3)
    ras.modifiers.push(SPELLCASTER(g.turn))
    const vcard = `cv${g.nextId++}`; g.cards[vcard] = { id: vcard, name: 'Vivien the Enchantress', owner: 0 } as any
    g.players[0].cemetery.push(vcard)
    const avatar = g.units[g.players[0].avatarUnitId]
    const abils = grantedAbilities(g, avatar)
    expect(abils.some((a) => /Grigori Rasputin/.test(a.label)), 'Rasputin cemetery ability offered on Vivien-in-cemetery').toBe(true)
  })

  it('in the SPELLBOOK, gains The Inquisition\'s reveal-summon ability', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const inq = summonCard(g, 0, 'The Inquisition', 3, 3)
    inq.modifiers.push(SPELLCASTER(g.turn))
    const vcard = `cv${g.nextId++}`; g.cards[vcard] = { id: vcard, name: 'Vivien the Enchantress', owner: 0 } as any
    g.players[0].spellbook.push(vcard)
    g.flow = { ...(g.flow ?? {}), revealedCards: [vcard] } as any // The Inquisition's ability needs the card revealed
    const avatar = g.units[g.players[0].avatarUnitId]
    const abils = grantedAbilities(g, avatar)
    expect(abils.some((a) => /The Inquisition/.test(a.label)), 'Inquisition spellbook ability offered on a revealed Vivien-in-spellbook').toBe(true)
  })
})

describe('Vivien copies CAST RESTRICTIONS of realm Spellcasters (Lugbog Cat)', () => {
  it('with a Lugbog-Cat-Spellcaster in the realm, Vivien may only be cast to a water site', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const cat = summonCard(g, 0, 'Lugbog Cat', 3, 3)
    cat.modifiers.push(SPELLCASTER(g.turn))
    const dry = placeSite(g, 0, 'Rustic Village', 1, 1)
    const wet = placeSite(g, 0, 'Rustic Village', 2, 2); (wet as any).flooded = true
    const filter = getScript('Vivien the Enchantress')!.summonFilter!
    expect(filter(g, 0, { x: dry.x, y: dry.y }), 'a dry site is refused').toMatch(/water/i)
    expect(filter(g, 0, { x: wet.x, y: wet.y }), 'a water site is allowed').toBeNull()
  })
})

describe("out of the realm, Vivien has ONLY her sources' hand/cemetery/spellbook abilities", () => {
  // "wherever she is" lets her keep abilities that work from that zone (Grigori Rasputin's, tested
  // above) — a realm ability (Savior's ward, Seer's peek, Merlin's foresee…) can't be used from there.
  const avatarOf0 = (g: GameState) => g.units[g.players[0].avatarUnitId]
  function cemVivien(g: GameState) {
    const vcard = `cv${g.nextId++}`; g.cards[vcard] = { id: vcard, name: 'Vivien the Enchantress', owner: 0 } as any
    g.players[0].cemetery.push(vcard); return vcard
  }
  const realmSource = (name: string) => () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const s = summonCard(g, 0, name, 3, 3); s.modifiers.push(SPELLCASTER(g.turn))
    cemVivien(g)
    const abils = grantedAbilities(g, avatarOf0(g))
    expect(abils.some((a) => a.label.includes(name)), `${name}'s realm ability is not usable by a dead Vivien`).toBe(false)
  }

  it("does NOT offer a Savior-Spellcaster's ward from the cemetery", realmSource('Savior'))
  it("does NOT offer a Merlin-Spellcaster's foresee from the cemetery", realmSource('Merlin'))
  it('does NOT offer a Necromancer-Spellcaster "summon a Skeleton here"', realmSource('Necromancer'))

  it("does NOT fire a Seer-Spellcaster's start-of-turn peek from the cemetery", () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const seer = summonCard(g, 0, 'Seer', 3, 3); seer.modifiers.push(SPELLCASTER(g.turn))
    const vcard = cemVivien(g)
    getScript('Vivien the Enchantress')!.startOfTurn!(makeCtx(g, vcard, 0, []))
    expect(g.prompts[0], 'no Seer peek from the grave').toBeUndefined()
  })

  it("does NOT forward the Enchantress's board trigger from the cemetery", () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const e = summonCard(g, 0, 'Enchantress', 3, 3); e.modifiers.push(SPELLCASTER(g.turn))
    // an aura on the board for Enchantress to (try to) animate
    g.auras['ar1'] = { id: 'ar1', cardId: 'car1', name: 'Blizzard', controller: 0, squares: [{ x: 3, y: 3 }] } as any
    g.cards['car1'] = { id: 'car1', name: 'Blizzard', owner: 0 } as any
    const vcard = cemVivien(g)
    ;(getScript('Vivien the Enchantress')!.onSpellCast as any)(makeCtx(g, vcard, 0, []), 0, 'Fireball', undefined, [])
    expect(g.prompts[0], 'no animate-an-aura prompt — that needs Vivien in the realm').toBeUndefined()
  })

  it('a plain dead card offers no realm ability from its grave either', () => {
    const g: GameState = newGame(); keepBoth(g)
    const ac = `ca${g.nextId++}`; g.cards[ac] = { id: ac, name: 'Archimago', owner: 0 } as any
    g.players[0].cemetery.push(ac)
    const abils = grantedAbilities(g, avatarOf0(g))
    expect(abils.some((a) => /Archimago/.test(a.label))).toBe(false)
  })
})
