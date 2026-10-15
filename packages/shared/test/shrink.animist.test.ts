// Shrink "set the base power of target nearby unit to 0" (reported: "shrink doesn't work with animist
// minions"). An Animist Spirit has no printed power — its base power is its mana cost (a modifier from
// taking Spirit form) — so Shrink must cancel that too. External buffs are left untouched ("set BASE").
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { makeCtx, getScript, getCard, effAttack, effDefence, avatarOf } from '../src'

function animistSpirit(g: ReturnType<typeof newGame>, magic: string, x: number, y: number) {
  const cost = getCard(magic).cost ?? 0
  const s = summonCard(g, 1, magic, x, y)
  s.counters = { animistSpirit: 1 }
  s.modifiers.push({ kind: 'power', amount: cost, duration: 'permanent', turn: 0, sourcePlayer: 1 })
  return { s, cost }
}

describe('Shrink vs Animist Spirits', () => {
  it('reduces an Animist Spirit to 0/0', () => {
    const g = newGame(); keepBoth(g)
    const { s, cost } = animistSpirit(g, 'Fireball', 3, 2)
    expect(effAttack(g, s), 'sanity: Spirit power equals its cost').toBe(cost)

    getScript('Shrink')!.onCast!(makeCtx(g, avatarOf(g, 0).id, 0, [{ unit: s.id }]))

    expect(effAttack(g, s), 'power shrunk to 0').toBe(0)
    expect(effDefence(g, s), 'life shrunk to 0').toBe(0)
  })

  it('still only zeroes the BASE — an external buff on a normal minion survives', () => {
    const g = newGame(); keepBoth(g)
    const m = summonCard(g, 1, 'Stygian Archers', 4, 2) // 3/3
    m.modifiers.push({ kind: 'power', amount: 2, duration: 'permanent', turn: 0, sourcePlayer: 1 }) // +2 → 5

    getScript('Shrink')!.onCast!(makeCtx(g, avatarOf(g, 0).id, 0, [{ unit: m.id }]))

    expect(effAttack(g, m), 'base 0, +2 buff remains').toBe(2)
  })
})
