// "May be cast by X" is a caster EXPANSION, not a restriction. The seven cards that
// carry it (Burning Hands, Firebreathing, Kiss of Death, Grievous Insult, Buried
// Alive, Smite, Trial by Fire) ADD casters beyond the normal Spellcaster set — the
// avatar (always a Spellcaster) and Spellcaster minions can STILL cast them. The
// expansion arm only widens legality; it never removes a normal caster. Distinct
// from the EXCLUSIVE lock system ("only X can cast" — Morgana/Omphalos/Gabriel).

import { describe, it, expect } from 'vitest'
import { canCast, board, applyAction, summon, usummon, inject, cinject } from '../src'
import type { GameState } from '../src'

const byName = (g: GameState, name: string, controller: number) =>
  Object.values(g.units).find((u) => u.name === name && u.controller === controller)!

describe('Burning Hands: "May be cast by an allied Mortal" is an expansion', () => {
  it('(a) the avatar (a Spellcaster with a fire threshold) can still cast it', () => {
    const g = board()
    const bh = inject(g, 0, 'Burning Hands')
    expect(canCast(g, 0, bh, g.players[0].avatarUnitId).ok).toBe(true)
  })

  it('(b) a non-Spellcaster allied Mortal can cast it (the expansion arm)', () => {
    const g = board()
    summon(g, 0, 'Amazon Warriors', 1, 1) // Mortal, not a Spellcaster
    const bh = inject(g, 0, 'Burning Hands')
    expect(canCast(g, 0, bh, byName(g, 'Amazon Warriors', 0).id).ok).toBe(true)
  })

  it('(c) a non-Mortal non-Spellcaster minion cannot cast it', () => {
    const g = board()
    summon(g, 0, 'Autumn Unicorn', 3, 1) // Beast, not a Mortal, not a Spellcaster
    const bh = inject(g, 0, 'Burning Hands')
    const chk = canCast(g, 0, bh, byName(g, 'Autumn Unicorn', 0).id)
    expect(chk.ok).toBe(false)
    expect(chk.reason).toMatch(/Mortal/)
  })

  it('(d) an ENEMY Mortal cannot cast it ("allied")', () => {
    const g = board()
    summon(g, 1, 'Amazon Warriors', 2, 3) // enemy Mortal
    const bh = inject(g, 0, 'Burning Hands')
    const chk = canCast(g, 0, bh, byName(g, 'Amazon Warriors', 1).id)
    expect(chk.ok).toBe(false)
  })
})

describe('Element-locked Spellcasters are still bound on the normal path', () => {
  it('(e) a Fire-only Spellcaster cannot cast a water spell (Drown)', () => {
    const g = board()
    summon(g, 0, 'Flaming Skull', 1, 1) // "Fire Spellcaster"
    const drown = inject(g, 0, 'Drown')
    const chk = canCast(g, 0, drown, byName(g, 'Flaming Skull', 0).id)
    expect(chk.ok).toBe(false)
    expect(chk.reason).toMatch(/fire spells/)
  })

  it('(e2) but the same Fire Spellcaster CAN cast fire Burning Hands via the normal path', () => {
    const g = board()
    summon(g, 0, 'Flaming Skull', 1, 1)
    const bh = inject(g, 0, 'Burning Hands')
    expect(canCast(g, 0, bh, byName(g, 'Flaming Skull', 0).id).ok).toBe(true)
  })
})

describe('Kiss of Death: "here" anchors on the caster, not the avatar', () => {
  it('(f) an Undead caster far from the avatar kills a minion AT THE UNDEAD’S square', () => {
    const g = board()
    const wight = usummon(g, 0, 'Barrow Wight', 0, 0) // Undead, away from the avatar
    const victim = usummon(g, 1, 'Amazon Warriors', 0, 0) // co-located enemy minion
    const kod = cinject(g, 0, 'Kiss of Death')
    expect(canCast(g, 0, kod, wight).ok).toBe(true)
    const res = applyAction(g, 0, { t: 'castSpell', cardId: kod, casterId: wight, targets: [victim] })
    expect(res.ok).toBe(true)
    expect(g.units[victim]).toBeUndefined() // it died at the Undead's square
  })
})
