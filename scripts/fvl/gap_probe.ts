// How often does Claude's move match the engine's, by how sure the engine was? (saved Claude games)
import { readFileSync } from 'node:fs'
import { applyAction, cloneState, type PlayerId } from '../../packages/shared/src'
import '../../packages/shared/src/cards/scripts/index'
import { botAction, botNeedsToAct, botActionKey } from '../../packages/client/src/bot'
import { searchBotAction, DEFAULT_SEARCH, resetSearchState, lastRootGap } from '../../packages/client/src/bot_search'
import { claudeDefers } from '../../packages/client/src/claude_bot'
import { replayInitialState } from '../../packages/client/src/replay'
const rows: { gap: number; same: boolean; kind: string }[] = []
for (const file of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(file, 'utf8')).replay
  const g = replayInitialState(r)
  let planTurn = -1
  for (const { seat, action } of r.actions) {
    if (seat === 1 && g.phase !== 'mulligan' && botNeedsToAct(g, 1 as PlayerId) && !claudeDefers(g)) {
      resetSearchState()
      let e; try { e = searchBotAction(cloneState(g), 1 as PlayerId, { ...DEFAULT_SEARCH, timeBudgetMs: 1500 }) } catch { e = botAction(g, 1 as PlayerId) }
      rows.push({ gap: lastRootGap(), same: botActionKey(e) === botActionKey(action), kind: g.prompts[0]?.kind ?? (g.turn !== planTurn ? 'turn start' : 'mid turn') })
      planTurn = g.turn
    }
    try { applyAction(g, seat, action) } catch { /* keep going */ }
  }
}
const buckets: [string, (x: number) => boolean][] = [['<=25', (x) => x <= 25], ['25-75', (x) => x > 25 && x <= 75], ['75-150', (x) => x > 75 && x <= 150], ['150-300', (x) => x > 150 && x <= 300], ['>300', (x) => x > 300 && x < Infinity], ['only move', (x) => x === Infinity]]
for (const [name, f] of buckets) { const b = rows.filter((x) => f(x.gap)); console.log(name.padEnd(10), 'n', String(b.length).padStart(3), 'same', b.filter((x) => x.same).length) }
const kinds = [...new Set(rows.map((x) => x.kind))]
for (const k of kinds) { const b = rows.filter((x) => x.kind === k); console.log(k.padEnd(14), 'n', b.length, 'same', b.filter((x) => x.same).length) }
