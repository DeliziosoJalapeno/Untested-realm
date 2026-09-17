import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, act, actFail } from './helpers'
import { avatarOf, isDisabled, carriedInside, projectileCanHit, syncCarried } from '../src'

describe('Carrying an ally (Fine Courser can carry the Avatar)', () => {
  it('a Fine Courser co-located with the Avatar can pick it up', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0)
    const courser = summonCard(g, 0, 'Fine Courser', avatar.x, avatar.y)
    courser.enteredTurn = -1
    act(g, 0, { t: 'pickUp', unitId: courser.id, artifactIds: [], unitIds: [avatar.id] })
    expect(avatar.carriedBy).toBe(courser.id)
    expect(courser.carryingUnits).toContain(avatar.id)
  })

  it('the carried Avatar stays ACTIVE and TARGETABLE (it rides on top, not swallowed)', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0)
    const courser = summonCard(g, 0, 'Fine Courser', avatar.x, avatar.y)
    courser.enteredTurn = -1
    act(g, 0, { t: 'pickUp', unitId: courser.id, artifactIds: [], unitIds: [avatar.id] })
    expect(carriedInside(g, avatar)).toBe(false) // not in a belly
    expect(isDisabled(g, avatar)).toBe(false) // may still act
    expect(projectileCanHit(g, avatar)).toBe(true) // still on the board to be hit
  })

  it('the carried Avatar rides along when the Courser moves', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0)
    const courser = summonCard(g, 0, 'Fine Courser', avatar.x, avatar.y)
    courser.enteredTurn = -1
    act(g, 0, { t: 'pickUp', unitId: courser.id, artifactIds: [], unitIds: [avatar.id] })
    courser.x = avatar.x + 1 // pretend the Courser stepped east
    syncCarried(g, courser)
    expect(avatar.x).toBe(courser.x) // the Avatar came with it
    expect(avatar.y).toBe(courser.y)
  })

  it('a "carry an allied MINION" carrier (Beast of Burden) CANNOT carry the Avatar', () => {
    const g = newGame(); keepBoth(g)
    const avatar = avatarOf(g, 0)
    const beast = summonCard(g, 0, 'Beast of Burden', avatar.x, avatar.y)
    beast.enteredTurn = -1
    const err = actFail(g, 0, { t: 'pickUp', unitId: beast.id, artifactIds: [], unitIds: [avatar.id] })
    expect(err).toMatch(/avatar/i)
    expect(avatar.carriedBy).toBeFalsy()
  })
})

describe('Swallowed cargo (Bullfrog) stays disabled and out of reach', () => {
  it('a unit inside a carriedAreDisabled carrier is disabled + untargetable', () => {
    const g = newGame(); keepBoth(g)
    const frog = summonCard(g, 0, 'Brobdingnag Bullfrog', 2, 2)
    const meal = summonCard(g, 0, 'Foot Soldier', 2, 2)
    // swallow it (mirror the Bullfrog's genesis)
    meal.carriedBy = frog.id
    frog.carryingUnits = [meal.id]

    expect(carriedInside(g, meal)).toBe(true)
    expect(isDisabled(g, meal)).toBe(true)
    expect(projectileCanHit(g, meal)).toBe(false)
  })
})
