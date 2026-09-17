// Part 1 regression: activated-ability target validation is anchored on the
// ability's SOURCE (rulebook: "Here/There = the location(s) a card occupies";
// "adjacent/nearby locations are only those in the same region as the
// referencing card"). A carried artifact's "here" is its BEARER's square; a
// site's range is measured from the site itself — NOT from the avatar.
//
// These tests fail on the old `caster = unit ?? avatarOf(state, player)` anchor:
// - Love Potion charms an enemy at the BEARER's square while the bearer is far
//   from the avatar (old anchor validates `where:'here'` against the avatar and
//   rejects the legal target).
// - Floodplain/Sinkhole now REJECT an out-of-range site AT VALIDATION instead of
//   accepting it and silently doing nothing (accepted-but-noop).

import { describe, it, expect } from 'vitest'
import { newGame, act, actFail, keepBoth, answer, fetchToHand, summonCard, giveArtifact, placeSite } from './helpers'
import { avatarOf, abilityAnchor } from '../src'
import type { GameState } from '../src'

/** mid-game board: mulligans done, p0 owns sites at (2,0)+(3,0), fresh main phase */
function board(): GameState {
  const g = newGame()
  keepBoth(g)
  const v1 = fetchToHand(g, 0, 'Rustic Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v1, x: 2, y: 0 })
  if (g.prompts.length) answer(g, false)
  avatarOf(g, 0).tapped = false
  const v2 = fetchToHand(g, 0, 'Simple Village')
  act(g, 0, { t: 'avatarSite', mode: 'play', cardId: v2, x: 3, y: 0 })
  if (g.prompts.length) answer(g, false)
  return g
}

describe('Part 1: ability validation anchors on the SOURCE (carried artifact → bearer)', () => {
  it('Love Potion charms an enemy at the BEARER\'s square, far from the avatar', () => {
    const g = board()
    // avatar of seat 0 is at (2,0). Put the bearer + potion + victim far away at (0,3).
    const bearer = summonCard(g, 0, 'Coy Nixie', 0, 3)
    const potion = giveArtifact(g, bearer, 'Love Potion')
    const victim = summonCard(g, 1, 'Foot Soldier', 0, 3)

    // sanity: the anchor for this artifact-sourced ability is the bearer, not the avatar
    const anchor = abilityAnchor(g, potion.id, 0)
    expect(anchor.id).toBe(bearer.id)
    expect(anchor.x).toBe(0)
    expect(anchor.y).toBe(3)

    // NEGATIVE CONTROL DOC: with the old avatar-anchor, `where:'here'` compares the
    // victim (0,3) against the avatar (2,0) and returns "Target must be here." —
    // the action would fail. Under the source anchor it succeeds and control flips.
    act(g, 0, { t: 'activate', sourceId: potion.id, ability: 'potion', targets: [victim.id] })
    expect(g.units[victim.id].controller).toBe(0)
    // the potion is sacrificed by the charm
    expect(g.artifacts[potion.id]).toBeUndefined()
  })

  it('Love Potion still REJECTS an enemy NOT at the bearer\'s square', () => {
    const g = board()
    const bearer = summonCard(g, 0, 'Coy Nixie', 0, 3)
    const potion = giveArtifact(g, bearer, 'Love Potion')
    const elsewhere = summonCard(g, 1, 'Foot Soldier', 4, 3) // not "here"
    const err = actFail(g, 0, { t: 'activate', sourceId: potion.id, ability: 'potion', targets: [elsewhere.id] })
    expect(err).toMatch(/here/i)
    expect(g.units[elsewhere.id].controller).toBe(1)
  })
})

describe('Part 1: site-sourced ability locality is enforced AT VALIDATION (not silent no-op)', () => {
  it('Floodplain overflow REJECTS a non-adjacent site instead of accepting-and-noop', () => {
    const g = board()
    const flood = placeSite(g, 0, 'Floodplain', 0, 3)
    const far = placeSite(g, 0, 'Rustic Village', 4, 0) // far away, not adjacent to (0,3)
    const err = actFail(g, 0, { t: 'activate', sourceId: flood.id, ability: 'overflow', targets: [far.id] })
    expect(err).toMatch(/adjacent/i)
    expect(g.sites[far.id].flooded).toBeFalsy()
  })

  it('Floodplain overflow ACCEPTS an adjacent site (anchored on the site, not the avatar)', () => {
    const g = board()
    const flood = placeSite(g, 0, 'Floodplain', 0, 3)
    const near = placeSite(g, 0, 'Rustic Village', 1, 3) // adjacent to (0,3)
    act(g, 0, { t: 'activate', sourceId: flood.id, ability: 'overflow', targets: [near.id] })
    expect(g.sites[near.id].flooded).toBe(true)
  })

  it('Sinkhole collapse REJECTS a non-nearby site instead of accepting-and-noop', () => {
    const g = board()
    const sink = placeSite(g, 0, 'Sinkhole', 0, 3)
    const far = placeSite(g, 0, 'Rustic Village', 4, 0) // not nearby
    const err = actFail(g, 0, { t: 'activate', sourceId: sink.id, ability: 'collapse', targets: [far.id] })
    expect(err).toMatch(/nearby/i)
    expect(g.sites[far.id].isRubble).toBe(false)
    expect(g.sites[sink.id].isRubble).toBe(false)
  })

  it('Sinkhole collapse ACCEPTS a nearby site and destroys both (anchored on the site)', () => {
    const g = board()
    const sink = placeSite(g, 0, 'Sinkhole', 0, 3)
    const near = placeSite(g, 0, 'Rustic Village', 1, 2) // diagonally nearby to (0,3)
    act(g, 0, { t: 'activate', sourceId: sink.id, ability: 'collapse', targets: [near.id] })
    // destroySite deletes the old site and drops fresh Rubble at each coordinate
    const rubbleAt = (x: number, y: number) => Object.values(g.sites).some((s) => s.x === x && s.y === y && s.isRubble)
    expect(rubbleAt(1, 2)).toBe(true) // the victim
    expect(rubbleAt(0, 3)).toBe(true) // Sinkhole sacrifices itself
  })
})
