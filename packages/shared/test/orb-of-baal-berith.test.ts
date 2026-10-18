// Orb of Ba'al Berith: "The first time each turn a Magic spell is cast nearby, Orb of Ba'al Berith creates a
// copy. The spell's controller may choose new targets." An unpickable Monument — what counts is where the
// SPELLCASTER stands. FAQ: the Orb is the copy's spellcaster, the original caster controls the copy, X stays
// the same and is not paid again.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, castMagic, castMagicFail, waiveThreshold, answer, actFail } from './helpers'
import { avatarOf, canHandArtifactTo, type GameState, type PlayerId } from '../src'
import { getScript } from '../src/cards/scripts/registry'
import { makeCtx } from '../src/engine/effects'
import '../src/cards/scripts/index'

const ORB = { x: 2, y: 1 } // nearby = x 1..3, y 0..2

function board(orbOwner: PlayerId = 0): { g: GameState; orbId: string } {
  const g = newGame(42, 0); keepBoth(g)
  for (let x = 0; x <= 4; x++) for (let y = 0; y <= 3; y++) placeSite(g, 0, 'Active Volcano', x, y)
  waiveThreshold(g, 0)
  const cid = `corb${g.nextId++}`, orbId = `aorb${g.nextId++}`
  g.cards[cid] = { id: cid, name: "Orb of Ba'al Berith", owner: orbOwner }
  g.artifacts[orbId] = { id: orbId, cardId: cid, name: "Orb of Ba'al Berith", conjuredBy: orbOwner, x: ORB.x, y: ORB.y, region: 'surface', tapped: false } as any
  return { g, orbId }
}
const place = (g: GameState, x: number, y: number) => { const av = avatarOf(g, 0); av.x = x; av.y = y; return av }
const sq = (x: number, y: number) => `sq:${x},${y},surface`

describe("Orb of Ba'al Berith", () => {
  it('a caster nearby the Orb: the copy is cast BY the Orb, not put in hand, and picks its own target', () => {
    const { g } = board()
    place(g, 1, 2)
    const a = summonCard(g, 1, 'Bone Jumble', 4, 3), b = summonCard(g, 1, 'Bone Jumble', 0, 0)
    const handBefore = g.players[0].hand.length
    castMagic(g, 0, 'Lightning Bolt', { targets: [sq(4, 3)] })
    expect(g.units[a.id], 'the original bolt').toBeUndefined()
    expect(g.prompts[0]?.kind, 'the copy asks for a NEW target').toBe('chooseSquare')
    expect(g.prompts[0].player).toBe(0)
    answer(g, { x: 0, y: 0 })
    expect(g.units[b.id], 'the copy hit the new target').toBeUndefined()
    expect(g.players[0].hand.length, 'no copy left in hand').toBe(handBefore)
    expect(g.players[0].cemetery.filter((id) => g.cards[id].name === 'Lightning Bolt').length, 'the copy never reaches the cemetery').toBe(1)
  })

  it('a spell cast FAR from the Orb is not copied, even with another ally standing next to it', () => {
    const { g } = board()
    place(g, 0, 3)
    summonCard(g, 0, 'Bone Jumble', 2, 1)
    summonCard(g, 1, 'Bone Jumble', 4, 3)
    castMagic(g, 0, 'Lightning Bolt', { targets: [sq(4, 3)] })
    expect(g.prompts.length).toBe(0)
  })

  it('only the first Magic each turn', () => {
    const { g } = board()
    place(g, 1, 2)
    summonCard(g, 1, 'Bone Jumble', 4, 3)
    castMagic(g, 0, 'Lightning Bolt', { targets: [sq(4, 3)] })
    answer(g, { x: 0, y: 0 })
    castMagic(g, 0, 'Lightning Bolt', { targets: [sq(4, 3)] })
    expect(g.prompts.length, 'no second copy').toBe(0)
  })

  it("copies the OPPONENT's Orb too — the spell's controller controls the copy", () => {
    const { g } = board(1)
    place(g, 3, 0)
    const b = summonCard(g, 1, 'Bone Jumble', 0, 3)
    castMagic(g, 0, 'Lightning Bolt', { targets: [sq(4, 3)] })
    expect(g.prompts[0]?.player).toBe(0)
    answer(g, { x: 0, y: 3 })
    expect(g.units[b.id]).toBeUndefined()
  })

  it('a minion Spellcaster nearby triggers it', () => {
    const { g } = board()
    place(g, 0, 3)
    const wiz = summonCard(g, 0, 'Apprentice Wizard', 3, 2)
    summonCard(g, 1, 'Bone Jumble', 4, 3)
    castMagic(g, 0, 'Lightning Bolt', { targets: [sq(4, 3)], casterId: wiz.id })
    expect(g.prompts[0]?.kind).toBe('chooseSquare')
  })

  it('X stays the same and is not paid again (Arcane Barrage)', () => {
    const { g } = board()
    place(g, 1, 2)
    castMagic(g, 0, 'Arcane Barrage')
    answer(g, '2') // X = 2
    const manaAfterX = g.players[0].mana
    answer(g, 'n')
    expect(g.prompts[0]?.title, 'the copy goes straight to its direction').toMatch(/direction/)
    answer(g, 's')
    expect(g.players[0].mana, 'X not paid again').toBe(manaAfterX)
  })

  it('is a Monument: it can never be picked up', () => {
    const { g, orbId } = board()
    const av = place(g, ORB.x, ORB.y)
    actFail(g, 0, { t: 'pickUp', unitId: av.id, artifactIds: [orbId] } as any)
    expect(g.artifacts[orbId].carriedBy).toBeFalsy()
  })
  it('no effect carries a Monument: not handed over on cast, not Telekinesis, not Lord of Greed', () => {
    const { g, orbId } = board()
    const av = place(g, ORB.x, ORB.y)
    expect(canHandArtifactTo(g, 0, "Orb of Ba'al Berith", av), 'a Monument cast is never given to a unit').toBe(false)
    expect(castMagicFail(g, 0, 'Telekinesis', { targets: [orbId] }), 'Telekinesis').toMatch(/legal target/)
    const lord = summonCard(g, 0, 'Lord of Greed', 0, 3)
    getScript('Lord of Greed')!.endOfTurn!(makeCtx(g, lord.id, 0, []))
    expect(g.artifacts[orbId].carriedBy, 'Lord of Greed').toBeFalsy()
  })
})
