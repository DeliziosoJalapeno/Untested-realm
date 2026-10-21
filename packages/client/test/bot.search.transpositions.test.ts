// The search's transposition table must be EXACT: on a position whose whole turn tree fits in the budget
// (no deadline / node-budget bail), the plan with the table on is identical to the plan with it off — it
// only skips re-searching positions that a different move order already reached.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { board, usummon, type GameState } from '@sorcery/shared'
import { searchBotAction, lastSearchStats, resetSearchState, DEFAULT_SEARCH, type SearchConfig } from '../src/bot_search'

const BOT = 0
const FULL: SearchConfig = { ...DEFAULT_SEARCH, timeBudgetMs: 120_000, nodeBudget: 1e9 } // never bails

/** the hidden-deck shuffle uses Math.random — seed it so both runs see the same determinized world */
function seeded(seed: number) {
  let s = seed
  return vi.spyOn(Math, 'random').mockImplementation(() => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff })
}
afterEach(() => { vi.restoreAllMocks(); resetSearchState() })

function run(g: GameState, transpositions: boolean) {
  resetSearchState()
  seeded(7)
  const action = searchBotAction(JSON.parse(JSON.stringify(g)), BOT, { ...FULL, transpositions })
  vi.restoreAllMocks()
  const st = lastSearchStats()
  return { action, ...st, plan: JSON.stringify(st.plan) }
}

/** three ready minions of mine with free squares around: their moves commute → transpositions */
function threeMovers(): GameState {
  const g = board() as GameState; g.prompts = []; g.phase = 'main'; g.activePlayer = BOT
  for (const u of Object.values(g.units)) if (!u.isAvatar) delete g.units[u.id] // clean board
  for (const [x, y] of [[2, 0], [2, 1], [1, 1]]) { const id = usummon(g, BOT, 'Bone Jumble', x, y); g.units[id].enteredTurn = -1 }
  g.players[BOT].hand = []
  return g
}

/** a small fight: my two attackers next to two enemy minions */
function smallFight(): GameState {
  const g = threeMovers()
  for (const [x, y] of [[2, 2], [3, 2]]) { const id = usummon(g, 1, 'Bone Jumble', x, y); g.units[id].enteredTurn = -1 }
  return g
}

describe('search transposition table', () => {
  for (const [name, make] of [['independent moves', threeMovers], ['a small fight', smallFight]] as const) {
    it(`${name}: same plan with and without it, fewer nodes, real hits`, () => {
      const off = run(make(), false)
      const on = run(make(), true)
      expect(off.timedOut, 'the whole tree fits — the comparison is exact').toBe(false)
      expect(on.timedOut).toBe(false)
      expect(on.action).toEqual(off.action)
      expect(on.plan, 'identical contingency plan').toBe(off.plan)
      expect(on.ttHits, 'move orders did transpose').toBeGreaterThan(0)
      expect(on.nodes, 'and the search skipped work').toBeLessThan(off.nodes)
      console.log(`${name}: nodes ${off.nodes} → ${on.nodes}, tt hits ${on.ttHits}`)
    }, 120_000)
  }
})
