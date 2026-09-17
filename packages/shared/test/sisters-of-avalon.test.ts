// Sisters of Avalon: "Genesis → Discard a spell. Draw a spell." The draw is CONTINGENT on the
// discard — with no spell to discard, the Genesis does nothing (you do NOT draw). FAQ.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, summonCard, injectToHand, answer } from './helpers'
import { getScript, makeCtx, type GameState } from '../src'
import '../src/cards/scripts/index'

const fireGenesis = (g: GameState, id: string) => getScript('Sisters of Avalon')!.genesis!(makeCtx(g, id, 0, []))

describe('Sisters of Avalon — no discard, no draw', () => {
  it('does NOT draw when there is no spell to discard', () => {
    const g = newGame() as GameState; keepBoth(g)
    g.players[0].hand = [] // no spell to discard
    const sis = summonCard(g, 0, 'Sisters of Avalon', 2, 2)
    fireGenesis(g, sis.id)
    expect(g.prompts.length, 'no discard prompt is raised').toBe(0)
    expect(g.players[0].hand.length, 'and no card is drawn').toBe(0)
  })

  it('discards a chosen spell and then draws when one is held', () => {
    const g = newGame() as GameState; keepBoth(g)
    g.players[0].hand = []
    const spell = injectToHand(g, 0, 'Lightning Bolt') // a spell to discard
    const sis = summonCard(g, 0, 'Sisters of Avalon', 2, 2)
    fireGenesis(g, sis.id)
    expect(g.prompts[0]?.kind, 'a mandatory discard prompt').toBe('chooseCards')
    answer(g, [0]) // discard the only spell
    expect(g.players[0].hand.includes(spell), 'the chosen spell was discarded').toBe(false)
    expect(g.players[0].cemetery.includes(spell), 'it went to the cemetery').toBe(true)
    expect(g.players[0].hand.length, 'and a fresh spell was drawn in its place').toBe(1)
  })
})
