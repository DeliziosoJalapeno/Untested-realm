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
  it('in HAND, gains Moon Clan Werewolf\'s "sacrifice a Mortal -> summon me" ability', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const wolf = summonCard(g, 0, 'Moon Clan Werewolf', 3, 3)
    wolf.modifiers.push(SPELLCASTER(g.turn))
    const vcard = `cv${g.nextId++}`; g.cards[vcard] = { id: vcard, name: 'Vivien the Enchantress', owner: 0 } as any
    g.players[0].hand.push(vcard)
    const avatar = g.units[g.players[0].avatarUnitId]
    const abils = grantedAbilities(g, avatar)
    expect(abils.some((a) => /Moon Clan Werewolf/.test(a.label)), 'the Werewolf hand ability is offered on Vivien-in-hand').toBe(true)
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

describe('Vivien ACTIVATES abilities from the cemetery only when they need no realm position', () => {
  const avatarOf0 = (g: GameState) => g.units[g.players[0].avatarUnitId]
  function cemVivien(g: GameState) {
    const vcard = `cv${g.nextId++}`; g.cards[vcard] = { id: vcard, name: 'Vivien the Enchantress', owner: 0 } as any
    g.players[0].cemetery.push(vcard); return vcard
  }

  it('offers a Savior-Spellcaster ward (location-independent) from the cemetery', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const s = summonCard(g, 0, 'Savior', 3, 3); s.modifiers.push(SPELLCASTER(g.turn))
    cemVivien(g)
    const abils = grantedAbilities(g, avatarOf0(g))
    expect(abils.some((a) => /Savior/.test(a.label)), "Savior's ward is usable from the cemetery").toBe(true)
  })

  it('does NOT offer a Necromancer-Spellcaster "summon a Skeleton here" (needs a realm square)', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const n = summonCard(g, 0, 'Necromancer', 3, 3); n.modifiers.push(SPELLCASTER(g.turn))
    cemVivien(g)
    const abils = grantedAbilities(g, avatarOf0(g))
    expect(abils.some((a) => /Necromancer/.test(a.label)), 'a here-summon can NOT be used from the cemetery').toBe(false)
  })

  it('fires a Seer-Spellcaster start-of-turn deck peek from the cemetery', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const seer = summonCard(g, 0, 'Seer', 3, 3); seer.modifiers.push(SPELLCASTER(g.turn))
    const vcard = cemVivien(g)
    getScript('Vivien the Enchantress')!.startOfTurn!(makeCtx(g, vcard, 0, []))
    expect(g.prompts[0]?.title, "Vivien performs the Seer's gaze from the grave").toMatch(/Seer/i)
  })

  it('does NOT forward the Enchantress\'s board-only trigger from the cemetery', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const e = summonCard(g, 0, 'Enchantress', 3, 3); e.modifiers.push(SPELLCASTER(g.turn))
    // an aura on the board for Enchantress to (try to) animate
    g.auras['ar1'] = { id: 'ar1', cardId: 'car1', name: 'Blizzard', controller: 0, squares: [{ x: 3, y: 3 }] } as any
    g.cards['car1'] = { id: 'car1', name: 'Blizzard', owner: 0 } as any
    const vcard = cemVivien(g)
    // Vivien-in-cemetery's onSpellCast forwarding must NOT run the Enchantress (not listensFromCemetery)
    ;(getScript('Vivien the Enchantress')!.onSpellCast as any)(makeCtx(g, vcard, 0, []), 0, 'Fireball', undefined, [])
    expect(g.prompts[0], 'no animate-an-aura prompt — that needs Vivien in the realm').toBeUndefined()
  })
})

describe('cemetery-usable abilities are Vivien-only, and cover more than the examples', () => {
  const avatarOf0 = (g: GameState) => g.units[g.players[0].avatarUnitId]

  it('Vivien-in-cemetery inherits a realm Merlin-Spellcaster\'s deck-peek (foresee)', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 3, 3)
    const m = summonCard(g, 0, 'Merlin', 3, 3); m.modifiers.push(SPELLCASTER(g.turn))
    const vc = `cv${g.nextId++}`; g.cards[vc] = { id: vc, name: 'Vivien the Enchantress', owner: 0 } as any
    g.players[0].cemetery.push(vc)
    const abils = grantedAbilities(g, avatarOf0(g))
    expect(abils.some((a) => /Merlin/.test(a.label)), "Merlin's foresee is offered on a cemetery Vivien").toBe(true)
  })

  it('but an ORDINARY dead card does NOT offer its usable-from-cemetery ability (only Vivien copies it)', () => {
    const g: GameState = newGame(); keepBoth(g)
    // a dead Archimago (its 'echo' ability is flagged usableFromCemetery) sitting in the cemetery
    const ac = `ca${g.nextId++}`; g.cards[ac] = { id: ac, name: 'Archimago', owner: 0 } as any
    g.players[0].cemetery.push(ac)
    const abils = grantedAbilities(g, avatarOf0(g))
    expect(abils.some((a) => /Archimago/.test(a.label)), 'a plain dead Archimago must NOT offer echo from its own grave').toBe(false)
  })
})
