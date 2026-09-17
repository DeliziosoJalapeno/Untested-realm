// Forced multi-step movement (push/pull/drag — Grapple Shot, Meat Hook, harpoons, currents) TAKES STEPS:
// it passes THROUGH every square between origin and destination instead of teleport-jumping past them, so
// each square's enter/leave triggers fire (Briar Patch, flipped-Druid thorns, a Giant Shark's waters…).
// It STOPS if the unit can't enter a location (a void gap, a forced/push entry ban — Gnome Hollows,
// Bailey). It IGNORES the unit's own movement limitations (Immobile, walls). While traversing, the unit is
// not "at rest", so an at-rest disabler (Hillock Basilisk / Gorgons) can't freeze it in a pass-through
// square — only once it comes to rest.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveMana, placeSite, summonCard } from './helpers'
import { avatarOf, isDisabled, type GameState } from '../src'
import { makeCtx } from '../src/engine/effects'
import '../src/cards/scripts/index'

// pull `unitId` in a straight line to (x,y) as a forced drag, fired by player 0's avatar
function drag(g: GameState, unitId: string, x: number, y: number): void {
  const ctx = makeCtx(g, avatarOf(g, 0).id, 0, [])
  ctx.teleport(unitId, x, y, 'surface', { push: true })
}

describe('forced multi-step movement steps through squares', () => {
  it('fires a passed-through Briar Patch (enter AND leave) instead of teleporting past it', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20)
    for (const x of [0, 1, 3, 4]) placeSite(g, 0, 'Rustic Village', x, 2)
    placeSite(g, 1, 'Briar Patch', 2, 2) // opponent-owned, on the drag's path
    const victim = summonCard(g, 0, 'Escyllion Cyclops', 0, 2); victim.enteredTurn = -1 // 6/6, survives

    drag(g, victim.id, 4, 2)

    expect(g.units[victim.id], 'the beefy unit survived the crossing').toBeTruthy()
    expect(g.units[victim.id].x, 'it reached the destination').toBe(4)
    // 1 damage entering the Briar Patch square + 1 leaving it = 2 (a teleport would have dealt 0)
    expect(g.units[victim.id].damage).toBe(2)
  })

  it('a void gap on the path stops the drag on the last square it could enter', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20)
    for (const x of [0, 1, 3, 4]) placeSite(g, 0, 'Rustic Village', x, 2) // (2,2) left siteless = void
    const u = summonCard(g, 0, 'Bone Jumble', 0, 2); u.enteredTurn = -1

    drag(g, u.id, 4, 2)

    expect(g.units[u.id], 'it was not banished into the void').toBeTruthy()
    expect(g.units[u.id].x, 'it stopped before the void gap at (2,2)').toBe(1)
    expect(g.units[u.id].region).toBe('surface')
  })

  it('a forced entry ban (Gnome Hollows) stops a strong unit but lets a weak one pass through', () => {
    const heavy: GameState = newGame(); keepBoth(heavy); giveMana(heavy, 0, 20)
    for (const x of [0, 1, 3, 4]) placeSite(heavy, 0, 'Rustic Village', x, 2)
    placeSite(heavy, 0, 'Gnome Hollows', 2, 2) // "power 3+ can't enter"
    const big = summonCard(heavy, 0, 'Escyllion Cyclops', 0, 2); big.enteredTurn = -1 // avg 6 → banned
    drag(heavy, big.id, 4, 2)
    expect(heavy.units[big.id].x, 'the strong unit is stopped before Gnome Hollows').toBe(1)

    const light: GameState = newGame(); keepBoth(light); giveMana(light, 0, 20)
    for (const x of [0, 1, 3, 4]) placeSite(light, 0, 'Rustic Village', x, 2)
    placeSite(light, 0, 'Gnome Hollows', 2, 2)
    const small = summonCard(light, 0, 'Bone Jumble', 0, 2); small.enteredTurn = -1 // avg 1 → allowed
    drag(light, small.id, 4, 2)
    expect(light.units[small.id].x, 'the weak unit passes through and reaches the destination').toBe(4)
  })

  it('Bailey (push-only ground ban) stops a dragged enemy the step before it', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20)
    for (const x of [0, 1, 2, 3, 4]) placeSite(g, 0, 'Rustic Village', x, 2)
    // a ground Bailey owned by the opponent (player 1) at (2,2): enemies can't move onto it on the ground
    const cardId = `ctestB${g.nextId++}`; g.cards[cardId] = { id: cardId, name: 'Bailey', owner: 1 }
    const artId = `atestB${g.nextId++}`
    g.artifacts[artId] = { id: artId, cardId, name: 'Bailey', conjuredBy: 1, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false } as any
    const u = summonCard(g, 0, 'Escyllion Cyclops', 0, 2); u.enteredTurn = -1

    drag(g, u.id, 4, 2)

    expect(g.units[u.id].x, 'the enemy is dragged only up to the square before Bailey').toBe(1)
    expect(g.units[u.id].region).toBe('surface')
  })

  it('does not disable a unit merely passing a Basilisk square, but disables it once it rests there', () => {
    // Basilisk (player 1) at (2,3): its "one step in front" (y-1) is (2,2).
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20)
    for (const x of [0, 1, 3, 4]) placeSite(g, 0, 'Rustic Village', x, 2)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Grim Wastes', 2, 3)
    const basilisk = summonCard(g, 1, 'Hillock Basilisk', 2, 3); basilisk.enteredTurn = -1

    // passing THROUGH (2,2) to rest at (4,2): not adjacent at rest → not disabled
    const passer = summonCard(g, 0, 'Escyllion Cyclops', 0, 2); passer.enteredTurn = -1
    drag(g, passer.id, 4, 2)
    expect(g.units[passer.id].x).toBe(4)
    expect(isDisabled(g, g.units[passer.id]), 'a unit dragged PAST the gaze is not frozen').toBe(false)

    // dragged to REST on (2,2), the Basilisk's front square → disabled once at rest
    const rester = summonCard(g, 0, 'Escyllion Cyclops', 0, 2); rester.enteredTurn = -1
    drag(g, rester.id, 2, 2)
    expect(g.units[rester.id].x).toBe(2)
    expect(isDisabled(g, g.units[rester.id]), 'a unit dragged to REST in the gaze is disabled').toBe(true)
  })
})
