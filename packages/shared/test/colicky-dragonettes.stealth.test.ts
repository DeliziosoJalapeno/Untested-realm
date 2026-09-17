// Colicky Dragonettes shoot a projectile at the end of your turn — firing it REVEALS them, so a
// Stealthed Dragonettes loses its Stealth token (like declaring an attack or a Ranged shot).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx } from '../src'

describe('Colicky Dragonettes lose Stealth when they shoot', () => {
  it('a stealthed Dragonettes loses Stealth after its end-of-turn hiccup', () => {
    const g = newGame(); keepBoth(g)
    for (const x of [1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 2)
    const dragon = summonCard(g, 0, 'Colicky Dragonettes', 2, 2); dragon.enteredTurn = -1
    g.units[dragon.id].stealth = true

    getScript('Colicky Dragonettes')!.conts!.hiccup!(makeCtx(g, dragon.id, 0, []), {}, 'w')

    expect(g.units[dragon.id].stealth ?? false, 'Stealth is spent when they fire').toBe(false)
  })
})
