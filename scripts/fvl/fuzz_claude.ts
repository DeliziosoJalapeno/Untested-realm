// Find crashes in the Claude opponent's request builder: play bot games and build the request at every
// decision of the bot's seat, without calling the API.  npx tsx scripts/fvl/fuzz_claude.ts [games]
import { createGame, applyAction, featuredDecks, type PlayerId, type DeckList } from '../../packages/shared/src'
import '../../packages/shared/src/cards/scripts/index'
import { botAction, botNeedsToAct } from '../../packages/client/src/bot'
import { candidates, buildRequest, analyze } from '../../packages/client/src/claude_bot'
import { DECKS } from './decks'
const N = Number(process.argv[2] ?? 30)
const field = (featuredDecks as DeckList[]).filter((d) => !/FvL/.test(d.name))
const seen = new Map<string, number>()
let decisions = 0
for (let i = 0; i < N; i++) {
  const bot = i % 3 === 0 ? field.find((d) => /Ironclad/.test(d.name))! : field[i % field.length]
  const g = createGame([DECKS['Cold Snap'], bot], ['You', 'Computer'], 9000 + i, (i % 2) as PlayerId)
  let n = 0
  while (g.winner === null && g.phase !== 'over' && n++ < 5000 && g.turn <= 60) {
    const s = ([0, 1] as PlayerId[]).find((x) => botNeedsToAct(g, x)); if (s === undefined) break
    const a = botAction(g, s)
    if (s === 1 && g.phase !== 'mulligan') {
      decisions++
      try { const c = candidates(g, 1); const an = n % 7 === 0 ? analyze(g, 1, 150) : null; buildRequest(g, 1, c, a, '', an as any) }
      catch (e) { const st = String((e as Error).stack ?? e).split('\n').slice(0, 5).join(' | '); if (!seen.has(st)) console.log(`game ${i} turn ${g.turn} prompt=${g.prompts[0]?.kind ?? '-'}: ${st}`); seen.set(st, (seen.get(st) ?? 0) + 1) }
    }
    if (!applyAction(g, s, a).ok) break
  }
}
console.log('decisions checked', decisions, 'distinct crashes', seen.size, [...seen.values()])
