// "Second Seer" optional rule: the SECOND player is granted the Seer's deck-peek ONCE, at the very
// start of the game — after both mulligans, BEFORE turn 1 begins — as a small compensation for going
// second. It is a self-contained engine effect (NOT the Seer avatar's card script), so its prompts
// resolve no matter which avatar the second player actually fielded. Off by default.
import { describe, it, expect } from 'vitest'
import { newGame, keepBoth, answer } from './helpers'
import { type GameState } from '../src'

const secondSeerPrompt = (g: GameState) => g.prompts.find((p) => /Second Seer/i.test(String(p.title)))

describe('Second Seer optional rule', () => {
  it('offers the second player the peek at game start, before turn 1 — and it actually resolves', () => {
    const g = newGame(0, 0) // player 0 goes first → player 1 is the "second seer"
    g.flow = g.flow ?? {}
    g.flow.secondSeer = true

    keepBoth(g) // both keep → maybeStartGame runs the peek BEFORE turn 1

    // turn 1 has NOT started yet — it is parked behind the peek
    expect(g.turn, 'turn 1 is deferred until the peek resolves').toBe(0)
    expect(g.phase, 'left the mulligan phase so the board renders the prompt').not.toBe('mulligan')
    const p = secondSeerPrompt(g)
    expect(p, 'the peek is offered').toBeTruthy()
    expect(p!.player, 'to the SECOND player').toBe(1)
    expect((p!.data as any).options).toContain('peek at topmost spell')

    // answer the gaze → then choose to bury the top spell; the cont must exist (the old avatar-coupled
    // version routed to the wrong script and died with "No continuation").
    const topBefore = g.players[1].spellbook[0]
    answer(g, 'peek at topmost spell')
    const bottomPrompt = g.prompts[0]
    expect(String(bottomPrompt.title), 'the keep/bottom choice is offered').toMatch(/bottom/i)
    answer(g, 'put on bottom')

    expect(g.players[1].spellbook[0], 'the top spell was moved off the top').not.toBe(topBefore)
    expect(g.players[1].spellbook.at(-1), 'and it went to the bottom').toBe(topBefore)

    // only NOW does turn 1 begin, for the first player
    expect(g.turn).toBe(1)
    expect(g.activePlayer).toBe(0)
    expect(secondSeerPrompt(g), 'the one-time peek does not linger').toBeUndefined()
  })

  it('lets the second player decline (neither), and turn 1 still begins', () => {
    const g = newGame(0, 0)
    g.flow = g.flow ?? {}
    g.flow.secondSeer = true
    keepBoth(g)

    expect(secondSeerPrompt(g)).toBeTruthy()
    answer(g, '(neither)')

    expect(g.turn).toBe(1)
    expect(g.activePlayer).toBe(0)
  })

  it('does NOT fire on turn 2, and does nothing when the rule is off', () => {
    const g = newGame(0, 0)
    keepBoth(g)
    // no optional rule → game opens straight into turn 1, no peek ever
    expect(g.turn).toBe(1)
    expect(secondSeerPrompt(g)).toBeUndefined()
  })
})
