// Sir Balin: "Whenever Sir Balin strikes an Avatar, destroy that Avatar's site then burrow other
// minions and artifacts there." Reported bug: he buried only LOOSE artifacts (`!carriedBy`) — a
// CARRIED artifact was left on the surface. He now uses the same burrow as Cave-In
// (burrowOccupantsAt): an artifact carried by an unburiable bearer (the Avatar) is detached and
// buried on its own, and loose artifacts are buried too. Order is destroy-THEN-burrow: if the
// destruction leaves flooded ruins (The Flood), you can't burrow into water and nothing sinks.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, giveArtifact } from './helpers'
import { makeCtx } from '../src/engine/effects'
import { getScript } from '../src/cards/scripts/registry'
import '../src/cards/scripts/index'

function balinStrikes(g: any, balin: any, avatar: any): void {
  const ctx = makeCtx(g, balin.id, 0, [])
  getScript('Sir Balin')!.onAllyStrikesAvatar!(ctx, balin, avatar)
}

describe('Sir Balin burrows carried artifacts', () => {
  it("buries the avatar's CARRIED artifact (detached) and loose ones, sparing himself and the avatar", () => {
    const g: any = newGame(); keepBoth(g); g.turn = 3
    const avatar = g.units[g.players[1].avatarUnitId]
    avatar.x = 2; avatar.y = 2; avatar.region = 'surface'
    placeSite(g, 1, 'Rustic Village', 2, 2) // the avatar's (land) site

    const balin = summonCard(g, 0, 'Sir Balin', 2, 2); balin.enteredTurn = -1
    const carried = giveArtifact(g, avatar, 'Flaming Sword') // carried by the avatar (unburiable bearer)

    // a loose ground artifact on the same square
    const lcard = `cL${g.nextId++}`; g.cards[lcard] = { id: lcard, name: 'Bailey', owner: 1 }
    const loose = `aL${g.nextId++}`
    g.artifacts[loose] = { id: loose, cardId: lcard, name: 'Bailey', conjuredBy: 1, x: 2, y: 2, region: 'surface', carriedBy: null, tapped: false }

    balinStrikes(g, balin, avatar)

    expect(Object.values(g.sites).some((s: any) => s.x === 2 && s.y === 2 && s.isRubble), 'site reduced to rubble').toBe(true)
    expect(g.artifacts[carried.id].region, 'the CARRIED artifact was burrowed (the bug)').toBe('underground')
    expect(g.artifacts[carried.id].carriedBy ?? null, 'and detached from the avatar').toBeNull()
    expect(g.artifacts[loose].region, 'the loose artifact is buried too').toBe('underground')
    expect(g.units[avatar.id].region, 'the avatar itself stays on the surface').toBe('surface')
    expect(g.units[balin.id].region, 'Balin spares himself').toBe('surface')
  })

  it('fails to burrow into FLOODED ruins — nothing sinks when the realm is flooded', () => {
    const g: any = newGame(); keepBoth(g); g.turn = 3
    g.flow = g.flow ?? {}; g.flow.realmFlooded = true // The Flood is in play → destroyed sites leave flooded ruins
    const avatar = g.units[g.players[1].avatarUnitId]
    avatar.x = 2; avatar.y = 2; avatar.region = 'surface'
    placeSite(g, 1, 'Rustic Village', 2, 2)

    const balin = summonCard(g, 0, 'Sir Balin', 2, 2); balin.enteredTurn = -1
    const carried = giveArtifact(g, avatar, 'Flaming Sword')

    balinStrikes(g, balin, avatar)

    expect(Object.values(g.sites).some((s: any) => s.x === 2 && s.y === 2 && s.isRubble && s.flooded), 'ruins are flooded').toBe(true)
    expect(g.artifacts[carried.id].region, 'no burrow into water — artifact stays up top').toBe('surface')
    expect(g.artifacts[carried.id].carriedBy, 'still carried by the avatar').toBe(avatar.id)
  })
})
