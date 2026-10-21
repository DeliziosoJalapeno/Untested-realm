// Ultimate Horror: 'Genesis → Summon each other dead Voidwalk minion to a nearby site or void.' With
// several dead Voidwalk minions the controller chooses the order they rise in (and where each lands);
// another dead Ultimate Horror is a dead Voidwalk minion too.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, placeSite, answer } from './helpers'
import { getScript, makeCtx, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

function dead(g: GameState, owner: PlayerId, name: string): string {
  const id = `cdead${g.nextId++}`
  g.cards[id] = { id, name, owner } as any
  g.players[owner].cemetery.push(id)
  return id
}
const risenFrom = (g: GameState, cardId: string) => Object.values(g.units).find((u) => u.cardId === cardId)

describe('Ultimate Horror lets you choose the order', () => {
  it('asks which dead Voidwalk minion rises next, from both cemeteries', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Rustic Village', 2, 2)
    const horror = summonCard(g, 0, 'Ultimate Horror', 2, 2)
    const mine = dead(g, 0, 'Aethermoeba')
    const theirs = dead(g, 1, 'Ultimate Horror') // another Horror is "other" — it rises too
    dead(g, 1, 'Bone Jumble') // no Voidwalk → stays
    getScript('Ultimate Horror')!.genesis!(makeCtx(g, horror.id, 0, []))

    expect(g.prompts[0]?.kind).toBe('chooseCards')
    expect(g.prompts[0].data.cards).toEqual(['Aethermoeba (Alice)', 'Ultimate Horror (Bob)'])
    answer(g, [1]) // the opponent's Horror first
    expect(g.prompts[0]?.kind).toBe('chooseSquare')
    expect(g.prompts[0].title).toContain('Ultimate Horror (Bob)')
    answer(g, { x: 2, y: 2 })
    expect(risenFrom(g, theirs)?.controller).toBe(0)
    // its own Genesis found nothing new to raise; the last one left needs no order choice
    while (g.prompts[0] && g.prompts[0].kind !== 'chooseSquare') answer(g, [0])
    expect(g.prompts[0]?.title).toContain('Aethermoeba (Alice)')
    answer(g, { x: 2, y: 2 })
    expect(risenFrom(g, mine)).toBeDefined()
    expect(g.prompts).toHaveLength(0)
  })
})
