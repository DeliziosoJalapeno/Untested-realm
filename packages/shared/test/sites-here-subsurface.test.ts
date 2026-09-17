// A SITE's "here" covers its surface AND its subsurface — and the subsurface can be EITHER
// underground OR underwater (a land site can flood, a water site can be dried/buried), so these
// effects must reach a burrowed/submerged unit regardless of the subsurface label.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite } from './helpers'
import { getScript, makeCtx, killUnit, emitUnitEnters, type GameState, type Region } from '../src'
import '../src/cards/scripts/index'

describe("Standing Stones — 'Minions here are Spellcasters' reaches the subsurface", () => {
  for (const region of ['underground', 'underwater'] as Region[]) {
    it(`grants Spellcaster to a ${region} minion at the site`, () => {
      const g = newGame() as GameState; keepBoth(g)
      const site = placeSite(g, 0, 'Standing Stones', 2, 2)
      const sub = summonCard(g, 0, 'Bone Jumble', 2, 2, region); sub.enteredTurn = -1
      const far = summonCard(g, 0, 'Bone Jumble', 0, 0, region); far.enteredTurn = -1
      const f = getScript('Standing Stones')!.siteGrantsKeywords!
      expect(f(g, site, sub), `a ${region} minion here is a Spellcaster`).toContain('spellcaster')
      expect(f(g, site, far), 'a minion elsewhere is not').not.toContain('spellcaster')
    })
  }
})

describe('Temple of Moloch — a subsurface minion here may be sacrificed', () => {
  it('offers its sacrifice ability to a submerged minion', () => {
    const g = newGame() as GameState; keepBoth(g)
    g.activePlayer = 0
    const site = placeSite(g, 0, 'Temple of Moloch', 2, 2)
    const sub = summonCard(g, 0, 'Bone Jumble', 2, 2, 'underwater'); sub.enteredTurn = -1
    const abilities = getScript('Temple of Moloch')!.siteGrantsAbilities!(g, site, sub)
    expect(abilities.map((a) => a.key)).toContain('moloch:offer')
  })
})

describe("Planar Gate — 'Minions here' Voidwalk reaches the subsurface (not the void)", () => {
  for (const region of ['underground', 'underwater'] as Region[]) {
    it(`grants Voidwalk to a ${region} minion at the site`, () => {
      const g = newGame() as GameState; keepBoth(g)
      const site = placeSite(g, 0, 'Planar Gate', 2, 2)
      const sub = summonCard(g, 0, 'Bone Jumble', 2, 2, region); sub.enteredTurn = -1
      expect(getScript('Planar Gate')!.siteGrantsKeywords!(g, site, sub)).toContain('voidwalk')
    })
  }
})

describe('Dark Alley — a minion that submerges/burrows IN from outside gains Stealth', () => {
  it('grants Stealth to a minion entering the subsurface from an adjacent site', () => {
    const g = newGame() as GameState; keepBoth(g)
    const site = placeSite(g, 0, 'Dark Alley', 2, 2)
    const mover = summonCard(g, 1, 'Bone Jumble', 2, 2, 'underground'); mover.enteredTurn = g.turn
    // it walked in from the site at (3,2): from is OUTSIDE Dark Alley
    getScript('Dark Alley')!.onUnitEntersSquare!(makeCtx(g, site.id, 0, []), mover, { x: 3, y: 2, region: 'underground' })
    expect(mover.stealth, 'the minion slips into the shadows even underground').toBe(true)
  })

  it('grants Stealth to a minion SUMMONED (cast) directly into the subsurface — being summoned is entering', () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'Dark Alley', 2, 2)
    // a minion summoned burrowed AT Dark Alley (never moved in) — the real entry path fires
    // onUnitEntersSquare with an off-board `from`, which is "outside the site" → it enters here.
    const born = summonCard(g, 0, 'Bone Jumble', 2, 2, 'underground'); born.enteredTurn = g.turn
    emitUnitEnters(g, born)
    expect(born.stealth, 'a minion cast burrowed into the Alley still enters here → Stealth').toBe(true)
  })

  it('does NOT fire on an in-place region change (from the same site)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const site = placeSite(g, 0, 'Dark Alley', 2, 2)
    const mover = summonCard(g, 1, 'Bone Jumble', 2, 2, 'underground'); mover.enteredTurn = g.turn
    // surfaced in place: from is the SAME site → not "entering here"
    getScript('Dark Alley')!.onUnitEntersSquare!(makeCtx(g, site.id, 0, []), mover, { x: 2, y: 2, region: 'surface' })
    expect(mover.stealth ?? false, 'a same-site region change is not an entry').toBe(false)
  })
})

