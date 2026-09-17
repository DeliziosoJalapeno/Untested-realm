// Vivien the Enchantress: "has the other printed abilities of all Avatars and Spellcasters in
// the realm." She is a Spellcaster ONLY while a real spellcaster is present (never an avatar,
// never another Vivien); with only element-locked spellcasters she inherits their elements. She
// copies activated abilities of avatars, spellcaster minions, and spellcaster artifacts (Omphaloi).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, giveMana, waiveThreshold, injectToHand } from './helpers'
import { canCast, effKeywords, getScript, makeCtx, avatarOf } from '../src'

const viv = (g: any) => summonCard(g, 0, 'Vivien the Enchantress', 1, 1)
const grantsAbilitiesOf = (g: any, id: string) =>
  (getScript('Vivien the Enchantress') as any).grantsAbilities(g, id, g.units[id]) as any[]
const grantsOf = (g: any, id: string) => grantsAbilitiesOf(g, id).map((a) => a.key)

function charOmphalos(g: any, x = 2, y = 0) {
  const artCard = `co${g.nextId++}`; g.cards[artCard] = { id: artCard, name: 'Char Omphalos', owner: 0 }
  const artId = `ao${g.nextId++}`
  g.artifacts[artId] = { id: artId, cardId: artCard, name: 'Char Omphalos', conjuredBy: 0, x, y, region: 'surface', tapped: false }
  return artId
}

describe('Vivien the Enchantress', () => {
  it('is NOT a spellcaster with no spellcaster in the realm', () => {
    const g: any = newGame(); keepBoth(g)
    const v = viv(g)
    expect(effKeywords(g, g.units[v.id]).spellcaster).toBeFalsy()
  })

  it('becomes an unrestricted spellcaster when a Spellcaster minion is present, and can cast', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const v = viv(g)
    summonCard(g, 0, 'Cauldron Crones', 2, 1) // a Spellcaster minion (unrestricted)
    expect(effKeywords(g, g.units[v.id]).spellcaster).toBe(true)
    expect(canCast(g, 0, injectToHand(g, 0, 'Fireball'), v.id).ok).toBe(true)
  })

  it('with only an element-locked spellcaster (Char Omphalos: Air/Fire) casts only those elements', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const v = viv(g)
    charOmphalos(g)
    const kw = effKeywords(g, g.units[v.id])
    expect(kw.spellcaster).toBe(true)
    expect([...(kw.spellcasterElements ?? [])].sort()).toEqual(['air', 'fire'])
    expect(canCast(g, 0, injectToHand(g, 0, 'Fireball'), v.id).ok, 'Fire — within its elements').toBe(true)
    expect(canCast(g, 0, injectToHand(g, 0, 'Drown'), v.id).ok, 'Water — off-element').toBe(false)
  })

  it('copies a Sorcerer avatar\'s drawSpell ability', () => {
    const g: any = newGame(); keepBoth(g)
    const av = g.units[g.players[0].avatarUnitId]; av.name = 'Sorcerer'; g.cards[av.cardId].name = 'Sorcerer'
    const v = viv(g)
    expect(grantsOf(g, v.id)).toContain('drawSpell')
  })

  it('draws HER OWN spell at end of turn from an Omphalos (locked to Vivien, she can cast it)', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const v = viv(g)
    charOmphalos(g)
    const fb = `csb${g.nextId++}`; g.cards[fb] = { id: fb, name: 'Fireball', owner: 0 }
    g.players[0].spellbook.unshift(fb) // known spell on top
    ;(getScript('Vivien the Enchantress') as any).endOfTurn(makeCtx(g, v.id, 0, []))
    expect(g.players[0].hand.includes(fb), 'Vivien drew the spell').toBe(true)
    const lock = (g.flow.lockedCards ?? []).find((l: any) => l.cardId === fb)
    expect(lock?.casterId, 'it is locked to VIVIEN (not the Omphalos)').toBe(v.id)
    expect(canCast(g, 0, fb, v.id).ok, 'only she may cast it, and she can').toBe(true)
  })

  it('gains the avatar\'s native "Tap → play or draw a site" (and it draws a site)', () => {
    const g: any = newGame(); keepBoth(g)
    const v = viv(g)
    const site = grantsAbilitiesOf(g, v.id).find((a: any) => a.key === 'vivienSite')
    expect(site, 'she has the native site action while an avatar is in play').toBeTruthy()
    g.players[0].hand = [] // no sites in hand → the only option is "draw a site"
    const atlasSite = `catl${g.nextId++}`; g.cards[atlasSite] = { id: atlasSite, name: 'Rustic Village', owner: 0 }
    g.players[0].atlas.unshift(atlasSite)
    site.effect(makeCtx(g, v.id, 0, []))
    expect(g.players[0].hand.includes(atlasSite), 'she drew a site from the atlas').toBe(true)
  })

  // Regression: Vivien copies her sources' TRIGGERED abilities too, not only activated ones and
  // turn-step draws. Reported: facing an Enchantress, with a (Crusade) aura on the field, casting
  // a spell did NOT offer to animate the aura — because Vivien had no onSpellCast forwarding.
  function injectAura(g: any, name: string, controller: number) {
    const cardId = `ac${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: controller }
    const id = `r${g.nextId++}`
    g.auras[id] = { id, cardId, name, controller, squares: [{ x: 2, y: 2 }], enteredTurn: 0 }
    return id
  }

  it('copies an Enchantress\'s "animate an aura when you cast" trigger (the reported bug)', () => {
    const g: any = newGame(); keepBoth(g)
    avatarOf(g, 1).name = 'Enchantress' // the opponent's avatar is an Enchantress
    const v = viv(g)                     // player 0 pilots Vivien
    const aura = injectAura(g, 'Crusade', 0) // player 0 controls a Crusade aura
    // player 0 casts a spell → emitEvent(onSpellCast) reaches Vivien; she forwards the copied
    // Enchantress trigger anchored on herself (controller 0), by = 0 → it fires.
    getScript('Vivien the Enchantress')!.onSpellCast!(makeCtx(g, v.id, 0, []), 0, 'Fireball', v.id, [])
    const p = g.prompts[0]
    expect(p?.kind, 'Vivien is offered the animate-aura prompt').toBe('chooseTargets')
    expect(p?.data?.kind).toBe('aura')
    expect(p!.data.candidates).toContain(aura)
  })

  it('does NOT animate on the OPPONENT\'s cast (the trigger is guarded to the caster)', () => {
    const g: any = newGame(); keepBoth(g)
    avatarOf(g, 1).name = 'Enchantress'
    const v = viv(g)
    injectAura(g, 'Crusade', 0)
    // the opponent (player 1) casts → by = 1, Vivien's controller = 0 → her copy must NOT fire
    getScript('Vivien the Enchantress')!.onSpellCast!(makeCtx(g, v.id, 0, []), 1, 'Fireball', v.id, [])
    expect(g.prompts.length, 'no animate prompt for Vivien on the enemy cast').toBe(0)
  })

  it('never copies another Vivien (no recursion / infinite loop)', () => {
    const g: any = newGame(); keepBoth(g)
    const v1 = viv(g)
    summonCard(g, 0, 'Vivien the Enchantress', 3, 1)
    expect(Array.isArray(grantsOf(g, v1.id))).toBe(true) // computes without looping
    expect(effKeywords(g, g.units[v1.id]).spellcaster, 'two Viviens alone are not spellcasters').toBeFalsy()
  })
})
