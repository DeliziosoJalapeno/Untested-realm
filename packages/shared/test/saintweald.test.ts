// Saintweald: "Deathrite abilities here are also Genesis abilities." A minion summoned onto Saintweald
// fires its deathrite immediately (as a genesis). Regression: the hook used inline require() for its
// imports, which is undefined in the browser ESM bundle, so it threw in-game and nothing fired for ANY
// deathrite minion (Kettletop Leprechaun's atlas draw included).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, act } from './helpers'
import { effectSummonUnit } from '../src'

describe('Saintweald', () => {
  it('fires an entering minion’s deathrite as a genesis (Kettletop draws a site)', () => {
    const g = newGame(); keepBoth(g)
    placeSite(g, 0, 'Saintweald', 2, 2)
    const atlasBefore = g.players[0].atlas.length
    expect(atlasBefore, 'the atlas has sites to draw').toBeGreaterThan(0)

    const cardId = 'ktc'; g.cards[cardId] = { id: cardId, name: 'Kettletop Leprechaun', owner: 0 }
    effectSummonUnit(g, {
      id: 'ktu', cardId, name: 'Kettletop Leprechaun', owner: 0, controller: 0, isAvatar: false,
      x: 2, y: 2, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {}, counters: {},
    })

    // its deathrite (draw a site from the atlas) fired on entry
    expect(g.players[0].atlas.length, 'Saintweald echoed the deathrite → a site was drawn').toBe(atlasBefore - 1)
  })

  it('copies a deathrite that SPAWNS A PROMPT, and its continuation resolves (Estranged Loner)', () => {
    const g: any = newGame(); keepBoth(g)
    placeSite(g, 0, 'Saintweald', 2, 2)
    g.players[0].collection = { ...(g.players[0].collection ?? {}), 'Horrible Hybrids': 1 } // for the "yes" branch
    g.cards['elc'] = { id: 'elc', name: 'Estranged Loner', owner: 0 }
    effectSummonUnit(g, {
      id: 'elu', cardId: 'elc', name: 'Estranged Loner', owner: 0, controller: 0, isAvatar: false,
      x: 2, y: 2, region: 'surface', tapped: false, damage: 0, enteredTurn: g.turn,
      modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {}, counters: {},
    })

    // Estranged Loner's deathrite asks a yes/no — Saintweald must have raised that prompt on entry
    const p = g.prompts[0]
    expect(p?.kind, 'the copied deathrite spawned its prompt').toBe('yesNo')
    expect(String(p?.title)).toMatch(/Loner/i)
    expect(p?.player).toBe(0)

    // answering it must reach the deathrite's continuation and summon the Horrible Hybrids
    act(g, 0, { t: 'prompt', promptId: p!.id, choice: true })
    expect(g.prompts.length, 'the prompt resolved cleanly').toBe(0)
    expect(Object.values(g.units).some((u: any) => u.name === 'Horrible Hybrids' && u.x === 2 && u.y === 2),
      'the continuation ran and summoned Horrible Hybrids').toBe(true)
  })
})
