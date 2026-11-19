// Head to head: two Thinking-bot configurations on the same decks, each pairing played twice with the
// configurations swapped, so deck strength and who goes first cancel out.
//   npx tsx scripts/fvl/duel.ts <pairs=10> <seed=1> '<cfg A json>' '<cfg B json>' [part i/n]
// Prints one JSON line: { pairs, a, b, draws, msA, msB } (ms = mean thinking time per own turn)
import { createGame, applyAction, featuredDecks, type PlayerId, type DeckList } from '../../packages/shared/src'
import '../../packages/shared/src/cards/scripts/index'
import { botAction, botNeedsToAct } from '../../packages/client/src/bot'
import { searchBotAction, DEFAULT_SEARCH, resetSearchState, rolloutStats, type SearchConfig } from '../../packages/client/src/bot_search'

const [pArg, sArg, aArg, bArg, partArg] = process.argv.slice(2)
const PAIRS = Number(pArg ?? 10), SEED = Number(sArg ?? 1)
// a `weights` entry holds only the weights that differ from the defaults
const cfgOf = (json: string | undefined): SearchConfig => { const o = JSON.parse(json || '{}'); return { ...DEFAULT_SEARCH, ...o, weights: { ...DEFAULT_SEARCH.weights, ...(o.weights ?? {}) } } }
const cfgs: SearchConfig[] = [cfgOf(aArg), cfgOf(bArg)]
const [pi, pn] = (partArg ?? '0/1').split('/').map(Number)
const field = (featuredDecks as DeckList[]).filter((d) => !/FvL precon/.test(d.name))
let rng = SEED * 2654435761 >>> 0
const rand = (n: number) => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng % n }
const wins = [0, 0]; let draws = 0
const ms = [0, 0], turnsBy = [0, 0]
for (let p = 0; p < PAIRS; p++) {
  const d1 = field[rand(field.length)], d2 = field[rand(field.length)], seed = rand(1e9), first = rand(2) as PlayerId
  if (p % pn !== pi) continue
  for (const swap of [0, 1]) {
    // seat s is driven by configuration (s ^ swap)
    const g = createGame([d1, d2] as [DeckList, DeckList], ['A', 'B'], seed, first)
    resetSearchState()
    let n = 0; const t0 = Date.now(); let lastTurn = -1
    while (g.winner === null && g.phase !== 'over' && n++ < 6000 && g.turn <= 70 && Date.now() - t0 < 900000) {
      const s = ([0, 1] as PlayerId[]).find((x) => botNeedsToAct(g, x)); if (s === undefined) break
      const c = s ^ swap
      if (g.activePlayer === s && g.turn !== lastTurn) { lastTurn = g.turn; turnsBy[c]++ }
      const t = Date.now()
      let a
      try { a = searchBotAction(g, s, cfgs[c]) } catch { a = botAction(g, s) }
      ms[c] += Date.now() - t
      if (!applyAction(g, s, a).ok) { a = botAction(g, s); if (!applyAction(g, s, a).ok) break }
    }
    if (g.winner === null) draws++; else wins[(g.winner as number) ^ swap]++
  }
}
console.log(JSON.stringify({ a: wins[0], b: wins[1], draws, msA: Math.round(ms[0] / Math.max(1, turnsBy[0])), msB: Math.round(ms[1] / Math.max(1, turnsBy[1])), rollouts: rolloutStats() }))
