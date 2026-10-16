// Whirling Blades' "take up to two steps" are real STEPS, not a forced same-region teleport: a Voidwalk
// ally in the void may step up onto the surface (and strike what it passes), instead of being stuck in the
// void because the move kept its region.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, waiveThreshold, answer } from './helpers'

describe('Whirling Blades steps respect movement keywords (region changes)', () => {
  it('a Voidwalk ally in the void can whirl up onto an adjacent surface site and strike an enemy there', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Spire', 2, 2) // a surface site next to the void square
    waiveThreshold(g, 0)
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 3, 'void'); ally.enteredTurn = -5
    ally.modifiers.push({ kind: 'keyword', keyword: 'voidwalk', duration: 'permanent', turn: g.turn, sourcePlayer: 0 }) // can step void <-> surface
    const enemy = summonCard(g, 1, 'Escyllion Cyclops', 2, 2); enemy.enteredTurn = -5 // 6/6 on the surface site

    castMagic(g, 0, 'Whirling Blades', { targets: [ally.id] })
    // step 1: whirl up from the void (2,3) onto the surface of (2,2)
    answer(g, { x: 2, y: 2, region: 'surface' })
    // step 2: stop on the current square
    answer(g, { x: 2, y: 2, region: 'surface' })

    expect([g.units[ally.id].x, g.units[ally.id].y, g.units[ally.id].region], 'the ally rose to the surface').toEqual([2, 2, 'surface'])
    expect(g.units[enemy.id]?.damage, 'the enemy on the path was struck').toBeGreaterThan(0)
  })
})
