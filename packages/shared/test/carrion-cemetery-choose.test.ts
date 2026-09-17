// Grave-hate that "banishes N cards from a cemetery" lets the ACTIVE player CHOOSE which cards — the
// cemetery is a public, unordered pile. Previously these auto-picked the OLDEST via cemetery.shift().
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, answer } from './helpers'
import { getScript, makeCtx, type GameState, type PlayerId } from '../src'
import '../src/cards/scripts/index'

// stock a player's cemetery with named dead cards, return their ids in order
function fillCemetery(g: GameState, pid: PlayerId, names: string[]): string[] {
  const ids = names.map((name) => {
    const id = `d${g.nextId++}`
    g.cards[id] = { id, name, owner: pid }
    return id
  })
  g.players[pid].cemetery.push(...ids)
  return ids
}

describe('Carrion Beetles — you choose which three cards to banish', () => {
  it('banishes the CHOSEN cards, not the oldest three', () => {
    const g = newGame() as GameState; keepBoth(g)
    const [c0, c1, c2, c3, c4] = fillCemetery(g, 0, ['Bone Jumble', 'Skeleton', 'Ghoul', 'Wildfire', 'Immolation'])
    const beetle = summonCard(g, 0, 'Carrion Beetles', 2, 2)
    getScript('Carrion Beetles')!.genesis!(makeCtx(g, beetle.id, 0, []))
    // pick own cemetery
    expect(g.prompts[0]?.kind).toBe('chooseOption')
    answer(g, 'yours')
    // now the card chooser — pick indices 1,3,4 (Skeleton, Wildfire, Immolation), NOT the oldest three
    expect(g.prompts[0]?.kind).toBe('chooseCards')
    expect(g.prompts[0]?.data?.pick).toBe(3)
    answer(g, [1, 3, 4])
    const cem = g.players[0].cemetery
    expect(cem, 'the chosen three left the cemetery').toEqual([c0, c2]) // Bone Jumble + Ghoul remain
    expect(g.players[0].banished.sort()).toEqual([c1, c3, c4].sort())
  })

  it('banishes all when the cemetery holds fewer than three', () => {
    const g = newGame() as GameState; keepBoth(g)
    const ids = fillCemetery(g, 1, ['Skeleton', 'Ghoul']) // opponent's, only two
    const beetle = summonCard(g, 0, 'Carrion Beetles', 2, 2)
    getScript('Carrion Beetles')!.genesis!(makeCtx(g, beetle.id, 0, []))
    answer(g, "opponent's")
    expect(g.prompts[0]?.data?.pick, 'capped at the cemetery size').toBe(2)
    answer(g, [0, 1])
    expect(g.players[1].cemetery.length).toBe(0)
    expect(g.players[1].banished.sort()).toEqual(ids.sort())
  })
})
