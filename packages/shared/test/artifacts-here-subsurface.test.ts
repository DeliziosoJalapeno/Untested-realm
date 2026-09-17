// An artifact occupies ONE location — its own square AND region — and (per the correction) an
// uncarried artifact/Monument can itself be BURIED or SUBMERGED, so its "here" is `art.region`, never
// a hardcoded surface. Region-scoped: Crucifix, Pendragon Banner, The Immortal Throne (+ Scarecrow,
// Shrine, Rolling Boulder use the same rule).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer } from './helpers'
import { getScript, makeCtx, avatarOf, unitsAt, type GameState, type Region } from '../src'
import '../src/cards/scripts/index'

function putArtifact(g: GameState, name: string, x: number, y: number, region: Region = 'surface'): string {
  const cardId = `ca${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: 0 }
  const id = `a${g.nextId++}`
  ;(g.artifacts as any)[id] = { id, cardId, name, conjuredBy: 0, x, y, region, carriedBy: null, tapped: false }
  return id
}
const burrow = (g: GameState, u: any) =>
  u.modifiers.push({ kind: 'keyword', keyword: 'burrowing', duration: 'permanent', turn: g.turn, sourcePlayer: u.controller })

describe('Crucifix returns Evil minions in its own region only', () => {
  it('bounces a co-located surface Evil minion but not a burrowed one', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const id = putArtifact(g, 'Crucifix', 2, 2) // ground → surface
    const surfaceEvil = summonCard(g, 1, 'Bone Jumble', 2, 2); surfaceEvil.enteredTurn = -1 // Undead
    const buriedEvil = summonCard(g, 1, 'Bone Jumble', 2, 2, 'underground'); buriedEvil.enteredTurn = -1; burrow(g, buriedEvil)

    getScript('Crucifix')!.genesis!(makeCtx(g, id, 0, []))
    expect(g.units[surfaceEvil.id], 'the surface Evil minion is returned to hand').toBeUndefined()
    expect(g.units[buriedEvil.id], 'the burrowed Evil minion below is untouched').toBeTruthy()
  })
})

describe("Pendragon Banner ignores enemies in other regions", () => {
  const power = (g: GameState, id: string, u: any) => getScript('Pendragon Banner')!.artifactGrantsPower!(g, id, u)

  it('a burrowed enemy under the Banner does not switch off the +1', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const id = putArtifact(g, 'Pendragon Banner', 2, 2)
    const ally = summonCard(g, 0, 'Bone Jumble', 2, 3); ally.enteredTurn = -1 // nearby ally
    expect(power(g, id, ally), 'no enemies here → +1').toBe(1)

    const buriedFoe = summonCard(g, 1, 'Bone Jumble', 2, 2, 'underground'); buriedFoe.enteredTurn = -1; burrow(g, buriedFoe)
    expect(power(g, id, ally), 'a burrowed enemy is not "here" → still +1').toBe(1)

    summonCard(g, 1, 'Bone Jumble', 2, 2).enteredTurn = -1 // a SURFACE enemy here
    expect(power(g, id, ally), 'a surface enemy here switches it off').toBe(0)
  })
})

describe('Pile of Skulls summons its Skeleton to its own region ("here")', () => {
  it('a surface Pile drops a Skeleton on the surface', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const id = putArtifact(g, 'Pile of Skulls', 2, 2, 'surface')
    const dead = `dead${g.nextId++}`; g.cards[dead] = { id: dead, name: 'Bone Jumble', owner: 0 }
    g.players[0].cemetery.push(dead)
    getScript('Pile of Skulls')!.conts!.stack(makeCtx(g, id, 0, []), {}, 'yours')
    answer(g, [0]) // choose which dead card to banish → summons the Skeleton
    expect(unitsAt(g, 2, 2, 'surface').some((u) => u.name === 'Skeleton'), 'a Skeleton stands on the surface').toBe(true)
  })

  it('a SUBMERGED Pile summons "here" underwater — it does not appear on the surface', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Croaking Swamp', 2, 2) // water site
    const id = putArtifact(g, 'Pile of Skulls', 2, 2, 'underwater')
    const dead = `dead${g.nextId++}`; g.cards[dead] = { id: dead, name: 'Bone Jumble', owner: 0 }
    g.players[0].cemetery.push(dead)
    getScript('Pile of Skulls')!.conts!.stack(makeCtx(g, id, 0, []), {}, 'yours')
    answer(g, [0]) // choose which dead card to banish → summons the Skeleton (into the underwater layer)
    // the Skeleton (no Submerge) is summoned into the Pile's underwater layer and drowns via state-based
    // rules — the point is it was NOT placed on the surface
    expect(unitsAt(g, 2, 2, 'surface').some((u) => u.name === 'Skeleton'), 'no Skeleton on the surface').toBe(false)
  })
})

describe('The Immortal Throne wins only from its own location', () => {
  it('a surface avatar does NOT win under a submerged Throne, but does under a surface one', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Croaking Swamp', 2, 2) // water site so the Throne can be submerged there
    const sunk = putArtifact(g, 'The Immortal Throne', 2, 2, 'underwater')
    ;(g.artifacts as any)[sunk].counters = { level: 8 }
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; av.region = 'surface'

    getScript('The Immortal Throne')!.endOfEveryTurn!(makeCtx(g, sunk, 0, []))
    expect(g.winner ?? null, 'an avatar on the surface is not "on" the submerged Throne').toBeNull()

    const g2 = newGame() as GameState; keepBoth(g2)
    placeSite(g2, 0, 'Rustic Village', 2, 2)
    const throne = putArtifact(g2, 'The Immortal Throne', 2, 2, 'surface')
    ;(g2.artifacts as any)[throne].counters = { level: 8 }
    const av2 = avatarOf(g2, 0); av2.x = 2; av2.y = 2; av2.region = 'surface'
    getScript('The Immortal Throne')!.endOfEveryTurn!(makeCtx(g2, throne, 0, []))
    expect(g2.winner, 'a lone avatar on the surface Throne wins').toBe(av2.controller)
  })
})
