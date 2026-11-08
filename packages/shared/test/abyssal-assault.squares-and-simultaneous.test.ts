// Abyssal Assault: "For each point of its power, an allied Monster may deal 1 damage to a unit in a square
// near it." A SQUARE (not a location) — a unit in any region of a nearby square may be hit, e.g. one
// burrowed under it. FAQ: different squares may be chosen, and the damage is SIMULTANEOUS — "If you try
// dealing it to a warded unit, the Ward will prevent all of it."
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, castMagic, answer, waiveThreshold } from './helpers'
import { wardUnit, type GameState } from '../src'
import '../src/cards/scripts/index'

function board() {
  const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
  placeSite(g, 0, 'Rustic Village', 2, 2)
  placeSite(g, 0, 'Rustic Village', 2, 1)
  const monster = summonCard(g, 0, 'Barging Barghest', 2, 2); monster.enteredTurn = -1 // 3 power Monster
  return { g, monster }
}

describe('Abyssal Assault', () => {
  it('reaches a unit burrowed under a nearby square', () => {
    const { g, monster } = board()
    const mole = summonCard(g, 1, 'Cave Trolls', 2, 1); mole.region = 'underground'
    const top = summonCard(g, 1, 'Bone Jumble', 2, 1)
    castMagic(g, 0, 'Abyssal Assault', { targets: [monster.id] })
    const p: any = g.prompts[0]
    expect(p?.kind).toBe('chooseTargets')
    expect(p.data.candidates).toContain(mole.id)
    expect(p.data.candidates).toContain(top.id)
    answer(g, [mole.id]); answer(g, [mole.id]); answer(g, [mole.id])
    expect(g.units[mole.id], 'three lashes kill the 3/3 underground').toBeUndefined()
  })

  it('a ward prevents all of the simultaneous lashes', () => {
    const { g, monster } = board()
    const foe = summonCard(g, 1, 'Cave Trolls', 2, 1) // 3/3, not Evil (Evil minions can't be warded)
    expect(wardUnit(g, foe)).toBe(true)
    castMagic(g, 0, 'Abyssal Assault', { targets: [monster.id] })
    answer(g, [foe.id]); answer(g, [foe.id]); answer(g, [foe.id])
    expect(g.units[foe.id], 'the ward prevents all three').toBeDefined()
    expect(g.units[foe.id].damage).toBe(0)
    expect(g.units[foe.id].ward).toBeFalsy()
  })

  it('stopping early deals only the chosen lashes, all at once', () => {
    const { g, monster } = board()
    const a = summonCard(g, 1, 'Stygian Archers', 2, 1) // 3/3
    castMagic(g, 0, 'Abyssal Assault', { targets: [monster.id] })
    answer(g, [a.id]); answer(g, [a.id])
    expect(g.units[a.id].damage, 'nothing dealt until the picks are done').toBe(0)
    answer(g, [])
    expect(g.units[a.id].damage).toBe(2)
  })
})
