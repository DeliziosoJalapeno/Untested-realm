// Quarrelsome Kobolds strike "themselves or another target adjacent unit" at end of turn. That
// includes a unit sharing the Kobolds' OWN square (an enemy standing on the same site), not just
// the four orthogonally-adjacent squares.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, act } from './helpers'
import { applyAction, type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Quarrelsome Kobolds', () => {
  it('can strike an enemy co-located on its own square', () => {
    const g: GameState = newGame(); keepBoth(g)
    const kob = summonCard(g, 0, 'Quarrelsome Kobolds', 2, 2)
    kob.tapped = false
    const enemy = summonCard(g, 1, 'Foot Soldier', 2, 2) // SAME square as the Kobolds

    act(g, 0, { t: 'endTurn' }) // fires the end-of-your-turn squabble

    const pr = g.prompts.find((p: any) => p.kind === 'chooseTargets' && (p.data?.candidates ?? []).includes(kob.id))
    expect(pr, 'the squabble prompt is up').toBeTruthy()
    expect((pr!.data as any).candidates, 'the co-located enemy is a valid target').toContain(enemy.id)

    applyAction(g, pr!.player, { t: 'prompt', promptId: pr!.id, choice: [enemy.id] })
    expect(g.units[enemy.id], 'the co-located enemy was struck (2 dmg kills the 1/1 Foot Soldier)').toBeUndefined()
  })
})
