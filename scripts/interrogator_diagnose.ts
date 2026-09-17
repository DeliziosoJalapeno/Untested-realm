// Per-turn diagnostic of the Interrogator loss (game 1: seed 999, search=seat0 vs procedural=seat1).
// Logs, durably: every action both bots take, a per-turn board summary, and — at the START of each
// search-bot turn — the explainEval term breakdown (what the bot is actually optimising toward) plus
// how much its own eval moved over the turn. Goal: find the concrete recurring mistake.
//   npx tsx scripts/interrogator_diagnose.ts [searchMs]
import { appendFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createGame, applyAction, explainEval, avatarOf, type Action, type GameState, type PlayerId } from '../packages/shared/src'
import { communityDecks } from '../packages/shared/src/cards/communityDecks'
import { botAction, botNeedsToAct } from '../packages/client/src/bot'
import { searchBotAction, searchBotNeedsToAct, DEFAULT_SEARCH } from '../packages/client/src/bot_search'

const MS = Number(process.argv[2] ?? 5000)
const LOG = resolve(process.cwd(), 'interrogator_diagnose.log')
const log = (s: string) => { appendFileSync(LOG, s + '\n'); process.stdout.write(s + '\n') }
writeFileSync(LOG, '')

const deck = communityDecks.find((d) => /Interrogator/i.test(d.name))!
const SEARCH: PlayerId = 0
const PROC: PlayerId = 1
const g = createGame([deck, deck], ['SRCH', 'PROC'], 999, 0)
log(`deck: ${deck.name}  |  search=seat${SEARCH} @ ${MS}ms  |  seed 999`)

const nm = (s: GameState, id?: string) => (id && s.units[id]?.name) || (id && s.sites[id]?.name) || (id && s.artifacts[id]?.name) || id || '?'
const loc = (s: GameState, id?: string) => { const u = id ? s.units[id] : undefined; return u ? `(${u.x},${u.y})` : '' }

function describe(s: GameState, seat: PlayerId, a: Action): string {
  switch (a.t) {
    case 'moveAttack': {
      const u = s.units[a.unitId]
      const dest = a.path?.length ? a.path[a.path.length - 1] : u
      const atk = a.attack ? ('unit' in a.attack ? ` ⚔ ${nm(s, (a.attack as any).unit)}` : ` 🔥site ${nm(s, (a.attack as any).site)}`) : ''
      return `move ${u?.name} ${loc(s, a.unitId)}→(${dest?.x},${dest?.y})${atk}`
    }
    case 'castSpell': { const c = s.cards[(a as any).cardId]; const at = (a as any).at; return `cast ${c?.name}${at ? ` @(${at.x},${at.y})` : ''}` }
    case 'avatarSite': return `${(a as any).mode === 'draw' ? 'draw-site' : 'play-site'}${(a as any).cardId ? ' ' + s.cards[(a as any).cardId]?.name : ''}`
    case 'activate': return `activate ${nm(s, (a as any).sourceId)}·${(a as any).ability}`
    case 'prompt': { const p = s.prompts[0]; return `answer[${p?.kind}] ${JSON.stringify((a as any).choice)}` }
    case 'moveEnd': case 'endTurn': return 'endTurn'
    default: return a.t
  }
}

function boardLine(s: GameState): string {
  const c = (p: PlayerId, pred: (u: any) => boolean) => Object.values(s.units).filter((u) => u.controller === p && !u.carriedBy && !u.isAvatar && pred(u)).length
  const sites = (p: PlayerId) => Object.values(s.sites).filter((x) => x.controller === p && !x.isRubble).length
  return `life S:${avatarOf(s, SEARCH).life}/P:${avatarOf(s, PROC).life}  hand S:${s.players[SEARCH].hand.length}/P:${s.players[PROC].hand.length}  units S:${c(SEARCH, () => true)}/P:${c(PROC, () => true)}  sites S:${sites(SEARCH)}/P:${sites(PROC)}`
}

function evalBreakdown(s: GameState): string {
  const { total, terms } = explainEval(s, SEARCH)
  const top = Object.entries(terms).filter(([, v]) => Math.abs(v) > 0.5).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  return `eval(SRCH)=${total.toFixed(0)}  { ${top.map(([k, v]) => `${k}:${v.toFixed(0)}`).join(', ')} }`
}

const bots = [searchBotAction, botAction] as const
const needs = [searchBotNeedsToAct, botNeedsToAct] as const
let lastTurn = -1, turnActs = 0, evalAtTurnStart = 0
while (g.phase !== 'over' && g.turn <= 60) {
  if (g.turn !== lastTurn) {
    lastTurn = g.turn; turnActs = 0
    log(`\n── T${g.turn}  active=seat${g.activePlayer}${g.activePlayer === SEARCH ? '(SRCH)' : '(PROC)'}  ${boardLine(g)}`)
    if (g.activePlayer === SEARCH && g.phase === 'main') { log('   ' + evalBreakdown(g)); evalAtTurnStart = explainEval(g, SEARCH).total }
  }
  const seat: PlayerId = needs[0](g, 0) ? 0 : needs[1](g, 1) ? 1 : g.activePlayer
  if (!needs[0](g, 0) && !needs[1](g, 1)) { if (!applyAction(g, g.activePlayer, { t: 'endTurn' }).ok) break; continue }
  if (++turnActs > 300) { applyAction(g, seat, { t: 'endTurn' }); continue }

  const handBefore = g.players[seat].hand.length
  let action: Action
  try { action = bots[seat](g, seat) } catch (e) { log(`  seat${seat} THREW ${(e as Error).message}`); action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : g.phase === 'mulligan' ? { t: 'keepHand' } : { t: 'endTurn' } }
  const desc = g.phase === 'mulligan' ? `mulligan ${JSON.stringify((action as any).back ?? [])}` : describe(g, seat, action)
  const res = applyAction(g, seat, action)
  const drew = g.players[seat].hand.length > handBefore ? ' +DREW' : ''
  const tag = seat === SEARCH ? 'SRCH' : 'PROC'
  if (g.phase !== 'mulligan') log(`  ${tag}: ${desc}${drew}${res.ok ? '' : ' [ILLEGAL:' + res.error + ']'}`)
  if (!res.ok) { const fb: Action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : { t: 'endTurn' }; if (!applyAction(g, seat, fb).ok) break }

  // when control leaves the search seat's turn, report how much it moved its own eval
  if (seat === SEARCH && action.t === 'endTurn') log(`   → SRCH turn Δeval ${(explainEval(g, SEARCH).total - evalAtTurnStart).toFixed(0)}  ${evalBreakdown(g)}`)
}
const won = g.winner === SEARCH
log(`\n=== RESULT: ${won ? 'SRCH WINS' : g.winner === PROC ? 'PROC WINS' : 'draw/cap'} on turn ${g.turn}  ${boardLine(g)} ===`)
