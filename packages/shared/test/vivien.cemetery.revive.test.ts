// "Vivien has the abilities of all Avatars and Spellcasters in the realm, WHEREVER SHE IS" — cemetery
// included. A realm Bone Rabble made a Spellcaster (e.g. by Wiccan Tools) grants "whenever you play
// an earth site, you may summon THIS from your cemetery to that site" — a self-reference. Vivien,
// sitting in the cemetery, copies it: playing an earth site offers to revive HER (as she were Bone
// Rabble). Also checks the self-name-means-this-card fix on Bone Rabble itself.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, answer } from './helpers'
import { emitEvent, killUnit } from '../src/engine/effects'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('Vivien is revived from the cemetery by a copied cemetery ability', () => {
  it('a realm Bone-Rabble-Spellcaster lets Vivien crawl up from the cemetery on an earth-site play', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const rabble = summonCard(g, 0, 'Bone Rabble', 2, 2)
    rabble.modifiers.push({ kind: 'keyword', keyword: 'spellcaster', duration: 'permanent', turn: g.turn, sourcePlayer: 0 } as any)
    // Vivien lies in player 0's cemetery
    const vcard = `cv${g.nextId++}`; g.cards[vcard] = { id: vcard, name: 'Vivien the Enchantress', owner: 0 } as any
    g.players[0].cemetery.push(vcard)

    // player 0 plays an EARTH site → the copied Bone Rabble ability fires for Vivien-in-cemetery
    const earth = placeSite(g, 0, 'Fertile Earth', 3, 3)
    emitEvent(g, 'onSitePlayed', 0, earth)

    const prompt = g.prompts[0]
    expect(prompt?.kind, 'a summon-from-cemetery offer appears').toBe('yesNo')
    expect(prompt!.title, 'it offers to revive VIVIEN, not literally Bone Rabble').toContain('Vivien')
    answer(g, true)

    expect(g.players[0].cemetery.includes(vcard), 'Vivien left the cemetery').toBe(false)
    const revived = Object.values(g.units).find((u) => u.name === 'Vivien the Enchantress')
    expect(revived, 'Vivien is now in the realm').toBeDefined()
    expect(revived!.x === 3 && revived!.y === 3, 'at the played earth site').toBe(true)
  })

  it('control: without a realm Spellcaster source, Vivien in the cemetery gets no such offer', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    summonCard(g, 0, 'Bone Rabble', 2, 2) // in play but NOT a spellcaster → not a Vivien source
    const vcard = `cv${g.nextId++}`; g.cards[vcard] = { id: vcard, name: 'Vivien the Enchantress', owner: 0 } as any
    g.players[0].cemetery.push(vcard)
    const earth = placeSite(g, 0, 'Fertile Earth', 3, 3)
    emitEvent(g, 'onSitePlayed', 0, earth)
    expect(g.prompts[0], 'no Spellcaster in the realm → nothing to copy').toBeUndefined()
  })

  it('a realm Scourge-Zombies-Spellcaster revives Vivien from the cemetery on an allied Mortal death (onAnyDeath)', () => {
    const g: GameState = newGame(); keepBoth(g)
    placeSite(g, 0, 'Fertile Earth', 2, 2)
    placeSite(g, 0, 'Fertile Earth', 3, 3)
    const sz = summonCard(g, 0, 'Scourge Zombies', 2, 2)
    sz.modifiers.push({ kind: 'keyword', keyword: 'spellcaster', duration: 'permanent', turn: g.turn, sourcePlayer: 0 } as any)
    const vcard = `cv${g.nextId++}`; g.cards[vcard] = { id: vcard, name: 'Vivien the Enchantress', owner: 0 } as any
    g.players[0].cemetery.push(vcard)
    const mortal = summonCard(g, 0, 'Sea Raider', 3, 3) // an allied Mortal on land
    killUnit(g, mortal.id)
    const prompt = g.prompts[0]
    expect(prompt?.kind, 'a revive offer on the Mortal death').toBe('yesNo')
    expect(prompt!.title, 'offers to raise VIVIEN').toContain('Vivien')
    answer(g, true)
    expect(Object.values(g.units).some((u) => u.name === 'Vivien the Enchantress' && u.x === 3 && u.y === 3), 'Vivien rises where the Mortal fell').toBe(true)
  })

  it('self-name = this card: a real Bone Rabble in the cemetery still revives itself', () => {
    const g: GameState = newGame(); keepBoth(g)
    const rc = `cr${g.nextId++}`; g.cards[rc] = { id: rc, name: 'Bone Rabble', owner: 0 } as any
    g.players[0].cemetery.push(rc)
    const earth = placeSite(g, 0, 'Fertile Earth', 3, 3)
    emitEvent(g, 'onSitePlayed', 0, earth)
    const prompt = g.prompts[0]
    expect(prompt?.kind).toBe('yesNo')
    expect(prompt!.title).toContain('Bone Rabble')
    answer(g, true)
    expect(Object.values(g.units).some((u) => u.name === 'Bone Rabble' && u.x === 3 && u.y === 3), 'the real Bone Rabble revives itself').toBe(true)
  })
})
