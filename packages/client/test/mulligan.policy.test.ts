// The search bot's hardcoded mulligan policy:
//  1. toss spells costing > 4 mana or needing > 3 of one element's threshold;
//  2. if a keepable spell needs an element NO site in hand provides, also toss the sites that
//     provide none of the needed elements (dig for the ones you need). Capped at 3.
import { describe, it, expect } from 'vitest'
import { createGame, starterDecks, type GameState } from '@sorcery/shared'
import { mulliganTargets } from '../src/bot_search'

function handOf(names: string[]): { g: GameState; id: (n: string) => string } {
  const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 42, 0)
  g.players[0].hand = []
  const byName: Record<string, string> = {}
  for (const n of names) {
    const id = `h${g.nextId++}`
    ;(g.cards as any)[id] = { id, name: n, owner: 0 }
    g.players[0].hand.push(id)
    byName[n] = id
  }
  return { g, id: (n) => byName[n] }
}

describe('hardcoded mulligan policy', () => {
  it('rule 1: mulligans a spell costing more than 4', () => {
    const { g, id } = handOf(['Balor of the Evil Eye', 'Bone Jumble']) // cost 6 vs cost 1
    const back = mulliganTargets(g, 0)
    expect(back).toContain(id('Balor of the Evil Eye'))
    expect(back).not.toContain(id('Bone Jumble'))
  })

  it('rule 2: tosses redundant sites when a keepable spell has an unmatched element', () => {
    // Bone Jumble needs Air, but the only sites provide Fire / Water → both are redundant
    const { g, id } = handOf(['Bone Jumble', 'Arid Desert', 'Floodplain'])
    const back = mulliganTargets(g, 0)
    expect(back).toContain(id('Arid Desert'))
    expect(back).toContain(id('Floodplain'))
    expect(back).not.toContain(id('Bone Jumble'))
  })

  it('rule 2 does NOT fire when the needed element is already provided', () => {
    // Bone Jumble needs Air, Spire provides Air → matched, so no site is tossed
    const { g } = handOf(['Bone Jumble', 'Spire', 'Arid Desert'])
    expect(mulliganTargets(g, 0)).toHaveLength(0)
  })

  it('never returns more than the 3-card mulligan limit', () => {
    const { g } = handOf(['Balor of the Evil Eye', 'Balor of the Evil Eye', 'Balor of the Evil Eye', 'Balor of the Evil Eye', 'Balor of the Evil Eye'])
    expect(mulliganTargets(g, 0).length).toBeLessThanOrEqual(3)
  })
})
