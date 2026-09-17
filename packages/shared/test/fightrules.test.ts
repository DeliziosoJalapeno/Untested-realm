// A FIGHT (Pudge Butcher, Lord of Lies, Crave Golem…) is not an attack: unlike Move-and-Attack it
// can be forced between ALLIED units, and it reaches an AIRBORNE target from the ground.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { fightUnits } from '../src'

describe('fight rules (differ from move-and-attack)', () => {
  it('a fight can be forced between two ALLIED units', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const a = summonCard(g, 0, 'Stygian Archers', 2, 2, 'surface'); a.enteredTurn = -5
    const b = summonCard(g, 0, 'Stygian Archers', 2, 2, 'surface'); b.enteredTurn = -5 // same controller!
    fightUnits(g, a, b) // fightUnits has no "attack your own" rule — a fight isn't an attack
    // both are 3/3 → they trade (a real fight resolved)
    expect(g.units[a.id]).toBeUndefined()
    expect(g.units[b.id]).toBeUndefined()
  })

  it('a GROUND fighter can fight an AIRBORNE target', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const ground = summonCard(g, 0, 'Stygian Archers', 2, 2, 'surface'); ground.enteredTurn = -5
    const flyer = summonCard(g, 1, 'Stygian Archers', 2, 2, 'surface'); flyer.enteredTurn = -5
    flyer.modifiers.push({ kind: 'keyword', keyword: 'airborne' } as any)
    fightUnits(g, ground, flyer) // no "only Airborne can attack Airborne" — that's a Move-and-Attack rule
    expect(g.units[flyer.id], 'the airborne target was fought and killed').toBeUndefined()
  })
})
