// Swap is a TARGETED spell, so both things it swaps must be in the caster's region (rulebook: a target
// must be in the same region as the caster). It used to offer every minion/artifact on the board, letting
// a surface caster swap a burrowed/submerged unit it can't legally target.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, castMagic, summonCard, placeSite, waiveThreshold } from './helpers'
import { type GameState } from '../src'
import '../src/cards/scripts/index'

describe('Swap only targets the caster’s region', () => {
  it('a surface caster reaches surface minions but not a burrowed one', () => {
    const g = newGame() as GameState; keepBoth(g)
    for (const [x, y] of [[2, 1], [2, 2], [3, 1]] as const) placeSite(g, 0, 'Rustic Village', x, y)
    const s1 = summonCard(g, 0, 'Bone Jumble', 2, 1); s1.enteredTurn = -1
    const s2 = summonCard(g, 0, 'Bone Jumble', 2, 2); s2.enteredTurn = -1
    const under = summonCard(g, 0, 'Bone Jumble', 3, 1, 'underground'); under.enteredTurn = -1
    under.modifiers.push({ kind: 'keyword', keyword: 'burrowing', duration: 'permanent', turn: g.turn, sourcePlayer: 0 })

    waiveThreshold(g, 0)
    castMagic(g, 0, 'Swap') // caster = the surface avatar
    const cands: string[] = (g.prompts[0] as any)?.data?.candidates ?? []
    expect(cands.includes(s1.id), 'a surface minion is targetable').toBe(true)
    expect(cands.includes(s2.id), 'the other surface minion is targetable').toBe(true)
    expect(cands.includes(under.id), 'the burrowed minion is NOT (different region)').toBe(false)
  })
})
