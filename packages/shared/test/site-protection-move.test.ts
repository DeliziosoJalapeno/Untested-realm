// Order of the Sacred Oak ("your opponent can't destroy nearby sites") protects nearby sites from
// DESTRUCTION only — they can still be moved and modified. Bluecap Knockers ("can't be moved, destroyed,
// or modified") blocks both. (Order of the WHITE WING is a different card — it banishes nearby conjures.)
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard } from './helpers'
import { destroySite, siteCantBeMoved } from '../src/engine/effects'
import { isDisabled } from '../src/engine/statics'
import '../src/cards/scripts/index'

describe('site protection: destruction vs movement', () => {
  it('Order of the Sacred Oak: nearby site survives destruction but stays movable', () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2)
    summonCard(g, 0, 'Order of the Sacred Oak', 2, 3).enteredTurn = -1 // nearby

    expect(siteCantBeMoved(g, site), 'a Sacred-Oak-protected site can still be moved').toBe(false)
    destroySite(g, site.id, 1) // opponent tries to destroy it
    expect(g.sites[site.id], 'the site survived — Sacred Oak blocks destruction').toBeTruthy()
    expect(g.sites[site.id]?.isRubble ?? false, 'and it was not rubbled').toBe(false)
  })

  it('Bluecap Knockers: its site resists BOTH destruction and movement', () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Rustic Village', 3, 3)
    summonCard(g, 0, 'Bluecap Knockers', 3, 3).enteredTurn = -1 // on the site

    expect(siteCantBeMoved(g, site), 'Bluecap immobilizes its site').toBe(true)
    destroySite(g, site.id, 1)
    expect(g.sites[site.id], 'Bluecap also blocks destruction').toBeTruthy()
    expect(g.sites[site.id]?.isRubble ?? false).toBe(false)
  })

  it('a DISABLED Order of the Sacred Oak no longer protects (Root Spider beneath it)', () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 3)
    const oak = summonCard(g, 0, 'Order of the Sacred Oak', 2, 3); oak.enteredTurn = -1
    summonCard(g, 1, 'Root Spider', 2, 3, 'underground').enteredTurn = -1 // disables the Oak above it
    expect(isDisabled(g, g.units[oak.id]), 'the Oak is disabled').toBe(true)

    destroySite(g, site.id, 1)
    expect(g.sites[site.id], 'a disabled Oak cannot protect — the site is destroyed (replaced by rubble)').toBeUndefined()
  })

  it('a willing SACRIFICE bypasses Sacred Oak (sacrificing is not destroying)', () => {
    const g = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Rustic Village', 2, 2)
    summonCard(g, 0, 'Order of the Sacred Oak', 2, 3).enteredTurn = -1

    destroySite(g, site.id, 0, false) // a normal destroy effect
    expect(g.sites[site.id], 'destruction is blocked by the Oak').toBeTruthy()
    destroySite(g, site.id, 0, true) // a willing sacrifice (Sinkhole/Vesuvius path)
    expect(g.sites[site.id], 'a sacrifice goes through — it is not destruction').toBeUndefined()
  })
})
