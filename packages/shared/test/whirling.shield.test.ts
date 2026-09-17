import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, answer, waiveThreshold } from './helpers'
import { dealDamageToUnit } from '../src/engine/effects'

describe('Shield Maidens reduce their OWN incoming damage', () => {
  it('"Nearby allies take 1 less" includes the Maidens herself', () => {
    const g = newGame(42, 0); keepBoth(g)
    const maiden = summonCard(g, 0, 'Shield Maidens', 2, 2); maiden.enteredTurn = 0 // 2/2
    dealDamageToUnit(g, maiden, 2, 1, { source: { player: 1, kind: 'effect' } })
    // 2 damage - 1 self-reduction = 1; she survives (1 < 2 defence). Without the fix she'd take 2 and die.
    expect(g.units[maiden.id]?.damage, 'she shields herself too').toBe(1)
  })
})

describe('Whirling Blades strikes each enemy along the path only ONCE (FAQ)', () => {
  it('stepping forward then back over an enemy\'s square does not double-strike it', () => {
    const g = newGame(42, 0); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Active Volcano', 2, 2); placeSite(g, 0, 'Active Volcano', 3, 2)
    const ally = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); ally.enteredTurn = 0 // 6 power striker
    const enemy = summonCard(g, 1, 'Conqueror Worm', 2, 2); enemy.enteredTurn = 0 // 8/8, survives one 6-strike
    castMagic(g, 0, 'Whirling Blades', { targets: [ally.id] })
    answer(g, { x: 3, y: 2 }) // step forward off the enemy's square
    answer(g, { x: 2, y: 2 }) // step back onto it — the square is revisited
    expect(g.units[enemy.id]?.damage, 'struck once (6), not twice (12)').toBe(6)
  })

  it('strikes all enemies on the path SIMULTANEOUSLY, with no order prompt (FAQ)', () => {
    const g = newGame(42, 0); keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Active Volcano', 2, 2)
    const ally = summonCard(g, 0, 'Escyllion Cyclops', 2, 2); ally.enteredTurn = 0 // 6 power
    const a = summonCard(g, 1, 'Conqueror Worm', 2, 2); a.enteredTurn = 0 // 8/8 survives a 6-strike
    const b = summonCard(g, 1, 'Conqueror Worm', 2, 2); b.enteredTurn = 0
    castMagic(g, 0, 'Whirling Blades', { targets: [ally.id] })
    answer(g, { x: 2, y: 2 }) // stop on own square (no step) → straight to the strikes

    expect(g.prompts.length, 'no order prompt — the strikes are simultaneous').toBe(0)
    expect(g.units[a.id]?.damage).toBe(6)
    expect(g.units[b.id]?.damage).toBe(6)
  })

  it('an AIRBORNE ally may step diagonally (FAQ: flyers use their move abilities)', () => {
    const g = newGame(42, 0); keepBoth(g); waiveThreshold(g, 0)
    for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [1, 3], [2, 3], [3, 3]] as const)
      placeSite(g, 0, 'Active Volcano', x, y)
    const flyer = summonCard(g, 0, 'Swan Maidens', 2, 2); flyer.enteredTurn = 0 // Airborne
    castMagic(g, 0, 'Whirling Blades', { targets: [flyer.id] })
    const p = g.prompts[0]
    expect(p?.kind).toBe('chooseSquare')
    const sqs = (p!.data.squares as { x: number; y: number }[])
    expect(sqs.some((s) => s.x === 1 && s.y === 1), 'a diagonal step (1,1) is offered to the flyer').toBe(true)
    // and taking it actually moves the flyer there
    answer(g, { x: 1, y: 1 })
    expect([g.units[flyer.id].x, g.units[flyer.id].y]).toEqual([1, 1])
  })
})
