// Fields of Camlann: '(F)(F)(F) – Genesis → Each player chooses one of their minions. Kill the rest.'
// The (F)(F)(F) prefix is an AFFINITY requirement on the controller. The genesis must do NOTHING
// when the controller holds fewer than 3 Fire; it was massacring everything regardless.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard } from './helpers'
import { makeCtx, getScript, type GameState } from '../src'
import '../src/cards/scripts/index'

function fireThresh(g: GameState, player: 0 | 1, fire: number) {
  g.flow = g.flow ?? {}
  g.flow.judgeThresh = { ...(g.flow.judgeThresh ?? {}), [player]: { air: 0, earth: 0, fire, water: 0 } }
}

describe('Fields of Camlann genesis is gated on the Fire threshold', () => {
  it('does nothing when the controller has fewer than 3 Fire', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    fireThresh(g, 0, 1) // site itself adds 1 → total 2, still one short of 3
    const a1 = summonCard(g, 0, 'Bone Jumble', 1, 1); a1.enteredTurn = -1
    const a2 = summonCard(g, 0, 'Bone Jumble', 1, 2); a2.enteredTurn = -1
    const siteId = 'camlann-test'
    g.sites[siteId] = { id: siteId, cardId: 'c', name: 'Fields of Camlann', owner: 0, controller: 0, x: 0, y: 0, tapped: false, isRubble: false } as any
    g.cards['c'] = { id: 'c', name: 'Fields of Camlann', owner: 0 } as any

    getScript('Fields of Camlann')!.genesis!(makeCtx(g, siteId, 0, []))
    expect(g.prompts.length, 'no survivor prompt was raised').toBe(0)
    expect(!!g.units[a1.id] && !!g.units[a2.id], 'both minions still alive').toBe(true)
  })

  it('fires and massacres down to one per player when the controller has 3 Fire', () => {
    const g = newGame(42, 0) as GameState; keepBoth(g)
    fireThresh(g, 0, 2) // site itself adds 1 → total 3, meets (F)(F)(F)
    const a1 = summonCard(g, 0, 'Bone Jumble', 1, 1); a1.enteredTurn = -1
    const a2 = summonCard(g, 0, 'Bone Jumble', 1, 2); a2.enteredTurn = -1
    const siteId = 'camlann-test'
    g.sites[siteId] = { id: siteId, cardId: 'c', name: 'Fields of Camlann', owner: 0, controller: 0, x: 0, y: 0, tapped: false, isRubble: false } as any
    g.cards['c'] = { id: 'c', name: 'Fields of Camlann', owner: 0 } as any

    getScript('Fields of Camlann')!.genesis!(makeCtx(g, siteId, 0, []))
    expect(g.prompts.some((p) => p.kind === 'chooseTargets'), 'a survivor prompt was raised').toBe(true)
  })
})
