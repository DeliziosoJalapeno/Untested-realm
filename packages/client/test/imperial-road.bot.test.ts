// vs-Computer: when the HUMAN plays Imperial Road as their forced first site, its Genesis offers the
// OPPONENT (the bot) first — during the human's turn. The bot must resolve that offer chain (yesNo →
// chooseCards → chooseSquare, plus any genesis of the site it places) and then hand the "then you"
// offer back to the human, without stalling.
import { describe, it, expect } from 'vitest'
import { createGame, starterDecks, applyAction, cinject, type GameState, type PlayerId } from '@sorcery/shared'
import { botAction, botNeedsToAct } from '../src/bot'

function driveBot(g: GameState, me: PlayerId, max = 60): number {
  let n = 0
  while (botNeedsToAct(g, me) && n < max) {
    const a = botAction(g, me)
    const res = applyAction(g, me, a)
    if (!res.ok) throw new Error(`bot action rejected: ${JSON.stringify(a)} → ${res.error}`)
    n++
  }
  if (n >= max) throw new Error('bot loop did not terminate — STALL')
  return n
}

describe('vs-Computer: Imperial Road as the human first site', () => {
  it('the bot resolves its opponent-offer and control returns to the human (no stall)', () => {
    const g: GameState = createGame([starterDecks[0], starterDecks[1]], ['You', 'CPU'], 42, 0)
    const road = cinject(g, 0, 'Imperial Road')
    cinject(g, 1, 'Spire') // bot has a site it could place
    applyAction(g, 0, { t: 'keepHand' })
    driveBot(g, 1) // bot auto-keeps its hand
    if (g.prompts[0]?.kind === 'drawDeck') applyAction(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: 'spellbook' })

    expect(g.prompts[0]?.kind).toBe('firstSite')
    applyAction(g, 0, { t: 'prompt', promptId: g.prompts[0].id, choice: road })
    expect(Object.values(g.sites).some((s) => s.name === 'Imperial Road')).toBe(true)

    // the Genesis offered the bot (player 1) first
    expect(g.prompts[0]?.player).toBe(1)
    const steps = driveBot(g, 1) // bot must resolve its offer chain during the human's turn
    expect(steps).toBeGreaterThan(0)

    // no bot prompt left dangling, and the game is back in the human's hands
    expect(botNeedsToAct(g, 1)).toBe(false)
    const remaining = g.prompts[0]
    if (remaining) expect(remaining.player, 'any remaining prompt is the human’s "then you" offer').toBe(0)
    else { expect(g.phase).toBe('main'); expect(g.activePlayer).toBe(0) }
  })
})
