// Just a Rock: "May be cast into the hands of any unit already carrying an artifact to banish that artifact."
// — ANY unit, an enemy's included, as long as it already carries an artifact.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, injectToHand, giveArtifact, waiveThreshold } from './helpers'
import { applyAction, avatarOf, artifactCastPlacements, type GameState } from '../src'
import '../src/cards/scripts/index'

function board(): { g: GameState; rock: string } {
  const g = newGame(42, 0); keepBoth(g)
  for (let x = 0; x <= 4; x++) for (let y = 0; y <= 3; y++) placeSite(g, 0, 'Active Volcano', x, y)
  waiveThreshold(g, 0)
  g.players[0].mana = 10
  return { g, rock: injectToHand(g, 0, 'Just a Rock') }
}

describe('Just a Rock', () => {
  it("can be cast into an ENEMY's hands when it carries an artifact — banishing that artifact", () => {
    const { g, rock } = board()
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2)
    const loot = giveArtifact(g, foe, 'Toolbox')
    expect(artifactCastPlacements(g, 0, 'Just a Rock').giveTo).toContain(foe.id)
    const r = applyAction(g, 0, { t: 'castSpell', cardId: rock, casterId: avatarOf(g, 0).id, extra: { giveTo: foe.id } } as any)
    expect(r.ok, String(r.error)).toBe(true)
    expect(g.artifacts[loot.id], 'the carried artifact is gone').toBeUndefined()
    expect(g.players[g.cards[loot.cardId].owner].banished).toContain(loot.cardId)
  })

  it('cannot be cast into the hands of an enemy carrying nothing', () => {
    const { g, rock } = board()
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2)
    expect(artifactCastPlacements(g, 0, 'Just a Rock').giveTo).not.toContain(foe.id)
    const r = applyAction(g, 0, { t: 'castSpell', cardId: rock, casterId: avatarOf(g, 0).id, extra: { giveTo: foe.id } } as any)
    expect(r.ok).toBe(false)
  })

  it('an ordinary artifact still may not be handed to an enemy', () => {
    const { g } = board()
    const foe = summonCard(g, 1, 'Bone Jumble', 2, 2)
    giveArtifact(g, foe, 'Toolbox')
    expect(artifactCastPlacements(g, 0, 'Toolbox').giveTo).not.toContain(foe.id)
  })
})
