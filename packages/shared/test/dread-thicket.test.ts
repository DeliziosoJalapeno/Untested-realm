// Dread Thicket: "The first attack out of this site each turn can't be defended."
// FAQ: "out of" = take exactly one step away from the Thicket, then attack (earlier steps don't matter).
// Attacking a unit standing ON the Thicket is an ordinary, defendable attack.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act } from './helpers'
import type { GameState, UnitState } from '../src'
import '../src/cards/scripts/index'

const THICKET = { x: 2, y: 1 }

function board(): GameState {
  const g = newGame(42, 0); keepBoth(g)
  for (let x = 0; x <= 4; x++) for (let y = 0; y <= 3; y++) {
    placeSite(g, 0, x === THICKET.x && y === THICKET.y ? 'Dread Thicket' : 'Active Volcano', x, y)
  }
  return g
}
const ready = (u: UnitState) => { u.enteredTurn = -5; u.tapped = false; return u }
const defendOffered = (g: GameState) => g.prompts[0]?.kind === 'defend'

describe('Dread Thicket', () => {
  it('stepping OUT of the Thicket and attacking: no defenders may be declared', () => {
    const g = board()
    const attacker = ready(summonCard(g, 0, 'Stygian Archers', THICKET.x, THICKET.y))
    const target = ready(summonCard(g, 1, 'Bone Jumble', 2, 2))
    ready(summonCard(g, 1, 'Escyllion Cyclops', 3, 2)) // a would-be defender next door
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: target.id } })
    expect(defendOffered(g), 'undefendable').toBe(false)
    expect(g.units[target.id], 'the attack went through').toBeUndefined()
  })

  it('attacking a unit ON the Thicket (stepping into it) can be defended', () => {
    const g = board()
    const attacker = ready(summonCard(g, 0, 'Stygian Archers', 1, 1))
    const target = ready(summonCard(g, 1, 'Bone Jumble', THICKET.x, THICKET.y))
    ready(summonCard(g, 1, 'Escyllion Cyclops', 3, 1))
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [{ x: THICKET.x, y: THICKET.y, region: 'surface' }], attack: { unit: target.id } })
    expect(defendOffered(g)).toBe(true)
  })

  it('attacking from the Thicket without leaving it can be defended', () => {
    const g = board()
    const attacker = ready(summonCard(g, 0, 'Stygian Archers', THICKET.x, THICKET.y))
    const target = ready(summonCard(g, 1, 'Bone Jumble', THICKET.x, THICKET.y))
    ready(summonCard(g, 1, 'Escyllion Cyclops', 3, 1))
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: target.id } })
    expect(defendOffered(g)).toBe(true)
  })

  it('only the FIRST attack out of it each turn', () => {
    const g = board()
    const a1 = ready(summonCard(g, 0, 'Stygian Archers', THICKET.x, THICKET.y))
    const a2 = ready(summonCard(g, 0, 'Stygian Archers', THICKET.x, THICKET.y))
    const t1 = ready(summonCard(g, 1, 'Bone Jumble', 2, 2))
    const t2 = ready(summonCard(g, 1, 'Bone Jumble', 1, 1))
    ready(summonCard(g, 1, 'Escyllion Cyclops', 1, 2)) // adjacent to both (2,2) and (1,1)
    act(g, 0, { t: 'moveAttack', unitId: a1.id, path: [{ x: 2, y: 2, region: 'surface' }], attack: { unit: t1.id } })
    expect(defendOffered(g), 'first: undefendable').toBe(false)
    act(g, 0, { t: 'moveAttack', unitId: a2.id, path: [{ x: 1, y: 1, region: 'surface' }], attack: { unit: t2.id } })
    expect(defendOffered(g), 'second: defendable').toBe(true)
  })
})
