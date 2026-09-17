import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveMana, placeSite, answer } from './helpers'
import { makeCtx, getScript, type GameState } from '../src'

// The mana widget shows remaining / total, where total = mana + manaSpent (this turn). Any script
// that pays a mana COST must record it as spent, or the displayed TOTAL appears to shrink each use
// (the "Necromancer/Open Grave eats your max mana" bug). Covered centrally by ctx.spendMana.
describe('script mana costs are recorded as spent (widget total stays put)', () => {
  it('Open Grave (pay ① → Skeleton) does not shrink the mana total', () => {
    const g = newGame(); keepBoth(g); giveMana(g, 0, 5)
    const site = placeSite(g, 0, 'Open Grave', 1, 1)
    const totalBefore = g.players[0].mana + (g.flow?.manaSpent?.[0] ?? 0)

    // fire the site's Genesis ("pay ① to summon a Skeleton here?") and accept
    getScript('Open Grave')!.genesis!(makeCtx(g as GameState, site.id, 0, []))
    expect(g.prompts[0]?.kind).toBe('yesNo')
    answer(g, true)

    const manaAfter = g.players[0].mana
    const spentAfter = g.flow?.manaSpent?.[0] ?? 0
    expect(manaAfter, 'one mana was actually paid').toBe(5 - 1)
    expect(spentAfter, 'and recorded as spent').toBe(1)
    expect(manaAfter + spentAfter, 'so the widget total is unchanged').toBe(totalBefore)
    expect(Object.values(g.units).some((u) => u.name === 'Skeleton'), 'a Skeleton was raised').toBe(true)
  })

  it('ctx.spendMana deducts AND records in one step', () => {
    const g = newGame(); keepBoth(g); giveMana(g, 0, 7)
    const av = g.units[g.players[0].avatarUnitId]
    const ctx: any = makeCtx(g as GameState, av.id, 0, [])
    const totalBefore = g.players[0].mana + (g.flow?.manaSpent?.[0] ?? 0)
    ctx.spendMana(0, 3)
    expect(g.players[0].mana).toBe(4)
    expect(g.flow?.manaSpent?.[0]).toBe(3)
    expect(g.players[0].mana + (g.flow?.manaSpent?.[0] ?? 0)).toBe(totalBefore)
  })
})
