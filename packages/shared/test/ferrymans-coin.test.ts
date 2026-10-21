// Ferryman's Coin: "Banish this coin → Gain (1), or banish up to three cards from any cemetery."
// The coin banishes ITSELF and then asks which cemetery — that follow-up prompt used to lose its routing
// (the coin was no longer in play to name the script) and every answer failed with
// "No continuation script::ferry".
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, placeSite, act, answer, summonCard, giveArtifact } from './helpers'
import type { GameState, PlayerId } from '../src'
import '../src/cards/scripts/index'

function coinBoard(): { g: GameState; coin: string; coinCard: string } {
  const g = newGame(); keepBoth(g)
  placeSite(g, 0, 'Rustic Village', 2, 0)
  // carried: a coin on the ground is uncontrolled, and nobody can use it
  const bearer = summonCard(g, 0, 'Bone Jumble', 2, 0); bearer.enteredTurn = -1
  const art = giveArtifact(g, bearer, "Ferryman's Coin")
  return { g, coin: art.id, coinCard: art.cardId }
}
function deadCards(g: GameState, pid: PlayerId, n: number): string[] {
  const ids = Array.from({ length: n }, () => { const id = `cdead${g.nextId++}`; g.cards[id] = { id, name: 'Bone Jumble', owner: pid } as any; return id })
  g.players[pid].cemetery.push(...ids)
  return ids
}

describe("Ferryman's Coin", () => {
  it('banish up to three from a cemetery: every prompt resolves, the chosen cards and the coin are banished', () => {
    const { g, coin, coinCard } = coinBoard()
    const dead = deadCards(g, 1, 4)
    act(g, 0, { t: 'activate', sourceId: coin, ability: 'toll' })
    expect(g.prompts[0].data.options).toEqual(['Gain ①', 'Banish up to three cards from a cemetery'])
    answer(g, 'Banish up to three cards from a cemetery')
    expect(g.artifacts[coin], 'the coin banished itself').toBeUndefined()
    expect(g.players[0].banished).toContain(coinCard)
    answer(g, "opponent's") // used to fail: "No continuation script::ferry"
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    answer(g, [0, 2])
    expect(g.players[1].banished).toEqual([dead[0], dead[2]])
    expect(g.players[1].cemetery).toEqual([dead[1], dead[3]])
    expect(g.prompts).toHaveLength(0)
  })

  it('gain ①', () => {
    const { g, coin } = coinBoard()
    const mana = g.players[0].mana
    act(g, 0, { t: 'activate', sourceId: coin, ability: 'toll' })
    answer(g, 'Gain ①')
    expect(g.players[0].mana).toBe(mana + 1)
    expect(g.artifacts[coin]).toBeUndefined()
  })
})
