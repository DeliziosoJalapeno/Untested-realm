// Rulebook, "Controlling Artifacts": carried artifacts are controlled by the bearer's controller; artifacts
// that COULD be carried but aren't are UNCONTROLLED; Monuments/Automatons are controlled by their conjurer.
// An uncontrolled artifact benefits nobody: no mana, no affinity, no "you" effects, no abilities. Only
// effects that name no player (Thumb Screws, Doomsday Device…) keep working on the ground.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, castMagic, waiveThreshold } from './helpers'
import { artifactController, affinity, killUnit, avatarOf, type GameState } from '../src'
import { canActivate } from '../src/engine/game'
import { beginTurn, endTurn } from '../src/engine/turn'
import '../src/cards/scripts/index'

function groundArtifact(g: GameState, name: string, x: number, y: number, conjuredBy: 0 | 1 = 0): string {
  const cid = `ctest${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner: conjuredBy } as any
  const aid = `atest${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name, conjuredBy, x, y, region: 'surface', carriedBy: null, tapped: false }
  return aid
}

describe('who controls an artifact', () => {
  it('carried → bearer; carriable on the ground → nobody; Monument → its conjurer', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const ground = groundArtifact(g, 'Amethyst Core', 2, 2)
    expect(artifactController(g, g.artifacts[ground])).toBeNull()
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2)
    const carried = giveArtifact(g, foe, 'Ruby Core')
    expect(artifactController(g, carried), "the bearer's controller, whoever conjured it").toBe(1)
    const monument = groundArtifact(g, 'Bailey', 2, 2)
    expect(artifactController(g, g.artifacts[monument])).toBe(0)
  })
})

describe('an uncontrolled artifact benefits nobody', () => {
  it('a Core on the ground provides no mana and no affinity; carried, it does', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const core = groundArtifact(g, 'Amethyst Core', 2, 2)
    const air = affinity(g, 0).air
    endTurn(g); beginTurn(g, 0)
    const ground = g.players[0].mana
    expect(affinity(g, 0).air, 'no affinity from a ground Core').toBe(air)

    const bearer = summonCard(g, 0, 'Bone Jumble', 2, 2)
    g.artifacts[core].carriedBy = bearer.id; bearer.carrying.push(core)
    expect(affinity(g, 0).air, 'carried → its controller gets the affinity').toBe(air + 1)
    endTurn(g); beginTurn(g, 0)
    expect(g.players[0].mana, 'carried → +1 mana').toBe(ground + 1)
  })

  it('a Core conjured onto the ground gives no mana on entry', () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 3)
    const before = g.players[0].mana + 20 // castMagic adds 20; the Core costs its mana cost
    castMagic(g, 0, 'Amethyst Core', { at: { x: 2, y: 3 } })
    const art = Object.values(g.artifacts).find((a) => a.name === 'Amethyst Core')!
    expect(art.carriedBy).toBeNull()
    expect(g.players[0].mana, 'only the cost (1) was paid — no mana provided').toBe(before - 1)
  })

  it("an uncontrolled artifact's ability can't be used — by its conjurer either", () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const coin = groundArtifact(g, "Ferryman's Coin", 2, 2)
    expect(canActivate(g, 0, coin, 'toll')).toMatch(/do not control/)
  })

  it('a "your opponent" trigger (Bleeding Skull) does nothing while uncontrolled', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    groundArtifact(g, 'Bleeding Skull', 2, 2)
    const victim = summonCard(g, 1, 'Bone Jumble', 2, 2)
    const life = (p: 0 | 1) => avatarOf(g, p).life
    const before = [life(0), life(1)]
    killUnit(g, victim.id)
    expect([life(0), life(1)]).toEqual(before)
  })

  it('an effect that names no player (Thumb Screws) still works on the ground', () => {
    const g = newGame() as GameState; keepBoth(g); waiveThreshold(g, 0)
    const av = g.units[g.players[0].avatarUnitId]
    placeSite(g, 0, 'Rustic Village', av.x, av.y)
    groundArtifact(g, 'Thumb Screws', av.x, av.y, 1)
    const life = av.life!
    castMagic(g, 0, 'Return to Nature')
    expect(av.life, 'the nearby Avatar casting a spell loses 1').toBe(life - 1)
  })
})
