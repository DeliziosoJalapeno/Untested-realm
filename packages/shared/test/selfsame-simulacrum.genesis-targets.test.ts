// Selfsame Simulacrum copies Genesis abilities (FAQ) — including a TARGETED Genesis: after picking its
// model it asks for the copied Genesis's targets (the same legal set a cast offers) and fires it with them.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, summonCard, injectToHand, giveMana, waiveThreshold, act, answer } from './helpers'
import { avatarOf } from '../src'
import '../src/cards/scripts/index'

describe('Selfsame Simulacrum: a copied Genesis with targets', () => {
  it('copying a Lacuna Entity asks for the drag target and drags it', () => {
    const g = newGame(7); keepBoth(g)
    const av = avatarOf(g, 0)
    const at = { x: 2, y: 1 }
    placeSite(g, 0, 'Rustic Village', at.x, at.y)
    placeSite(g, 1, 'Rustic Village', at.x, at.y + 1) // an adjacent site
    const model = summonCard(g, 0, 'Lacuna Entity', at.x + 1, at.y) // nearby the summon square
    const prey = summonCard(g, 1, 'Foot Soldier', at.x, at.y + 1) // weaker, on the adjacent site
    const sim = injectToHand(g, 0, 'Selfsame Simulacrum')
    giveMana(g, 0, 12); waiveThreshold(g, 0)
    act(g, 0, { t: 'castSpell', cardId: sim, casterId: av.id, at: { ...at, region: 'surface' } })
    answer(g, [model.id]) // mirror the Lacuna Entity
    const pr = g.prompts[0]
    expect(pr?.kind, 'the copied Genesis asks for its target').toBe('chooseTargets')
    expect(pr?.data?.candidates).toContain(prey.id)
    answer(g, [prey.id])
    expect(g.units[prey.id].x, 'dragged to the Simulacrum').toBe(at.x)
    expect(g.units[prey.id].y).toBe(at.y)
  })
})
