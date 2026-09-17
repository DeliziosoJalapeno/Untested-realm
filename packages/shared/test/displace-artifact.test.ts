// Displace ("Teleport target minion, artifact, or aura one diagonal step") can target an artifact —
// including a CARRIED one, which rides its bearer's square. Displacing it moves it a diagonal step and,
// since it no longer shares the bearer's square, it is DROPPED at the destination site.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, giveMana, waiveThreshold, placeSite, summonCard, giveArtifact, castMagic, answer } from './helpers'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('Displace targets artifacts', () => {
  it('displaces a CARRIED artifact one diagonal and drops it off the carrier', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 2)  // carrier's square
    const dest = placeSite(g, 0, 'Rustic Village', 3, 3)  // the diagonal destination
    const carrier = summonCard(g, 0, 'Bone Jumble', 2, 2); carrier.enteredTurn = -1
    const art = giveArtifact(g, carrier, 'Poisonous Dagger')
    expect(art.carriedBy).toBe(carrier.id)

    castMagic(g, 0, 'Displace', { targets: [art.id] })
    if (g.prompts.length) answer(g, dest.id) // (single diagonal site may auto-resolve)

    expect(g.artifacts[art.id].x).toBe(3)
    expect(g.artifacts[art.id].y).toBe(3)
    expect(g.artifacts[art.id].carriedBy, 'dropped — no longer carried').toBeFalsy()
    expect(carrier.carrying, 'carrier no longer holds it').not.toContain(art.id)
  })

  it('displaces an aura one diagonal (shifts its footprint)', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const dest = placeSite(g, 0, 'Rustic Village', 3, 3)
    const aid = `r${g.nextId++}`
    const acid = `cr${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Wildfire', owner: 0 }
    ;(g.auras as any)[aid] = { id: aid, cardId: acid, name: 'Wildfire', controller: 0, squares: [{ x: 2, y: 2 }], enteredTurn: 0 }

    castMagic(g, 0, 'Displace', { targets: [aid] })
    if (g.prompts.length) answer(g, dest.id)

    expect(g.auras[aid].squares).toEqual([{ x: 3, y: 3 }])
  })

  it('displaces a 2x2 aura to a diagonal INTERSECTION (shifts the whole footprint)', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const aid = `r${g.nextId++}`
    const acid = `cb${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Blizzard', owner: 0 }
    ;(g.auras as any)[aid] = { id: aid, cardId: acid, name: 'Blizzard', controller: 0, anchor: { x: 2, y: 2 }, squares: [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }] }

    castMagic(g, 0, 'Displace', { targets: [aid] })
    // an area2x2 intersection prompt with the diagonal anchors — step to the (1,1) intersection
    expect(g.prompts[0]?.data?.area2x2, 'intersection (area2x2) destination prompt').toBe(true)
    answer(g, { x: 1, y: 1 })

    // aura2x2Squares((1,1)) = (1,1),(2,1),(1,2),(2,2)
    expect(g.auras[aid].squares).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }])
  })

  it('displaces a WALL to a nearby site border', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 3, 2)
    const aid = `r${g.nextId++}`
    const acid = `cw${g.nextId++}`; g.cards[acid] = { id: acid, name: 'Wall of Fire', owner: 0 }
    ;(g.auras as any)[aid] = { id: aid, cardId: acid, name: 'Wall of Fire', controller: 0, edge: { a: { x: 2, y: 2 }, b: { x: 3, y: 2 } } }

    castMagic(g, 0, 'Displace', { targets: [aid] })
    const edges = g.prompts[0]?.data?.edges as { key: string; a: any; b: any }[]
    expect(g.prompts[0]?.data?.edgeSelect, 'wall-border destination prompt').toBe(true)
    expect(edges?.length, 'offers candidate borders').toBeGreaterThan(0)
    const pick = edges[0]
    answer(g, pick.key)

    const keyOf = (e: any) => [Math.min(e.a.x, e.b.x), Math.min(e.a.y, e.b.y), Math.max(e.a.x, e.b.x), Math.max(e.a.y, e.b.y)].join(',')
    expect(keyOf(g.auras[aid].edge), 'the wall moved to the chosen border').toBe(pick.key)
  })

  it('still displaces a minion one diagonal (unchanged)', () => {
    const g: GameState = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const dest = placeSite(g, 0, 'Rustic Village', 3, 3)
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2); foe.enteredTurn = -1

    castMagic(g, 0, 'Displace', { targets: [foe.id] })
    if (g.prompts.length) answer(g, dest.id)

    expect(g.units[foe.id].x).toBe(3)
    expect(g.units[foe.id].y).toBe(3)
  })
})
