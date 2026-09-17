import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, act, answer } from './helpers'

// #5: when two Evils are EQUALLY the closest (in different directions), the Persecutor's
// "step toward the closest Evil" must let the player choose which way — not auto-pick.
describe('Persecutor lets you choose among equally-closest Evils', () => {
  it('offers a step toward each of two equidistant Evils', () => {
    const g = newGame(42, 0); keepBoth(g)
    for (let x = 0; x <= 4; x++) placeSite(g, 0, 'Active Volcano', x, 2) // sites so steps are legal
    const pers = summonCard(g, 0, 'Persecutor', 2, 2); pers.enteredTurn = 0
    summonCard(g, 1, 'Stygian Archers', 0, 2).enteredTurn = 0 // Evil (Undead), 2 west
    summonCard(g, 1, 'Stygian Archers', 4, 2).enteredTurn = 0 // Evil (Undead), 2 east

    act(g, 0, { t: 'activate', sourceId: pers.id, ability: 'zeal' } as any)
    answer(g, 'steps toward the closest Evil') // choose to step (not brand)

    const p = g.prompts[0]
    expect(p?.kind, 'the player is asked which way to stalk').toBe('chooseSquare')
    const xs = (p!.data.squares as { x: number; y: number }[]).map((s) => s.x).sort()
    expect(xs, 'a step toward EACH equidistant Evil (west & east)').toEqual([1, 3])
  })
})
