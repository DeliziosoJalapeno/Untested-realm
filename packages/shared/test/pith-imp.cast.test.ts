// Pith Imp "steals a random spell from your opponent's hand until it leaves the realm." The filched
// spell is held by the Imp: ONLY the Imp may cast it, and only while it is a Spellcaster (it has none
// by default — a grant is required). When the Imp leaves, the unspent card returns to its owner.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, injectToHand, giveMana, waiveThreshold } from './helpers'
import { canCast, getScript, makeCtx, killUnit } from '../src'

describe('Pith Imp — only the Imp (as a Spellcaster) may cast the filched spell', () => {
  it('moves the spell into the thief\'s hand; uncastable until the Imp gains Spellcaster, then castable', () => {
    const g = newGame(); keepBoth(g)
    g.players[1].hand = []
    const spell = injectToHand(g, 1, 'Lightning Bolt') // the only spell to filch → deterministic pick
    const imp = summonCard(g, 0, 'Pith Imp', 2, 2)
    getScript('Pith Imp')!.genesis!(makeCtx(g, imp.id, 0, []))

    // it left the opponent's hand and is now in the thief's hand
    expect(g.players[1].hand).not.toContain(spell)
    expect(g.players[0].hand).toContain(spell)

    giveMana(g, 0, 20); waiveThreshold(g, 0)
    // a plain Pith Imp is no Spellcaster → it cannot cast the filched spell, and neither can the avatar
    expect(canCast(g, 0, spell, imp.id).ok, 'plain Imp cannot cast it').toBe(false)
    expect(canCast(g, 0, spell, g.players[0].avatarUnitId).ok, 'the avatar cannot cast it either').toBe(false)

    // grant the Imp the Spellcaster ability → now the Imp (and only the Imp) may cast it
    imp.modifiers.push({ kind: 'keyword', keyword: 'spellcaster' } as any)
    expect(canCast(g, 0, spell, imp.id).ok, 'with Spellcaster the Imp can cast it').toBe(true)
    expect(canCast(g, 0, spell, g.players[0].avatarUnitId).ok, 'still only the Imp, not the avatar').toBe(false)
  })

  it('returns the unspent stolen spell to its owner when the Imp leaves the realm', () => {
    const g = newGame(); keepBoth(g)
    g.players[1].hand = []
    const spell = injectToHand(g, 1, 'Lightning Bolt')
    const imp = summonCard(g, 0, 'Pith Imp', 2, 2)
    getScript('Pith Imp')!.genesis!(makeCtx(g, imp.id, 0, []))
    expect(g.players[0].hand).toContain(spell)

    killUnit(g, imp.id)
    // back to its owner, and the Imp-bound lock is gone
    expect(g.players[0].hand).not.toContain(spell)
    expect(g.players[1].hand).toContain(spell)
    expect((g.flow as any).stolen ?? []).toHaveLength(0)
    expect(((g.flow as any).lockedCards ?? []).some((l: any) => l.cardId === spell)).toBe(false)
  })
})
