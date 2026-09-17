// The reported hang: the THINKING (search) bot froze when it had to split a striker's damage among several
// defenders. expandActions used to offer only junk answers for an `allocateDamage` prompt, so the search
// planned a no-op the engine re-prompted forever. The search bot must now answer it with a valid allocation
// and let combat resolve. (The base bot is covered by bot.freeze.test.ts; this guards the search path.)
import { describe, it, expect } from 'vitest'
import { board, usummon, applyAction, actingSeatFor, type GameState } from '@sorcery/shared'
import { searchBotAction, DEFAULT_SEARCH, type SearchConfig } from '../src/bot_search'

const FAST: SearchConfig = { ...DEFAULT_SEARCH, timeBudgetMs: 400, nodeBudget: 3000, maxPlanDepth: 6 }
const BOT = 1 // the computer plays seat 1 (App.tsx)

describe('search bot never freezes on damage allocation', () => {
  it('answers an allocateDamage prompt with a valid split and combat resolves', () => {
    const g = board() as GameState; g.prompts = []; g.phase = 'main'; g.activePlayer = BOT
    // the BOT's attacker (3/3) strikes two co-located enemy 1/1s — its 3 damage must be split among them
    const attacker = usummon(g, BOT, 'Stygian Archers', 2, 0); g.units[attacker].enteredTurn = -1
    const d1 = usummon(g, 0, 'Bone Jumble', 2, 0); g.units[d1].enteredTurn = -1
    const d2 = usummon(g, 0, 'Bone Jumble', 2, 0); g.units[d2].enteredTurn = -1
    const cast = applyAction(g, BOT, { t: 'moveAttack', unitId: attacker, path: [], attack: { unit: d1 } } as any)
    expect(cast.ok, `moveAttack rejected: ${cast.error}`).toBe(true)

    // resolve the whole combat with a hard cap — the bot answers its OWN prompts through the SEARCH bot;
    // the human's defend is answered inline (defend with everyone, so both units are in the fight).
    let sawAllocate = false
    let n = 0
    for (; g.prompts.length && n < 60; n++) {
      const p: any = g.prompts[0]
      let action: any
      if (actingSeatFor(g, p.player) === BOT) {
        if (p.kind === 'allocateDamage') sawAllocate = true
        action = searchBotAction(g, BOT, FAST)
      } else if (p.kind === 'defend') {
        action = { t: 'prompt', promptId: p.id, choice: p.data?.candidates ?? [] } // defend with all
      } else {
        action = { t: 'prompt', promptId: p.id, choice: p.data?.candidates?.[0] ?? [] }
      }
      const res = applyAction(g, p.player, action)
      expect(res.ok, `answer rejected on ${p.kind}: ${res.error}`).toBe(true)
    }

    expect(n, 'combat resolved without hitting the cap (no freeze)').toBeLessThan(60)
    expect(sawAllocate, 'the search bot actually faced the allocateDamage prompt').toBe(true)
    expect(g.prompts.some((q: any) => q.kind === 'allocateDamage'), 'no allocation prompt left open').toBe(false)
    // power 3 ≥ two 1-life defenders → the canonical split kills both
    expect(g.units[d1], 'first defender killed').toBeUndefined()
    expect(g.units[d2], 'second defender killed').toBeUndefined()
  })
})