describe("Pilgrim's Shrine — a minion leaving the subsurface carries the Ward", () => {
  it('transfers the site Ward to a minion swimming away from the subsurface', () => {
    const g = newGame() as GameState; keepBoth(g)
    const site = placeSite(g, 0, "Pilgrim's Shrine", 2, 2)
    getScript("Pilgrim's Shrine")!.genesis!(makeCtx(g, site.id, 0, []))
    expect((site as any).ward, 'the shrine starts warded').toBe(true)
    // a non-Evil Mortal now at (3,2), having left the shrine's subsurface at (2,2)
    const leaver = summonCard(g, 0, 'Brother Knight', 3, 2, 'underground'); leaver.enteredTurn = -1
    getScript("Pilgrim's Shrine")!.onUnitEntersSquare!(makeCtx(g, site.id, 0, []), leaver, { x: 2, y: 2, region: 'underground' })
    expect(leaver.ward, 'the departing minion carries the blessing').toBe(true)
    expect((site as any).ward, 'the shrine gave up its Ward').toBe(false)
  })
})

describe('Troll Bridge — a lone enemy entering the subsurface is struck', () => {
  it('strikes an enemy that submerges in from outside (empty hand → no toll)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const site = placeSite(g, 0, 'Troll Bridge', 2, 2)
    g.players[1].hand = [] // no card to pay the toll → struck immediately
    const foe = summonCard(g, 1, 'Escyllion Cyclops', 2, 2, 'underwater'); foe.enteredTurn = g.turn // 6/6 survives 3
    // it legally lives underwater (else it would drown when checkStateBased runs mid-strike)
    foe.modifiers.push({ kind: 'keyword', keyword: 'submerge', duration: 'permanent', turn: g.turn, sourcePlayer: 1 })
    getScript('Troll Bridge')!.onUnitEntersSquare!(makeCtx(g, site.id, 0, []), foe, { x: 3, y: 2, region: 'underwater' })
    expect(g.units[foe.id]?.damage, 'the troll lashes a submerged intruder for 3').toBe(3)
  })
})

describe('The Geistwood — a minion dying in the subsurface still echoes its genesis', () => {
  it("re-fires a burrowed minion's genesis as a deathrite", () => {
    const g = newGame() as GameState; keepBoth(g)
    placeSite(g, 0, 'The Geistwood', 2, 2)
    // Stargazer's genesis draws a spell per minion in the void — put one there so the echo is observable
    summonCard(g, 1, 'Bone Jumble', 0, 0, 'void')
    const dier = summonCard(g, 0, 'Stargazer', 2, 2, 'underground'); dier.enteredTurn = -1
    const before = g.players[0].hand.length
    killUnit(g, dier.id)
    expect(g.players[0].hand.length, 'the dying burrowed Stargazer draws via the Geistwood echo').toBe(before + 1)
  })
})

describe('Wedding Hall — Arthur and Guinevere win even from the subsurface', () => {
  it('a submerged royal couple still triggers the wedding win', () => {
    const g = newGame() as GameState; keepBoth(g)
    const site = placeSite(g, 0, 'Wedding Hall', 2, 2)
    const arthur = summonCard(g, 0, 'Bone Jumble', 2, 2, 'underwater'); arthur.name = 'Arthur Pendragon'; arthur.enteredTurn = -1
    const guin = summonCard(g, 0, 'Bone Jumble', 2, 2, 'underwater'); guin.name = 'Guinevere'; guin.enteredTurn = -1
    getScript('Wedding Hall')!.startOfTurn!(makeCtx(g, site.id, 0, []))
    expect(g.winner, 'the realm is united even underwater').toBe(0)
  })
})
