// Focused check: does the eval rework fix the Interrogator matchup (was 0-for-10)?
// Plays the search bot vs the procedural bot on ONLY the Interrogator mirror, both seats.
//   npx tsx scripts/interrogator_check.ts [games] [searchMs]
import { appendFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createGame, applyAction, type Action, type GameState, type PlayerId } from '../packages/shared/src'
import { communityDecks } from '../packages/shared/src/cards/communityDecks'
import { botAction, botNeedsToAct } from '../packages/client/src/bot'
import { searchBotAction, searchBotNeedsToAct, DEFAULT_SEARCH } from '../packages/client/src/bot_search'

// Durable, synchronous log — every line hits disk immediately, so watching the file (or a mid-run
// check) always shows live progress, never a buffered blackout.
const GAMES = Number(process.argv[2] ?? 4)
const MS = Number(process.argv[3] ?? 3000)
const MAXTURN = 60
const LOG = resolve(process.cwd(), `interrogator_check_${MS}ms.log`) // budget-specific → runs never collide
const log = (s: string) => { appendFileSync(LOG, s + '\n'); process.stdout.write(s + '\n') }
const deck = communityDecks.find((d) => /Interrogator/i.test(d.name))!
writeFileSync(LOG, '')
log(`deck: ${deck.name}  |  ${GAMES} games @ ${MS}ms`)

type BotFn = (g: GameState, s: PlayerId) => Action
const searchFn: BotFn = (g, s) => searchBotAction(g, s, { ...DEFAULT_SEARCH, timeBudgetMs: MS })

let wins = 0, losses = 0, draws = 0, crashes = 0
for (let i = 0; i < GAMES; i++) {
  const searchSeat: PlayerId = (i % 2) as PlayerId
  const g = createGame([deck, deck], ['SRCH', 'PROC'], (999 + i * 7919) >>> 0, (i % 2) as PlayerId)
  const bots: [BotFn, BotFn] = searchSeat === 0 ? [searchFn, botAction] : [botAction, searchFn]
  const needs = searchSeat === 0 ? [searchBotNeedsToAct, botNeedsToAct] : [botNeedsToAct, searchBotNeedsToAct]
  let cap = 0, lastTurn = g.turn, turnActs = 0
  const t0 = Date.now()
  while (g.phase !== 'over' && g.turn <= MAXTURN) {
    const seat: PlayerId = needs[0](g, 0) ? 0 : needs[1](g, 1) ? 1 : g.activePlayer
    if (g.turn !== lastTurn) { lastTurn = g.turn; turnActs = 0 }
    if (++turnActs > 400) { applyAction(g, seat, { t: 'endTurn' }); continue }
    if (!needs[0](g, 0) && !needs[1](g, 1)) { if (!applyAction(g, g.activePlayer, { t: 'endTurn' }).ok) break; continue }
    let action: Action
    try { action = bots[seat](g, seat) } catch (e) {
      if (seat === searchSeat) { crashes++; log('  threw: ' + (e as Error).message) }
      action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
    }
    const res = applyAction(g, seat, action)
    if (!res.ok) {
      if (seat === searchSeat) { crashes++; log('  illegal: ' + res.error) }
      const fb: Action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' }
      if (!applyAction(g, seat, fb).ok) { applyAction(g, seat, { t: 'concede' }); break }
    }
  }
  const won = g.winner === searchSeat, lost = g.winner === (1 - searchSeat)
  if (won) wins++; else if (lost) losses++; else draws++
  log(`game ${i + 1} (search=seat${searchSeat}): ${won ? 'W' : lost ? 'L' : 'D'}  turns=${g.turn}  ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}
log(`\nSEARCH vs PROC on Interrogator: ${wins}W ${losses}L ${draws}D  crashes=${crashes}`)
