// Performance guard for the bots' target enumeration (legalTargetsFor): every bot pick now goes through
// the engine's shared legal-target list, so a slow path there slows every search node. The corpus is
// built here from seeded Fast-bot games (main-phase states), plus a "heavy" copy of each state with a hand
// of 20 targeted spells — dependent picks (Blink, Trial by Water), targetOptions (Meteor Shower,
// explosions), multi-target — and the mana to cast them. Budgets are deliberately LARGE: they catch a
// real regression (an accidental per-candidate scan, a quadratic loop), not run-to-run noise. Measured
// times are printed so a trend is visible. For an exact before/after comparison on a saved corpus, see
// scripts/bench_targets.ts.
import { describe, it, expect, beforeAll } from 'vitest'
import { performance } from 'node:perf_hooks'
import { createGame, applyAction, starterDecks, getCard, type GameState, type PlayerId, type Action } from '@sorcery/shared'
import { expandActions } from '../../shared/src/bot/moves'
import { botAction, botNeedsToAct } from '../src/bot'
import { searchBotAction, DEFAULT_SEARCH } from '../src/bot_search'

const HEAVY = [
  'Blink', 'Trial by Water', 'Meteor Shower', 'Major Explosion', 'Minor Explosion', 'Lightning Bolt',
  'Displace', 'Abyssal Assault', 'Grapple Shot', 'Lure', 'Extinguish', 'Stone Rain', 'Incinerate',
  'Chain Lightning', 'Dispel', 'Unravel', 'Cave-In', 'Riptide', 'Fireball', 'Bury',
]

const clone = (g: GameState): GameState => JSON.parse(JSON.stringify(g))

function corpus(): { normal: GameState[]; heavy: GameState[] } {
  const normal: GameState[] = []
  for (let gi = 0; gi < 4; gi++) {
    const g = createGame([starterDecks[(gi * 2) % starterDecks.length], starterDecks[(gi * 2 + 1) % starterDecks.length]], ['P0', 'P1'], 0x5eed00 + gi, (gi % 2) as PlayerId)
    let steps = 0, decisions = 0
    while (g.phase !== 'over' && steps++ < 1500 && g.turn <= 14) {
      const seat: PlayerId | null = botNeedsToAct(g, 0) ? 0 : botNeedsToAct(g, 1) ? 1 : null
      if (seat === null) { if (!applyAction(g, g.activePlayer, { t: 'endTurn' }).ok) break; continue }
      if (g.phase === 'main' && !g.prompts.length && seat === g.activePlayer && decisions++ % 4 === 0) normal.push(clone(g))
      let action: Action
      try { action = botAction(g, seat) } catch { action = { t: 'endTurn' } }
      if (!applyAction(g, seat, action).ok) {
        const fb: Action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : { t: 'endTurn' }
        if (!applyAction(g, seat, fb).ok) applyAction(g, seat, { t: 'concede' })
      }
    }
  }
  const heavy = normal.map((s) => {
    const g = clone(s)
    const me = g.activePlayer
    for (const name of HEAVY) {
      try { getCard(name) } catch { continue }
      const id = `cperf${g.nextId++}`
      g.cards[id] = { id, name, owner: me } as any
      g.players[me].hand.push(id)
    }
    g.players[me].mana += 30
    g.flow = g.flow ?? {}
    g.flow.noThreshold = { ...(g.flow.noThreshold ?? {}), [me]: g.turn }
    return g
  })
  return { normal, heavy }
}

/** total ms to run `fn` once over fresh copies of `states` (cloning stays outside the timed region) */
function timed(states: GameState[], fn: (g: GameState) => void): number {
  const copies = states.map(clone)
  const t0 = performance.now()
  for (const g of copies) fn(g)
  return performance.now() - t0
}

describe('bot target enumeration performance', () => {
  let normal: GameState[] = [], heavy: GameState[] = []
  beforeAll(() => { ({ normal, heavy } = corpus()) }, 120_000)

  it('the corpus is substantial', () => {
    expect(normal.length).toBeGreaterThan(30)
    // the heavy hands really do produce many targeted casts to enumerate
    const casts = heavy.slice(0, 10).reduce((n, s) => n + expandActions(clone(s), s.activePlayer, { minionCasters: true }).filter((x) => x.action.t === 'castSpell').length, 0)
    expect(casts).toBeGreaterThan(300)
  }, 60_000)

  it('search-bot move generation (expandActions) over the corpus stays well under budget', () => {
    timed(heavy.slice(0, 3), (g) => { expandActions(g, g.activePlayer, { minionCasters: true }) }) // warm-up
    const n = timed(normal, (g) => { expandActions(g, g.activePlayer, { minionCasters: true }) })
    const h = timed(heavy, (g) => { expandActions(g, g.activePlayer, { minionCasters: true }) })
    console.log(`[perf] expandActions: ${normal.length} normal states ${n.toFixed(0)} ms, ${heavy.length} heavy states ${h.toFixed(0)} ms`)
    expect(n, 'normal states').toBeLessThan(10_000)
    expect(h, 'heavy hands of targeted spells').toBeLessThan(20_000)
  }, 120_000)

  it('Fast bot decisions over the corpus stay well under budget', () => {
    const n = timed(normal, (g) => { botAction(g, g.activePlayer) })
    const h = timed(heavy, (g) => { botAction(g, g.activePlayer) })
    console.log(`[perf] Fast bot: ${normal.length} normal ${n.toFixed(0)} ms, ${heavy.length} heavy ${h.toFixed(0)} ms`)
    expect(n + h).toBeLessThan(10_000)
  }, 120_000)

  it('the thinking bot, at a fixed node budget, stays well under budget', () => {
    // no deadline (10 min) and a fixed node budget: the time measures the cost per search node
    const cfg = { ...DEFAULT_SEARCH, timeBudgetMs: 10 * 60_000, nodeBudget: 1500 }
    const states = [...normal.filter((_, i) => i % 8 === 0), ...heavy.filter((_, i) => i % 8 === 0)]
    const ms = timed(states, (g) => { searchBotAction(g, g.activePlayer, cfg) })
    console.log(`[perf] search bot: ${states.length} states × 1500 nodes ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(60_000)
  }, 180_000)
})
