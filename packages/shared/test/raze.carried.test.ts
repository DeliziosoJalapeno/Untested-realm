// Raze: "An ally destroys its site and all artifacts there." ALL artifacts — including ones CARRIED by a
// unit standing on the site (a carried artifact is located at its bearer's square). Bug: the `!a.carriedBy`
// guard skipped carried artifacts.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact } from './helpers'
import { makeCtx, getScript, type GameState } from '../src'

describe('Raze destroys carried artifacts too', () => {
  it('razes the site and every artifact there — loose AND carried', () => {
    const g: any = newGame(); keepBoth(g)
    const site = placeSite(g, 0, 'Hamlet', 2, 2)
    const ally = summonCard(g, 0, 'Foot Soldier', 2, 2); ally.enteredTurn = -1
    const carried = giveArtifact(g, ally, 'Poisonous Dagger') // carried by the ally, on the site
    const gc = `ctest${g.nextId++}`; g.cards[gc] = { id: gc, name: 'Poisonous Dagger', owner: 0 }
    const gid = `atest${g.nextId++}`
    g.artifacts[gid] = { id: gid, cardId: gc, name: 'Poisonous Dagger', conjuredBy: 0, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false }

    const ctx = makeCtx(g as GameState, g.players[0].avatarUnitId, 0, [{ unit: ally.id }])
    getScript('Raze')!.onCast!(ctx)

    expect(g.artifacts[carried.id], 'the carried artifact is destroyed').toBeUndefined()
    expect(g.artifacts[gid], 'the loose artifact is destroyed').toBeUndefined()
    expect(g.sites[site.id], 'the site is razed').toBeFalsy()
  })
})
