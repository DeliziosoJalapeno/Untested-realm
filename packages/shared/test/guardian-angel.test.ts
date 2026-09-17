import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'

// Guardian Angel: 3/3 Earth, Airborne
// Genesis -> Fly to a weaker allied minion to Ward it.
// FAQ1: "fly to" requires the target to be at a DIFFERENT location — a co-located
//        ally is not a legal genesis target.

function legalGenesisTargets(g: GameState, angelId: string): string[] {
  const script = getScript('Guardian Angel')!
  const spec = script.genesisTargets![0]
  const angel = g.units[angelId]
  if (!angel) return []
  // pseudo-caster placed at angel's landing position (same as genesis target anchor)
  const pseudoCaster = { ...angel }
  return Object.values(g.units)
    .filter((u) => !u.isAvatar && u.controller === angel.controller && u.id !== angelId)
    .filter((u) => spec.filter ? spec.filter(g, u, pseudoCaster) : true)
    .map((u) => u.id)
}

describe('Guardian Angel — FAQ1: co-located ally is not a legal genesis target', () => {
  it('a weaker ally at the SAME square is excluded from genesis targets', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Sacred Grove', 2, 2)

    // summon Guardian Angel (3/3) at (2,2)
    const angel = summonCard(g, 0, 'Guardian Angel', 2, 2)
    // summon a weaker ally (1/1) at the SAME square
    const sameSquare = summonCard(g, 0, 'Bone Jumble', 2, 2)  // 1/1 < 3

    const legal = legalGenesisTargets(g, angel.id)
    expect(legal, 'co-located weaker ally must not be a legal target').not.toContain(sameSquare.id)
  })

  it('a weaker ally at a DIFFERENT square is a valid genesis target', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Sacred Grove', 2, 2)
    placeSite(g, 0, 'Sacred Grove', 3, 2)

    const angel = summonCard(g, 0, 'Guardian Angel', 2, 2)
    // weaker ally at a different square
    const elsewhere = summonCard(g, 0, 'Bone Jumble', 3, 2)  // 1/1 < 3

    const legal = legalGenesisTargets(g, angel.id)
    expect(legal, 'weaker ally at a different square IS a legal target').toContain(elsewhere.id)
  })

  it('an ally equal-or-stronger at any square is never a legal target', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Sacred Grove', 2, 2)
    placeSite(g, 0, 'Sacred Grove', 3, 2)

    const angel = summonCard(g, 0, 'Guardian Angel', 2, 2)
    // Stygian Archers is 3/3 — same avg power as Guardian Angel (3), not strictly weaker
    const strong = summonCard(g, 0, 'Stygian Archers', 3, 2)

    const legal = legalGenesisTargets(g, angel.id)
    expect(legal, 'equal-power ally is never a legal target').not.toContain(strong.id)
  })

  it('with only a co-located weaker ally, the genesis target list is empty (upTo=true, no prompt)', () => {
    const g = newGame(42, 0); keepBoth(g)
    placeSite(g, 0, 'Sacred Grove', 2, 2)

    const angel = summonCard(g, 0, 'Guardian Angel', 2, 2)
    summonCard(g, 0, 'Bone Jumble', 2, 2)  // only ally — same square

    const legal = legalGenesisTargets(g, angel.id)
    expect(legal.length, 'no legal genesis targets when the only ally is co-located').toBe(0)
  })
})
