// Editor: hand a ground artifact / Monument (Makeshift Barricade, etc.) to the other player. A ground
// artifact's controller IS its conjurer; a carried one follows its bearer, so it's refused until dropped.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, giveArtifact } from './helpers'
import { applyAction, type GameState, type JudgeOp } from '../src'
import '../src/cards/scripts/index'

const judge = (g: GameState, op: JudgeOp) => {
  const r = applyAction(g, 0, { t: 'judge', op })
  return r.ok ? null : (r.error as string)
}

describe('editor: change a monument/artifact controller', () => {
  it('flips a ground Monument’s control to the other player', () => {
    const g = newGame() as GameState; keepBoth(g)
    expect(judge(g, { k: 'spawnArtifact', name: 'Makeshift Barricade', player: 0, x: 2, y: 2 })).toBeNull()
    const art = Object.values(g.artifacts).find((a) => a.name === 'Makeshift Barricade')!
    expect(art.conjuredBy, 'starts under player 0').toBe(0)
    expect(judge(g, { k: 'setArtifactController', artifactId: art.id, player: 1 })).toBeNull()
    expect(art.conjuredBy, 'now controlled by player 1').toBe(1)
  })

  it('refuses to retarget a carried artifact (its bearer controls it)', () => {
    const g = newGame() as GameState; keepBoth(g)
    const carrier = summonCard(g, 0, 'Foot Soldier', 2, 1)
    const art = giveArtifact(g, carrier, 'Onyx Core')
    expect(judge(g, { k: 'setArtifactController', artifactId: art.id, player: 1 })).toMatch(/carried|bearer|drop/i)
  })
})
