// Deathspeaker's once-per-turn use is spent only when the echo actually SUMMONS — so the player can
// back out of the intermediate prompts (which minion / where / genesis target) without wasting the turn.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, act, answer } from './helpers'
import { avatarOf, canActivate } from '../src'
import '../src/cards/scripts/index'

function drain(g: any) {
  let guard = 0
  while (g.prompts.length && guard++ < 40) {
    const p: any = g.prompts[0]
    if (p.kind === 'chooseOption') answer(g, p.data.options[0])
    else if (p.kind === 'chooseSquare') answer(g, p.data.squares[0])
    else if (p.kind === 'chooseTargets') answer(g, [p.data.candidates[0]])
    else answer(g, true)
  }
}

describe('Deathspeaker: once-per-turn is spent on the summon, not on activation', () => {
  it('activating opens the prompt WITHOUT spending the turn; completing spends it', () => {
    const g = newGame(); keepBoth(g)
    const av = avatarOf(g, 0); (av as any).name = 'Deathspeaker'; av.x = 2; av.y = 2
    placeSite(g, 0, 'Rustic Village', 2, 2)
    for (let i = 0; i < 2; i++) { // two dead minions, so a second remains after the echo banishes one
      const cid = `ctest${g.nextId++}`; g.cards[cid] = { id: cid, name: 'Foot Soldiers', owner: 0 } as any
      g.players[0].cemetery.push(cid)
    }
    g.players[0].mana = 10

    act(g, 0, { t: 'activate', sourceId: av.id, ability: 'speak' })
    expect(g.prompts.length, 'the echo prompt is open').toBeGreaterThan(0)
    expect(g.units[av.id].usedThisTurn.speak ?? 0, 'the use is NOT spent at activation').toBe(0)

    drain(g) // complete the echo (summon)
    expect(g.units[av.id].usedThisTurn.speak, 'the use is spent once the echo summons').toBe(1)
    expect(canActivate(g, 0, av.id, 'speak'), 'and it can no longer be re-activated this turn').toMatch(/already used/i)
  })
})
