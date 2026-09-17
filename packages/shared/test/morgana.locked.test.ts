// Morgana le Fay: "Genesis → Morgana draws her own hand of three spells, which only she can
// cast." Those spells are locked to Morgana — no other unit (caster or not) may cast them, so
// the client offers no spellcaster picker. And casting reveals her (Stealth breaks on casting).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, act } from './helpers'
import { canCast } from '../src'

function setup() {
  const g: any = newGame(); keepBoth(g)
  const avatar = g.units[g.players[0].avatarUnitId]
  const morgana = summonCard(g, 0, 'Morgana le Fay', 2, 1) // Spellcaster + Stealth
  morgana.stealth = true; morgana.enteredTurn = -1
  const cottagers = summonCard(g, 0, 'Common Cottagers', 3, 1) // a NON-spellcaster ally
  const foe = summonCard(g, 1, 'Common Cottagers', 2, 2) // a Fireball target
  // give Morgana a locked Fireball
  const fb = `cfb${g.nextId++}`
  g.cards[fb] = { id: fb, name: 'Fireball', owner: 0 }
  g.players[0].hand.push(fb)
  g.flow = g.flow ?? {}
  g.flow.lockedCards = [{ cardId: fb, casterId: morgana.id, casterName: 'Morgana le Fay', grantsCasting: false }]
  g.flow.noThreshold = { 0: g.turn } // waive threshold for the test
  g.players[0].mana += 20
  return { g, avatar, morgana, cottagers, foe, fb }
}

describe('Morgana le Fay locked spells', () => {
  it('only Morgana is a legal caster — not the avatar, not another (even a caster) unit', () => {
    const { g, avatar, morgana, cottagers, fb } = setup()
    expect(canCast(g, 0, fb, morgana.id).ok, 'Morgana may cast her own spell').toBe(true)
    expect(canCast(g, 0, fb, avatar.id).ok, 'the avatar may NOT cast it').toBe(false)
    expect(canCast(g, 0, fb, cottagers.id).ok, 'a non-spellcaster ally may NOT cast it').toBe(false)
  })

  it('casting a spell breaks Morgana\'s Stealth', () => {
    const { g, morgana, fb } = setup()
    expect(g.units[morgana.id].stealth).toBe(true)
    // Fireball is a projectile spell — a direction, not a unit target
    act(g, 0, { t: 'castSpell', cardId: fb, casterId: morgana.id, extra: { direction: 's' } } as any)
    expect(g.units[morgana.id].stealth, 'she is revealed by casting').toBeFalsy()
  })
})
