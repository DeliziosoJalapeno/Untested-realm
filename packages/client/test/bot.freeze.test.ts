// #9: the bot must resolve EVERY prompt to a legal answer and TERMINATE — never freeze.
// Reproduces the two reported hangs: Legion of Gall (a constrained nameCard whose cont
// re-asks forever on an invalid name) and Earthquake (a repeating "swap a pair? (No=done)"
// yesNo the bot used to answer "yes" forever). A subpar-but-finished play beats a freeze.
import { describe, it, expect } from 'vitest'
import {
  board, place, usummon, inject, avatarOf, applyAction, getScript, makeCtx, actingSeatFor,
  type GameState,
} from '@sorcery/shared'
import { botAction } from '../src/bot'

/** drive the bot through every pending prompt with a hard cap; a run that hits the cap
 *  is a freeze. Returns how many prompts it answered. Every answer must be engine-legal. */
function driveBotPrompts(g: GameState, cap = 80): number {
  let n = 0
  while (g.prompts.length && n < cap) {
    const p = g.prompts[0]
    if (actingSeatFor(g, p.player) !== 0) break // only the bot's (seat 0) prompts
    const action = botAction(g, 0)
    const res = applyAction(g, p.player, action)
    expect(res.ok, `prompt ${p.kind} rejected: ${res.error} (${JSON.stringify(action)})`).toBe(true)
    n++
  }
  return n
}

describe('bot never freezes on tricky prompt chains', () => {
  it('Legion of Gall — resolves the constrained nameCard chain and terminates', () => {
    const g = board(); g.prompts = []
    g.players[0].collection = { 'Bone Jumble': 3, 'Wildfire': 2, 'Heat Ray': 1, 'Immolation': 1 }
    g.players[1].collection = { 'Bone Jumble': 2, 'Wildfire': 1 }
    const lg = usummon(g, 0, 'Legion of Gall', 2, 2) // the Legion is its OWN source (binds its conts)
    getScript('Legion of Gall')!.genesis!(makeCtx(g, lg, 0, []))

    const answered = driveBotPrompts(g)
    expect(answered, 'it answered prompts and finished').toBeGreaterThan(0)
    expect(g.prompts.length, 'no prompt left hanging (no freeze)').toBe(0)
  })

  it('Earthquake — resolves the swap chain and terminates (declines endless swaps)', () => {
    const g = board(); g.prompts = []; g.phase = 'main'; g.activePlayer = 0
    for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) place(g, 0, 'Rustic Village', x, y)
    const eq = inject(g, 0, 'Earthquake')
    g.players[0].mana = 20
    g.flow = { ...(g.flow ?? {}), noThreshold: { 0: g.turn, 1: g.turn } } as any
    const cast = applyAction(g, 0, { t: 'castSpell', cardId: eq, casterId: avatarOf(g, 0).id } as any)
    expect(cast.ok, `Earthquake cast rejected: ${cast.error}`).toBe(true)

    const answered = driveBotPrompts(g)
    expect(answered, 'the area + swap-or-done chain was answered').toBeGreaterThan(0)
    expect(g.prompts.length, 'no infinite swap loop (no freeze)').toBe(0)
  })
})
