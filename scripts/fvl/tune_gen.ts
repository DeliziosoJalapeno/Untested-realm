// One candidate of a self-tuning generation. Every evaluation weight of the base is nudged up or down by a
// random factor (the nudges are drawn from the seed and candidate number, so the totalling step can redraw
// them); the candidate then plays the base on the meta decks, each pairing twice with the seats swapped.
// Candidates n and n + half use opposite nudges, which makes the comparison much less noisy.
//   npx tsx scripts/fvl/tune_gen.ts <candidate> <candidates> <pairs> <seed> <sigma> <budget ms> '<base weights json>' [part i/n]
// Prints one JSON line: { candidate, a (base wins), b (candidate wins), draws }
import { createGame, applyAction, featuredDecks, DEFAULT_WEIGHTS, type PlayerId, type DeckList, type EvalWeights } from '../../packages/shared/src'
import '../../packages/shared/src/cards/scripts/index'
import { botAction, botNeedsToAct } from '../../packages/client/src/bot'
import { searchBotAction, DEFAULT_SEARCH, resetSearchState, type SearchConfig } from '../../packages/client/src/bot_search'
import { nudges, applyNudges } from './tune_math.mjs'

const [cArg, nArg, pArg, sArg, sigArg, msArg, baseArg, partArg] = process.argv.slice(2)
const CAND = Number(cArg), CANDS = Number(nArg), PAIRS = Number(pArg), SEED = Number(sArg), SIGMA = Number(sigArg), MS = Number(msArg)
const [pi, pn] = (partArg ?? '0/1').split('/').map(Number)
const base: EvalWeights = { ...DEFAULT_WEIGHTS, ...JSON.parse(baseArg || '{}') }
const cand = applyNudges(base, nudges(Object.keys(DEFAULT_WEIGHTS), SEED, CAND, CANDS), SIGMA) as EvalWeights
const cfgs: SearchConfig[] = [{ ...DEFAULT_SEARCH, timeBudgetMs: MS, weights: base }, { ...DEFAULT_SEARCH, timeBudgetMs: MS, weights: cand }]
const field = (featuredDecks as DeckList[]).filter((d) => !/FvL precon/.test(d.name))
let rng = (SEED * 2654435761 + 97) >>> 0 // the same pairings for every candidate of a generation
const rand = (n: number) => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng % n }
const wins = [0, 0]; let draws = 0
for (let p = 0; p < PAIRS; p++) {
  const d1 = field[rand(field.length)], d2 = field[rand(field.length)], seed = rand(1e9), first = rand(2) as PlayerId
  if (p % pn !== pi) continue
  for (const swap of [0, 1]) {
    const g = createGame([d1, d2] as [DeckList, DeckList], ['A', 'B'], seed, first)
    resetSearchState()
    let n = 0; const t0 = Date.now()
    while (g.winner === null && g.phase !== 'over' && n++ < 6000 && g.turn <= 70 && Date.now() - t0 < 600000) {
      const s = ([0, 1] as PlayerId[]).find((x) => botNeedsToAct(g, x)); if (s === undefined) break
      let a
      try { a = searchBotAction(g, s, cfgs[s ^ swap]) } catch { a = botAction(g, s) }
      if (!applyAction(g, s, a).ok) { a = botAction(g, s); if (!applyAction(g, s, a).ok) break }
    }
    if (g.winner === null) draws++; else wins[(g.winner as number) ^ swap]++
  }
}
console.log(JSON.stringify({ candidate: CAND, a: wins[0], b: wins[1], draws }))
