// Monuments AND Automatons are immovable artifacts — they can't be picked up or carried (rulebook).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, act, actFail } from './helpers'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

function groundArtifact(g: GameState, name: string, x: number, y: number, owner = 0): string {
  const cid = `ctest${g.nextId++}`; g.cards[cid] = { id: cid, name, owner } as any
  const aid = `atest${g.nextId++}`
  g.artifacts[aid] = { id: aid, cardId: cid, name, conjuredBy: owner, x, y, region: 'surface', carriedBy: null, tapped: false } as any
  return aid
}

describe('Monuments are immovable', () => {
  it('a Monument artifact cannot be picked up', () => {
    const g: GameState = newGame(); keepBoth(g)
    const u = summonCard(g, 0, 'Bone Jumble', 2, 2); u.enteredTurn = -5
    const mon = groundArtifact(g, 'Black Obelisk', 2, 2) // a Monument

    const err = actFail(g, 0, { t: 'pickUp', unitId: u.id, artifactIds: [mon] })
    expect(err, 'rejected — it can\'t be carried').toMatch(/can't be carried/)
    expect(g.artifacts[mon]?.carriedBy, 'still on the ground').toBeFalsy()
  })

  it('an Automaton artifact cannot be picked up either', () => {
    const g: GameState = newGame(); keepBoth(g)
    const u = summonCard(g, 0, 'Bone Jumble', 2, 2); u.enteredTurn = -5
    const bot = groundArtifact(g, 'Clay Golem', 2, 2) // an Automaton

    const err = actFail(g, 0, { t: 'pickUp', unitId: u.id, artifactIds: [bot] })
    expect(err, 'rejected — it can\'t be carried').toMatch(/can't be carried/)
    expect(g.artifacts[bot]?.carriedBy, 'still on the ground').toBeFalsy()
  })

  it('control: a normal artifact at the same spot CAN be picked up', () => {
    const g: GameState = newGame(); keepBoth(g)
    const u = summonCard(g, 0, 'Bone Jumble', 2, 2); u.enteredTurn = -5
    const art = groundArtifact(g, 'Poisonous Dagger', 2, 2)

    act(g, 0, { t: 'pickUp', unitId: u.id, artifactIds: [art] })
    expect(g.artifacts[art]?.carriedBy, 'now carried by the unit').toBe(u.id)
  })
})
