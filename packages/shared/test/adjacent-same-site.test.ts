// Rulebook: "Adjacent: the card's OWN square, and the squares it shares a border with." So a co-located
// unit (same site) IS adjacent (FAQ: an adjacent enemy already sharing a location). Cards that say
// "adjacent" must use isAdjacentW (own square + orthogonal), NOT orthAdjacentWrapped (orthogonal only).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold } from './helpers'
import { isAdjacentW } from '../src'

describe('"adjacent" includes the same site', () => {
  it('isAdjacentW: same square and orthogonal are adjacent; diagonal and 2-away are not', () => {
    const g = newGame()
    expect(isAdjacentW(g, 2, 2, 2, 2), 'same square IS adjacent').toBe(true)
    expect(isAdjacentW(g, 2, 2, 3, 2), 'orthogonal is adjacent').toBe(true)
    expect(isAdjacentW(g, 2, 2, 2, 3), 'orthogonal is adjacent').toBe(true)
    expect(isAdjacentW(g, 2, 2, 3, 3), 'diagonal is NOT adjacent').toBe(false)
    expect(isAdjacentW(g, 2, 2, 4, 2), 'two away is NOT adjacent').toBe(false)
  })

  it('Shatter Strike: an ally can hit an enemy sharing its site (co-located = adjacent)', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2)
    waiveThreshold(g, 0)
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 2); ally.enteredTurn = -5 // 1 power striker
    const enemy = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); enemy.enteredTurn = -5 // 6/6, on the SAME site

    castMagic(g, 0, 'Shatter Strike', { targets: [ally.id, enemy.id] })

    // before the fix the onCast logged "They are not adjacent" and no strike happened
    expect(g.units[enemy.id]?.damage, 'the co-located enemy was struck').toBeGreaterThan(0)
  })
})
