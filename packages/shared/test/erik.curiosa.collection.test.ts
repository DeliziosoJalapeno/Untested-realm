// Erik's Curiosa: "Rip → Draw a card from your COLLECTION" (was wrongly falling back to the spellbook).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth } from './helpers'
import { applyJudge, makeCtx, getScript, type GameState } from '../src'

describe("Erik's Curiosa rip", () => {
  it('draws from your collection, not your spellbook', () => {
    const g = newGame(); keepBoth(g)
    applyJudge(g, 0, { k: 'addToCollection', name: 'Bone Jumble', player: 0 })
    applyJudge(g, 0, { k: 'addToCollection', name: 'Bone Jumble', player: 0 }) // 2 copies in the pool
    applyJudge(g, 0, { k: 'spawnArtifact', name: "Erik's Curiosa", player: 0, x: 1, y: 1 })
    const cur = Object.values(g.artifacts).find((a) => a.name === "Erik's Curiosa")!

    const handBefore = g.players[0].hand.length
    const spellbookBefore = g.players[0].spellbook.length
    getScript("Erik's Curiosa")!.abilities![0].effect(makeCtx(g as GameState, cur.id, 0, []))

    expect(g.players[0].hand.length).toBe(handBefore + 1)
    expect(g.players[0].spellbook.length).toBe(spellbookBefore) // NOT drawn from the spellbook
    expect(g.players[0].collection['Bone Jumble']).toBe(1) // one copy consumed
    expect(g.players[0].hand.some((id) => g.cards[id].name === 'Bone Jumble')).toBe(true)
    expect(g.artifacts[cur.id]).toBeUndefined() // ripped
  })
})
