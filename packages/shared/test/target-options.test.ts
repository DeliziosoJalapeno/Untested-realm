// Engine-authoritative legal-target sets (CardScript.targetOptions): the single source of truth for
// spatial / interdependent picks. castSpell must REJECT (not silently fizzle) a target the card's
// targetOptions wouldn't offer, and the set itself must match the card's rule — so the client can
// highlight exactly those and prevent an illegal click.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, fillSites, summonCard, castMagic, castMagicFail, waiveThreshold, act, actFail } from './helpers'
import { legalTargetOptions, getScript, avatarOf, siteAt, type GameState, type TargetRef } from '../src'
import '../src/cards/scripts/index'

const hasSquare = (opts: TargetRef[] | null, x: number, y: number) =>
  !!opts?.some((o) => 'square' in o && o.square.x === x && o.square.y === y)
const hasSite = (opts: TargetRef[] | null, id: string) =>
  !!opts?.some((o) => 'site' in o && o.site === id)

describe('Minor/Major Explosion: client-blockable step-range via targetOptions', () => {
  for (const name of ['Minor Explosion', 'Major Explosion']) {
    it(`${name}'s option set is exactly the squares ≤2 steps from the caster`, () => {
      const g = newGame(42, 0) as GameState; keepBoth(g); fillSites(g) // real steps need a site path
      const av = avatarOf(g, 0); av.x = 0; av.y = 0
      const opts = legalTargetOptions(g, getScript(name)!, av, [], 0)
      expect(hasSquare(opts, 2, 0), '2 steps away is in range').toBe(true)
      expect(hasSquare(opts, 0, 2), '2 steps away is in range').toBe(true)
      expect(hasSquare(opts, 2, 1), '3 steps away is out of range').toBe(false)
      expect(hasSquare(opts, 4, 0), '4 steps away is out of range').toBe(false)
    })

    it(`${name} refuses a cast on a too-far location (no wasted spell)`, () => {
      const g = newGame(42, 0) as GameState; keepBoth(g); waiveThreshold(g, 0)
      const av = avatarOf(g, 0); av.x = 0; av.y = 0
      const err = castMagicFail(g, 0, name, { targets: ['sq:4,0,surface'] }) // 4 steps away
      expect(err).toMatch(/not a legal target/i)
    })

    it(`${name} allows a cast within two steps`, () => {
      const g = newGame(42, 0) as GameState; keepBoth(g); fillSites(g); waiveThreshold(g, 0)
      const av = avatarOf(g, 0); av.x = 0; av.y = 0
      expect(() => castMagic(g, 0, name, { targets: ['sq:2,0,surface'] })).not.toThrow()
    })
  }
})

describe('Meteor Shower: the three impacts can never share a border', () => {
  it('each pick narrows the set to sites bordering no already-chosen impact', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const s00 = placeSite(g, 0, 'Rustic Village', 0, 0)
    const s10 = placeSite(g, 0, 'Rustic Village', 1, 0) // borders (0,0)
    const s20 = placeSite(g, 0, 'Rustic Village', 2, 0)
    const s40 = placeSite(g, 0, 'Rustic Village', 4, 0)
    const script = getScript('Meteor Shower')!
    // first pick: every site is fair game
    const first = legalTargetOptions(g, script, avatarOf(g, 0), [], 0)
    expect(hasSite(first, s10.id)).toBe(true)
    // after choosing (0,0), its bordering neighbour (1,0) drops out; distant sites remain
    const second = legalTargetOptions(g, script, avatarOf(g, 0), [{ site: s00.id }], 1)
    expect(hasSite(second, s10.id), 'a bordering site is no longer offered').toBe(false)
    expect(hasSite(second, s20.id), 'a non-bordering site stays').toBe(true)
    expect(hasSite(second, s40.id)).toBe(true)
    // after (0,0) and (2,0), the set excludes anything bordering either
    const third = legalTargetOptions(g, script, avatarOf(g, 0), [{ site: s00.id }, { site: s20.id }], 2)
    expect(hasSite(third, s10.id)).toBe(false)
    expect(hasSite(third, s40.id)).toBe(true)
  })

  it('refuses a cast whose impacts share a border', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g); waiveThreshold(g, 0)
    const s00 = placeSite(g, 0, 'Rustic Village', 0, 0)
    const s10 = placeSite(g, 0, 'Rustic Village', 1, 0) // borders (0,0)
    const s40 = placeSite(g, 0, 'Rustic Village', 4, 0)
    const err = castMagicFail(g, 0, 'Meteor Shower', { targets: [s00.id, s10.id, s40.id] })
    expect(err).toMatch(/not a legal target/i)
  })

  it('allows three mutually non-bordering impacts', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g); waiveThreshold(g, 0)
    const s00 = placeSite(g, 0, 'Rustic Village', 0, 0)
    const s20 = placeSite(g, 0, 'Rustic Village', 2, 0)
    const s40 = placeSite(g, 0, 'Rustic Village', 4, 0)
    expect(() => castMagic(g, 0, 'Meteor Shower', { targets: [s00.id, s20.id, s40.id] })).not.toThrow()
  })
})

