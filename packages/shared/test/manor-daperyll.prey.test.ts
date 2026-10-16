import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, act, answer } from './helpers'
import { avatarOf, legalActions, type GameState } from '../src'
import '../src/cards/scripts/index'

// "(A)(A)(A)(A) — Once on your turn, this may deal 3 damage to target enemy here to heal you 3."
// With no enemy at the Manor there is no target, so the ability must not be offered: activating it
// anyway spent the once-per-turn, logged "3 damage to an enemy here → heal 3" and healed nobody —
// and the bot did exactly that every turn.
describe('The Manor at Daperyll Hill needs an enemy there', () => {
  function board(): { g: GameState; manorId: string } {
    const g = newGame(); keepBoth(g)
    const manor = placeSite(g, 0, 'The Manor at Daperyll Hill', 2, 2)
    for (let x = 0; x < 4; x++) placeSite(g, 0, 'Spire', x, 3) // (A)(A)(A)(A)
    return { g, manorId: manor.id }
  }
  const feast = (g: GameState) =>
    legalActions(g, 0).filter((a) => a.t === 'activate' && a.ability === 'feast')

  it('is not offered with no enemy at the Manor', () => {
    const { g } = board()
    summonCard(g, 0, 'Bone Jumble', 2, 2) // an ally there is not prey
    expect(feast(g)).toEqual([])
  })

  it('feeds on an enemy there and heals 3', () => {
    const { g, manorId } = board()
    const foe = summonCard(g, 1, 'Pudge Butcher', 2, 2)
    expect(feast(g)).toHaveLength(1)
    avatarOf(g, 0).life = 10
    act(g, 0, { t: 'activate', sourceId: manorId, ability: 'feast' })
    if (g.prompts.length) answer(g, [foe.id])
    expect(g.units[foe.id]?.damage ?? 3, 'the enemy took 3').toBe(3)
    expect(avatarOf(g, 0).life).toBe(13)
  })
})
