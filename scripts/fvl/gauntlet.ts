// Deck gauntlet: one deck against the field of meta decks, bot against bot.
//   npx tsx scripts/fvl/gauntlet.ts <deck key> [games per opponent=16] [seed=1] [fast|search:<ms>] [part i/n]
// Prints one JSON line: { deck, games, wins, losses, draws, byOpp }
import { createGame, applyAction, featuredDecks, validateDeck, type PlayerId, type DeckList } from '../../packages/shared/src'
import '../../packages/shared/src/cards/scripts/index'
import { botAction, botNeedsToAct } from '../../packages/client/src/bot'
import { searchBotAction, DEFAULT_SEARCH, resetSearchState } from '../../packages/client/src/bot_search'
import { DECKS } from './decks'

const [key, gArg, sArg, botArg, partArg] = process.argv.slice(2)
const GAMES = Number(gArg ?? 16), SEED = Number(sArg ?? 1)
const searchMs = botArg?.startsWith('search') ? Number(botArg.split(':')[1] ?? 300) : 0
const [pi, pn] = (partArg ?? '0/1').split('/').map(Number)
const all: Record<string, DeckList> = { ...Object.fromEntries((featuredDecks as DeckList[]).map((d) => [d.name, d])), ...DECKS }
const deck = all[key]
if (!deck) { console.error('no deck', key, Object.keys(all)); process.exit(1) }
const errs = validateDeck(deck).filter((p) => p.level === 'error')
if (errs.length) { console.error('ILLEGAL', key, errs.map((e) => e.msg)); process.exit(1) }
const field = (featuredDecks as DeckList[]).filter((d) => !/FvL precon/.test(d.name) && d.name !== key).filter((_, i) => i % pn === pi)
const act = (g: any, s: PlayerId) => { if (searchMs) { try { return searchBotAction(g, s, { ...DEFAULT_SEARCH, timeBudgetMs: searchMs }) } catch { /* fall through */ } } return botAction(g, s) }
const byOpp: Record<string, [number, number, number]> = {}
let w = 0, l = 0, d = 0, turns = 0
for (const opp of field) {
  const rec: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < GAMES; i++) {
    const mySeat = (i % 2) as PlayerId
    const decks = mySeat === 0 ? [deck, opp] : [opp, deck]
    const g = createGame(decks as [DeckList, DeckList], ['A', 'B'], SEED * 100003 + i * 7919 + opp.name.length * 31, (Math.floor(i / 2) % 2) as PlayerId)
    resetSearchState()
    let n = 0; const t0 = Date.now()
    while (g.winner === null && g.phase !== 'over' && n++ < 6000 && g.turn <= 70 && Date.now() - t0 < (searchMs ? 240000 : 60000)) {
      const s = ([0, 1] as PlayerId[]).find((x) => botNeedsToAct(g, x)); if (s === undefined) break
      let a = act(g, s)
      if (!applyAction(g, s, a).ok) { a = botAction(g, s); if (!applyAction(g, s, a).ok) break }
    }
    if (g.winner === mySeat) { rec[0]++; w++ } else if (g.winner === null) { rec[2]++; d++ } else { rec[1]++; l++ }
    turns += g.turn
  }
  byOpp[opp.name] = rec
}
console.log(JSON.stringify({ deck: key, games: w + l + d, wins: w, losses: l, draws: d, avgTurns: Math.round(turns / Math.max(1, w + l + d)), byOpp }))