describe('Other ≤N-steps magics are blockable too', () => {
  for (const name of ['Mortality', 'Exorcism', 'Unravel', 'Dispel', 'Disenchant']) {
    it(`${name} (square, ≤2 steps): set is ≤2 steps and a far cast is refused`, () => {
      const g = newGame(42, 0) as GameState; keepBoth(g); fillSites(g); waiveThreshold(g, 0)
      const av = avatarOf(g, 0); av.x = 0; av.y = 0
      const opts = legalTargetOptions(g, getScript(name)!, av, [], 0)
      expect(opts?.some((o) => 'square' in o && o.square.x === 2 && o.square.y === 0)).toBe(true)
      expect(opts?.some((o) => 'square' in o && o.square.x === 4 && o.square.y === 0)).toBe(false)
      expect(castMagicFail(g, 0, name, { targets: ['sq:4,0,surface'] })).toMatch(/not a legal target/i)
    })
  }

  for (const name of ['Extinguish', 'Stone Rain']) {
    it(`${name} (site, ≤2 steps): a site 3 steps away is not offered`, () => {
      const g = newGame(42, 0) as GameState; keepBoth(g); fillSites(g) // real steps need a site path
      const av = avatarOf(g, 0); av.x = 0; av.y = 0
      const near = siteAt(g, 2, 0)! // 2 steps
      const far = siteAt(g, 3, 1)!  // 4 steps (Manhattan on a void-free board)
      const opts = legalTargetOptions(g, getScript(name)!, av, [], 0)
      expect(opts?.some((o) => 'site' in o && o.site === near.id)).toBe(true)
      expect(opts?.some((o) => 'site' in o && o.site === far.id)).toBe(false)
    })
  }

  it('Boil offers ONLY water sites in range (its filter intersects the range)', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    placeSite(g, 0, 'Rustic Village', 1, 0) // in range, but NOT water
    const opts = legalTargetOptions(g, getScript('Boil')!, av, [], 0)
    expect(opts, 'a non-water site in range is not a Boil target').toEqual([])
  })

  it('Incinerate reaches locations near the caster OR an allied Dragon', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    const dragon = summonCard(g, 0, 'Ancient Dragon', 4, 0); dragon.enteredTurn = -1
    const opts = legalTargetOptions(g, getScript('Incinerate')!, av, [], 0)
    expect(opts?.some((o) => 'square' in o && o.square.x === 1 && o.square.y === 0), 'near the caster').toBe(true)
    expect(opts?.some((o) => 'square' in o && o.square.x === 3 && o.square.y === 0), 'near the Dragon').toBe(true)
    expect(opts?.some((o) => 'square' in o && o.square.x === 2 && o.square.y === 0), 'between, near neither').toBe(false)
    // sanity: with no allied Dragon, the far half of the board is unreachable
    const g2 = newGame(42, 0) as GameState; keepBoth(g2)
    const av2 = avatarOf(g2, 0); av2.x = 0; av2.y = 0
    const lone = legalTargetOptions(g2, getScript('Incinerate')!, av2, [], 0)
    expect(lone?.some((o) => 'square' in o && o.square.x === 3 && o.square.y === 0)).toBe(false)
  })
})

describe('Distance-limited ABILITIES are blockable (bombard / fling)', () => {
  it("Midland Army's bombard refuses a >3-step target but accepts one in range", () => {
    const g = newGame(42, 0) as GameState; keepBoth(g); fillSites(g)
    const army = summonCard(g, 0, 'Midland Army', 0, 0); army.enteredTurn = -1
    // validation happens before the tap cost, so the rejected shot leaves the army untapped
    expect(actFail(g, 0, { t: 'activate', sourceId: army.id, ability: 'bombard', targets: ['sq:4,3,surface'] }))
      .toMatch(/not a legal target/i)
    expect(() => act(g, 0, { t: 'activate', sourceId: army.id, ability: 'bombard', targets: ['sq:3,0,surface'] })).not.toThrow()
  })

  it("Corpse Catapult's fling set is every square ≤3 steps from its bearer", () => {
    const g = newGame(42, 0) as GameState; keepBoth(g); fillSites(g)
    const bearer = summonCard(g, 0, 'Foot Soldiers', 0, 0); bearer.enteredTurn = -1
    const opts = legalTargetOptions(g, getScript('Corpse Catapult')!, bearer, [], 0)
    expect(opts?.some((o) => 'square' in o && o.square.x === 3 && o.square.y === 0), '3 steps is in range').toBe(true)
    expect(opts?.some((o) => 'square' in o && o.square.x === 4 && o.square.y === 0), '4 steps is out').toBe(false)
  })
})

describe('"steps" are REAL steps between locations — the void is routed around, not crossed', () => {
  it('a Manhattan-2 target with a void between it and the caster is out of ≤2 range', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 0, 0) // caster site
    placeSite(g, 0, 'Rustic Village', 2, 0) // the target site; (1,0) is left as void
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    const opts = legalTargetOptions(g, getScript('Minor Explosion')!, av, [], 0)
    expect(hasSquare(opts, 2, 0), 'you cannot step through the void — the location is unreachable').toBe(false)
  })

  it('the void is at least a 4-step detour: a Manhattan-2 target reached only the long way is out of ≤2 range', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    // the only path from (0,0) to (2,0) skirts the void at (1,0): (0,0)->(0,1)->(1,1)->(2,1)->(2,0) = 4 steps
    for (const [x, y] of [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0]]) placeSite(g, 0, 'Rustic Village', x, y)
    const av = avatarOf(g, 0); av.x = 0; av.y = 0
    const opts = legalTargetOptions(g, getScript('Minor Explosion')!, av, [], 0)
    expect(hasSquare(opts, 1, 1), '2 real steps along the detour IS in range').toBe(true)
    expect(hasSquare(opts, 2, 0), 'the same square is 4 steps around the void — out of range').toBe(false)
  })
})
