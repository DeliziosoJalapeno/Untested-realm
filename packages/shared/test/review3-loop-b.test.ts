// Review 3, batch loop-b: THEIR_ISSUES_REPRO_LOOP.md #13–#24 (comparison with another engine).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, giveArtifact, act, answer, castMagic, waiveThreshold, defaultAnswer } from './helpers'
import { avatarOf, effAttack, type GameState, type PlayerId } from '../src'
import { sourceMana } from '../src/engine/turn'
import '../src/cards/scripts/index'

const live = (g: GameState, name: string) => Object.values(g.units).filter((u) => u.name === name)
function settle(g: GameState, seen: string[] = []): void {
  for (let i = 0; i < 30 && g.prompts.length; i++) { seen.push(g.prompts[0].kind); answer(g, defaultAnswer(g.prompts[0])) }
}
function groundArtifact(g: GameState, name: string, x: number, y: number, owner: PlayerId = 0): string {
  const cid = `ctest${g.nextId++}`
  g.cards[cid] = { id: cid, name, owner } as any
  const aid = `atest${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name, conjuredBy: owner, x, y, region: 'surface', carriedBy: null, tapped: false } as any
  return aid
}
function game(): GameState {
  const g = newGame(); keepBoth(g)
  // park both Avatars out of the way unless a test moves them
  const a0 = avatarOf(g, 0); a0.x = 0; a0.y = 3
  const a1 = avatarOf(g, 1); a1.x = 4; a1.y = 0
  return g
}

describe('LOOP #13 — a carried Blightstone disables the site its bearer stands on', () => {
  it('the opponent gets 1 mana, not 2', () => {
    const g = game()
    placeSite(g, 1, 'Valley', 1, 1)
    placeSite(g, 1, 'Stream', 2, 1)
    expect(sourceMana(g, 1), 'control: two sites → 2').toBe(2)
    const ghoul = summonCard(g, 0, 'Ghoul', 2, 1)
    giveArtifact(g, ghoul, 'Blightstone')
    expect(sourceMana(g, 1), 'the Stream under the carried Blightstone is disabled').toBe(1)
  })
})

describe('LOOP #14 — a broken Ward stops only the effect on the warded minion', () => {
  it('Grievous Insult on a warded Michael: ward breaks, no silence/tap, the spell is still drawn', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const lacuna = summonCard(g, 0, 'Lacuna Entity', 2, 2)
    const michael = summonCard(g, 1, 'Archangel Michael', 2, 2); michael.ward = true
    waiveThreshold(g, 0)
    const hand = g.players[0].hand.length
    castMagic(g, 0, 'Grievous Insult', { casterId: lacuna.id, targets: [michael.id] })
    settle(g)
    expect(michael.ward, 'the Ward broke').toBeFalsy()
    expect(michael.silenced, 'not silenced').toBeFalsy()
    expect(michael.tapped, 'not tapped').toBe(false)
    expect(g.players[0].hand.length, 'still drew a spell').toBe(hand + 1)
  })
})

describe("LOOP #15 — Accursed Albatross's curse respects regions", () => {
  it("kills the killer's surface allies nearby, not its burrowed ones", () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const attacker = summonCard(g, 0, 'Stygian Archers', 2, 2)
    attacker.modifiers.push({ kind: 'keyword', keyword: 'airborne' } as any)
    const alba = summonCard(g, 1, 'Accursed Albatross', 2, 2)
    const surfaceAlly = summonCard(g, 0, 'Ghoul', 2, 1)
    const burrowed = summonCard(g, 0, 'Root Spider', 2, 1, 'underground')
    act(g, 0, { t: 'moveAttack', unitId: attacker.id, path: [], attack: { unit: alba.id } })
    settle(g)
    expect(g.units[alba.id]).toBeUndefined()
    expect(g.units[surfaceAlly.id], 'the surface ally is cursed').toBeUndefined()
    expect(g.units[burrowed.id], 'the burrowed ally is in another region').toBeTruthy()
  })
})

describe('LOOP #16/#17 — Alabaster Box', () => {
  it('heals for a minion whose Deathrite returns it to hand', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const av = avatarOf(g, 0); av.x = 2; av.y = 2; av.life = 15
    giveArtifact(g, av, 'Alabaster Box')
    const archers = summonCard(g, 0, 'Stygian Archers', 2, 1)
    const tom = summonCard(g, 1, 'Sir Tom Thumb', 2, 1)
    act(g, 0, { t: 'moveAttack', unitId: archers.id, path: [], attack: { unit: tom.id } })
    settle(g)
    expect(g.units[tom.id], 'Sir Tom Thumb died').toBeUndefined()
    expect(g.players[1].hand.some((id) => g.cards[id].name === 'Sir Tom Thumb'), 'and returned to hand').toBe(true)
    expect(av.life, 'he died nearby: heal 1').toBe(16)
  })

  it("heals for its own bearer's death", () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const av = avatarOf(g, 0); av.life = 12
    const lich = summonCard(g, 0, 'Spire Lich', 2, 2)
    giveArtifact(g, lich, 'Alabaster Box')
    const drom = summonCard(g, 1, 'Raal Dromedary', 2, 1)
    act(g, 0, { t: 'moveAttack', unitId: lich.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: drom.id } })
    settle(g)
    expect(g.units[lich.id], 'the Lich died').toBeUndefined()
    expect(av.life, 'its bearer died on the Box’s square: heal 1').toBe(13)
  })
})

describe('LOOP #18 — an attacker killed on its own step does not attack', () => {
  it('Stygian Archers stepping into a Bottomless Pit: no attack, no Defend window', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Bottomless Pit', 2, 1)
    const enemyAv = avatarOf(g, 1); enemyAv.x = 2; enemyAv.y = 1
    const lifeBefore = enemyAv.life
    summonCard(g, 1, 'Ghoul', 2, 1) // an untapped would-be defender
    const archers = summonCard(g, 0, 'Stygian Archers', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: archers.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: enemyAv.id } })
    const seen: string[] = []
    settle(g, seen)
    expect(g.units[archers.id], 'the Archers died on the Pit').toBeUndefined()
    expect(seen, 'no Defend window for a dead attacker').not.toContain('defend')
    expect(enemyAv.life).toBe(lifeBefore)
  })

  it('Hellhounds moving onto an enemy Bottomless Pit: no intercept window', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Bottomless Pit', 2, 1)
    summonCard(g, 1, 'Hellhounds', 2, 1)
    const mine = summonCard(g, 0, 'Hellhounds', 2, 2)
    act(g, 0, { t: 'moveAttack', unitId: mine.id, path: [{ x: 2, y: 1, region: 'surface' }] })
    const seen: string[] = []
    settle(g, seen)
    expect(g.units[mine.id]).toBeUndefined()
    expect(seen).not.toContain('intercept')
  })
})

describe('LOOP #19 — Belfry does not untap allies in a nearby void', () => {
  it('untaps the Ghoul on the next site, not the Forsaken in the void', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 4, 2)
    groundArtifact(g, 'Belfry', 2, 2)
    const forsaken = summonCard(g, 0, 'Forsaken', 3, 2, 'void'); forsaken.tapped = true
    const ghoul = summonCard(g, 0, 'Ghoul', 2, 1); ghoul.tapped = true
    placeSite(g, 0, 'Rustic Village', 2, 1)
    act(g, 0, { t: 'endTurn' })
    settle(g)
    expect(ghoul.tapped, 'the Ghoul untaps').toBe(false)
    expect(forsaken.tapped, 'the Forsaken in the void stays tapped').toBe(true)
  })
})

describe('LOOP #20 — Blasphemy reaches carried artifacts and minions below the surface', () => {
  it('the Stag breaks its own Lance; the submerged Frog damages its Stream and taps', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Stream', 3, 2)
    const av = avatarOf(g, 0); av.life = 15
    const stag = summonCard(g, 0, 'Sacred Stag', 2, 2)
    const lance = giveArtifact(g, stag, 'Lance')
    const frog = summonCard(g, 1, 'Frog', 3, 2, 'underwater')
    waiveThreshold(g, 0)
    castMagic(g, 0, 'Blasphemy')
    settle(g)
    expect(g.artifacts[lance.id], 'the carried Lance is destroyed').toBeUndefined()
    expect(stag.tapped).toBe(true)
    expect(frog.tapped, 'the submerged Frog taps').toBe(true)
    expect(av.life, 'both of my sites take 1').toBe(13)
  })
})

describe('LOOP #21 — Bleeding Skull sees its own bearer die', () => {
  it('Redcap Powries holding the Skull die at end of turn → opponent loses 1', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const opp = avatarOf(g, 1); const before = opp.life!
    const redcaps = summonCard(g, 0, 'Redcap Powries', 2, 2)
    giveArtifact(g, redcaps, 'Bleeding Skull')
    act(g, 0, { t: 'endTurn' })
    settle(g)
    expect(g.units[redcaps.id], 'the Redcaps died').toBeUndefined()
    expect(opp.life).toBe(before - 1)
  })
})

describe('LOOP #22/#23 — Blunderbore', () => {
  it('banishes the victim when the Giant dies in the same fight', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 0, 'Rustic Village', 2, 1)
    const blunder = summonCard(g, 0, 'Blunderbore', 2, 2)
    const victim = summonCard(g, 1, 'Ghoul', 2, 2); victim.modifiers.push({ kind: 'power', amount: 2 } as any) // 5 power: a trade
    blunder.damage = 0
    act(g, 0, { t: 'moveAttack', unitId: blunder.id, path: [], attack: { unit: victim.id } })
    settle(g)
    expect(g.units[blunder.id], 'Blunderbore died').toBeUndefined()
    expect(g.units[victim.id], 'the victim died').toBeUndefined()
    expect(g.players[1].banished.includes(victim.cardId), 'the victim is banished').toBe(true)
    expect(g.players[1].cemetery.includes(victim.cardId)).toBe(false)
  })

  it('the reported board: Blunderbore attacks a Giant Shark in a Stream, 5 vs 5', () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Stream', 2, 1)
    const blunder = summonCard(g, 0, 'Blunderbore', 2, 2)
    const shark = summonCard(g, 1, 'Giant Shark', 2, 1)
    act(g, 0, { t: 'moveAttack', unitId: blunder.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: shark.id } })
    settle(g)
    expect(g.units[blunder.id], 'Blunderbore died').toBeUndefined()
    expect(g.units[shark.id], 'the Shark died').toBeUndefined()
    expect(g.players[1].banished.includes(shark.cardId), 'the Shark is banished').toBe(true)
  })

  it("banishes a victim whose Deathrite asks a question, and gains +1", () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const stag = summonCard(g, 0, 'Sacred Stag', 2, 2)
    const blunder = summonCard(g, 1, 'Blunderbore', 2, 1)
    act(g, 0, { t: 'moveAttack', unitId: stag.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: blunder.id } })
    settle(g)
    expect(g.units[stag.id], 'the Stag died').toBeUndefined()
    expect(g.players[0].banished.includes(stag.cardId), 'the Stag is banished').toBe(true)
    expect(g.players[0].cemetery.includes(stag.cardId)).toBe(false)
    expect(effAttack(g, g.units[blunder.id]), 'Blunderbore gains +1').toBe(6)
  })
})

describe('LOOP #24 — Crucifix stops an Evil token summoned to its location', () => {
  it("Noisome Twosome's Skeleton can't be summoned onto the Crucifix's square", () => {
    const g = game()
    placeSite(g, 0, 'Rustic Village', 2, 2)
    placeSite(g, 1, 'Rustic Village', 2, 1)
    const worm = summonCard(g, 0, 'Conqueror Worm', 2, 2)
    giveArtifact(g, worm, 'Crucifix')
    const twosome = summonCard(g, 1, 'Noisome Twosome', 2, 1)
    act(g, 0, { t: 'moveAttack', unitId: worm.id, path: [{ x: 2, y: 1, region: 'surface' }], attack: { unit: twosome.id } })
    settle(g)
    expect(g.units[twosome.id]).toBeUndefined()
    expect(live(g, 'Skeleton'), 'no Skeleton token at the Crucifix').toHaveLength(0)
  })
})
