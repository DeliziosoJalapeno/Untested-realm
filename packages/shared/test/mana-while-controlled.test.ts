// Oct 2026 rules: mana sources provide mana WHILE you control them. Losing a mana-providing source
// mid-turn (destroyed/sacrificed/silenced/taken) takes its mana back out of your pool now — but never
// below what you've already spent. (Gains are credited on site entry, so only losses are reclaimed here.)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite } from './helpers'
import { sourceMana, reconcileControlledMana, destroySite } from '../src'

describe('mana sources provide while controlled', () => {
  it('losing a controlled site mid-turn reduces available mana by its contribution', () => {
    const g = newGame(); keepBoth(g)
    const s1 = placeSite(g, 0, 'Rustic Village', 2, 1) // provides 1
    placeSite(g, 0, 'Rustic Village', 3, 1)
    // simulate start-of-turn collection: baseline = current sources, pool = collected
    g.flow = g.flow ?? {}; (g.flow as any).manaBase = { 0: sourceMana(g, 0) }
    g.players[0].mana = sourceMana(g, 0)
    const before = g.players[0].mana

    destroySite(g, s1.id) // lose a mana source mid-turn
    reconcileControlledMana(g)
    expect(g.players[0].mana, 'lost exactly the destroyed site\'s 1 mana').toBe(before - 1)
  })

  it('never reduces below what you have already spent (clamps at 0)', () => {
    const g = newGame(); keepBoth(g)
    const s1 = placeSite(g, 0, 'Rustic Village', 2, 1)
    g.flow = g.flow ?? {}; (g.flow as any).manaBase = { 0: sourceMana(g, 0) }
    g.players[0].mana = 0 // already spent everything
    destroySite(g, s1.id)
    reconcileControlledMana(g)
    expect(g.players[0].mana, 'stays at 0, not negative').toBe(0)
  })
})
