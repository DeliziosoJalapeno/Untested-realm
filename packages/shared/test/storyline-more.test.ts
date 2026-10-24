// Codex, Storyline — the rest of it: simultaneous triggers (the non-active player's resolve first), cast
// triggers resolve before their spell, and every kind of movement goes one step at a time (defenders
// walking into a fight, forced drags), with what happens "when it arrives" waiting for the drag to end.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, injectToHand, giveMana, waiveThreshold, act, answer } from './helpers'
import { type GameState } from '../src'
import '../src/cards/scripts/index'

const at = (g: GameState, id: string) => (g.units[id] ? [g.units[id].x, g.units[id].y] : null)

describe('simultaneous triggers: the non-active player\'s resolve first', () => {
  // The Codex's own example: my Apprentice Wizard enters my flooded Bottomless Pit, which carries your
  // Mariner's Curse. Your Curse resolves first: the Wizard is submerged, drowns, and the Curse returns to
  // your hand — so my Pit (and the Wizard's genesis) find nothing left to do.
  it("the opponent's Mariner's Curse resolves before the active player's Bottomless Pit", () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 3)
    placeSite(g, 0, 'Bottomless Pit', 2, 2).flooded = true
    const cardId = `ctest${g.nextId++}`
    g.cards[cardId] = { id: cardId, name: "Mariner's Curse", owner: 1 }
    g.auras.curse = { id: 'curse', cardId, name: "Mariner's Curse", controller: 1, squares: [{ x: 2, y: 2 }], enteredTurn: 0 }
    const wizard = injectToHand(g, 0, 'Apprentice Wizard')
    giveMana(g, 0, 20)
    const spellbook = g.players[0].spellbook.length
    act(g, 0, { t: 'castSpell', cardId: wizard, casterId: g.players[0].avatarUnitId, at: { x: 2, y: 2, region: 'surface' } })
    expect(g.auras.curse, "the Curse resolved and went back to its owner's hand").toBeUndefined()
    expect(g.players[1].hand).toContain(cardId)
    expect(g.players[0].spellbook.length, 'the Wizard left the realm before its genesis: no spell drawn').toBe(spellbook)
  })
})

describe('a cast trigger resolves before its spell', () => {
  it('Ring of Morrigan asks while the minion spell is still on the storyline', () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 3)
    const avatar = g.units[g.players[0].avatarUnitId]
    avatar.x = 2; avatar.y = 3
    giveArtifact(g, avatar, 'Ring of Morrigan')
    const victim = summonCard(g, 1, 'Wild Boars', 2, 3); victim.enteredTurn = -1
    const boars = injectToHand(g, 0, 'Wild Boars')
    giveMana(g, 0, 20)
    act(g, 0, { t: 'castSpell', cardId: boars, casterId: avatar.id, at: { x: 2, y: 3, region: 'surface' } })
    expect(g.prompts[0]?.cont).toBe('script:Ring of Morrigan:bleed')
    const mine = () => Object.values(g.units).filter((u) => u.name === 'Wild Boars' && u.controller === 0)
    expect(mine(), 'the Boars have not entered the realm yet').toHaveLength(0)
    answer(g, [victim.id])
    expect(mine(), 'now they have').toHaveLength(1)
  })
})

describe('a defender walking into the fight goes one step at a time', () => {
  it('stops on a Troll Bridge for the toll, and the fight waits for it', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 0)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    placeSite(g, 0, 'Troll Bridge', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 3)
    const attacker = summonCard(g, 0, 'Wild Boars', 2, 0); attacker.enteredTurn = -1
    const target = summonCard(g, 1, 'Wild Boars', 2, 1); target.enteredTurn = -1
    const helper = summonCard(g, 1, 'Snallygaster', 2, 3); helper.enteredTurn = -1
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: target.id } })
    expect(g.prompts[0]?.kind).toBe('defend')
    answer(g, [{ unitId: helper.id }])
    expect(at(g, helper.id), 'the defender stopped on the bridge').toEqual([2, 2])
    expect(g.prompts[0]?.cont).toBe('script:Troll Bridge:toll')
    expect(g.units[attacker.id]?.damage, 'no fight yet').toBe(0)
    answer(g, [0])
    expect(at(g, helper.id), 'paid: it reaches the fight').toEqual([2, 1])
  })
})

describe('a forced drag goes one step at a time, and "when it arrives" waits for the end', () => {
  it("Grapple Shot's ally stops on a Troll Bridge; the strike is offered once it arrives", () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 0, 3)
    placeSite(g, 1, 'Troll Bridge', 0, 2)
    placeSite(g, 1, 'Rustic Village', 0, 1)
    // column 0: clear of the Avatars, who stand in column 2
    const ally = summonCard(g, 0, 'Wild Boars', 0, 3); ally.enteredTurn = -1
    const hit = summonCard(g, 1, 'Wild Boars', 0, 1); hit.enteredTurn = -1
    const grapple = injectToHand(g, 0, 'Grapple Shot')
    giveMana(g, 0, 20)
    act(g, 0, { t: 'castSpell', cardId: grapple, casterId: g.players[0].avatarUnitId, targets: [ally.id] })
    answer(g, 's') // fire towards the enemy
    expect(at(g, ally.id), 'dragged onto the bridge, then stopped').toEqual([0, 2])
    expect(g.prompts.map((p) => p.cont)).toEqual(['script:Troll Bridge:toll'])
    answer(g, [0])
    expect(at(g, ally.id), 'paid: dragged on to the hit unit').toEqual([0, 1])
    expect(g.prompts[0]?.cont, 'and only now offered the strike').toBe('script:Grapple Shot:land')
  })
})
