// Kelp Cavern moves a spell from the bottom of the spellbook to the top. The opponent sees a card
// move, so the game log says so, without naming the spell (it stays hidden).
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, answer } from './helpers'
import { getScript, makeCtx } from '../src'
import type { GameState } from '../src'
import '../src/cards/scripts/index'

describe('Kelp Cavern logs the move without naming the spell', () => {
  it('writes an unnamed log line when a bottom spell goes on top', () => {
    const g = newGame() as GameState; keepBoth(g)
    const p = g.players[0]
    const spellId = p.spellbook[p.spellbook.length - 1]
    const name = g.cards[spellId].name
    g.cards.kelp = { id: 'kelp', name: 'Kelp Cavern', owner: 0 }
    getScript('Kelp Cavern')!.genesis!(makeCtx(g, 'kelp', 0, []))
    answer(g, name)
    expect(p.spellbook[0]).toBe(spellId)
    const last = g.log[g.log.length - 1]
    expect(last.msg).toMatch(/puts a spell from the bottom of their spellbook on top/)
    expect(last.msg).not.toContain(name)
  })
})
