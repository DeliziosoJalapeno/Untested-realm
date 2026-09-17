// Snowball's path includes the caster's OWN square, so an enemy co-located with the caster (the
// projectile's STARTING location) is swept up and counted in the damage — it was excluded before
// (the path started one square beyond the caster).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, giveMana, waiveThreshold, answer } from './helpers'
import { avatarOf } from '../src'

describe('Snowball', () => {
  it('sweeps up an enemy at the caster’s square (starting location) and counts it', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    for (const x of [0, 1, 2]) placeSite(g, 0, 'Rustic Village', x, 0)
    const A = summonCard(g, 1, 'Stygian Archers', 0, 0, 'surface') // enemy AT the caster's square
    const B = summonCard(g, 1, 'Stygian Archers', 1, 0, 'surface') // enemy further along the path
    castMagic(g, 0, 'Snowball'); answer(g, 'e')
    // both are packed onto the stop (2,0); the snowball holds 2 units → 2 damage each
    expect([g.units[A.id]?.x, g.units[A.id]?.y], 'starting-location enemy rolled to the stop').toEqual([2, 0])
    expect(g.units[A.id]?.damage, 'and was counted (2 in the ball → 2 damage)').toBe(2)
    expect(g.units[B.id]?.damage).toBe(2)
    // the caster is never picked up or counted
    expect([av.x, av.y]).toEqual([0, 0])
  })

  it('drops units that can’t enter a site on the path (Bailey) — they stop short and take no damage', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    for (const x of [0, 1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 0)
    // enemy (player 1) Bailey on the final site (3,0): player-0 ground units may not enter it
    const bcard = `ctest${g.nextId++}`; g.cards[bcard] = { id: bcard, name: 'Bailey', owner: 1 }
    const baid = `atest${g.nextId++}`
    g.artifacts[baid] = { id: baid, cardId: bcard, name: 'Bailey', conjuredBy: 1, x: 3, y: 0, region: 'surface', carriedBy: null, tapped: false }
    const F1 = summonCard(g, 0, 'Foot Soldier', 1, 0, 'surface')
    const F2 = summonCard(g, 0, 'Foot Soldier', 1, 0, 'surface')

    castMagic(g, 0, 'Snowball'); answer(g, 'e')

    // rolled one square (1,0)→(2,0), then blocked from the Bailey at (3,0) → dropped there
    expect([g.units[F1.id]?.x, g.units[F1.id]?.y], 'stopped one square before the Bailey').toEqual([2, 0])
    expect([g.units[F2.id]?.x, g.units[F2.id]?.y]).toEqual([2, 0])
    // they left the snowball → not packed onto the stop → took no damage (still alive as 1/1s)
    expect(g.units[F1.id]?.damage, 'no snowball damage').toBe(0)
    expect(g.units[F2.id]?.damage).toBe(0)
    // nothing reached the Bailey square
    expect(Object.values(g.units).filter((u: any) => u.x === 3 && u.y === 0).length, 'no unit entered the Bailey').toBe(0)
  })

  it('hands the direction prompt each direction’s reachable site-lane (conveyor preview)', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 1; av.y = 1
    for (const x of [0, 1, 2, 3]) placeSite(g, 0, 'Rustic Village', x, 1) // a horizontal strip only
    castMagic(g, 0, 'Snowball') // opens the direction prompt (unanswered)
    const pr = g.prompts[0]
    expect(pr?.kind).toBe('chooseOption')
    expect(pr.data.from, 'origin square for the belt').toEqual({ x: 1, y: 1 })
    expect(pr.data.dirs.e, 'east: sites until the void').toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }])
    expect(pr.data.dirs.w, 'west: sites until the edge').toEqual([{ x: 1, y: 1 }, { x: 0, y: 1 }])
    expect(pr.data.dirs.n, 'north: no site → stops at the source').toEqual([{ x: 1, y: 1 }])
    expect(pr.data.dirs.s).toEqual([{ x: 1, y: 1 }])
  })

  it('stops before a projectile-blocking site (Impenetrable Copse) — roll and arrows agree', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 0; av.y = 1
    placeSite(g, 0, 'Rustic Village', 0, 1)
    placeSite(g, 0, 'Rustic Village', 1, 1)
    placeSite(g, 0, 'Impenetrable Copse', 2, 1) // projectiles can't enter this from outside
    const behind = summonCard(g, 1, 'Stygian Archers', 2, 1) // an enemy sheltering on the cover

    castMagic(g, 0, 'Snowball')
    expect(g.prompts[0].data.dirs.e, 'the east lane stops BEFORE the Copse').toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }])
    answer(g, 'e')

    expect([g.units[behind.id]?.x, g.units[behind.id]?.y], 'the sheltered enemy was not swept up').toEqual([2, 1])
    expect(g.units[behind.id]?.damage ?? 0, 'and took no snowball damage').toBe(0)
  })

  it('the direction arrows are attached to ANY cardinal prompt, no per-card wiring (e.g. Lava Flow)', () => {
    const g: any = newGame(); keepBoth(g); giveMana(g, 0, 20); waiveThreshold(g, 0)
    const av = avatarOf(g, 0); av.x = 1; av.y = 1
    for (const x of [0, 1, 2]) placeSite(g, 0, 'Rustic Village', x, 1)
    castMagic(g, 0, 'Lava Flow')
    const pr = g.prompts[0]
    expect(pr.kind).toBe('chooseOption')
    expect(pr.data.dirs, 'lanes attached generically').toBeTruthy()
    expect(pr.data.from, 'origin = the caster square').toEqual({ x: 1, y: 1 })
    expect(pr.data.element, 'coloured by the spell element').toBeTruthy()
  })
})
