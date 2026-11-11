// Review saved matches (see packages/server/src/localReplays.ts).
//
//   npm run replay:review                 list the review queue (match-replays/review) and other saved games
//   npm run replay:review -- <name>       open one game (any part of its file name) and, for each flagged
//                                         moment: the board, the log leading up to it, what was played
//                                         next, and what each bot would choose in that position today
//   npm run replay:review -- <name> --at 120    inspect the position after action 120 instead of the flags
//
// A replay is deterministic, so the position at any action can be rebuilt and handed to the bots again —
// which is how a flagged misplay becomes a test the bot has to pass.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyAction, avatarOf, cloneState, getCard, actingSeatFor, type GameState, type PlayerId, type Action } from '../packages/shared/src'
import { replayStateAt, type ReplayRecord } from '../packages/client/src/replay'
import { botAction } from '../packages/client/src/bot'
import { searchBotAction, DEFAULT_SEARCH } from '../packages/client/src/bot_search'

const DIR = process.env.LOCAL_REPLAY_DIR && process.env.LOCAL_REPLAY_DIR !== 'off' ? process.env.LOCAL_REPLAY_DIR : 'match-replays'
const args = process.argv.slice(2)
const atArg = args.includes('--at') ? Number(args[args.indexOf('--at') + 1]) : null
const pick = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--at')

interface Saved { savedAt: string; codeCommit: string | null; finished: boolean; winner: string | null; turns: number | null; botDifficulty: string | null; flags: { at: number; turn: number; note: string }[]; replay: ReplayRecord }
const files = (folder: string): string[] => (existsSync(join(DIR, folder)) ? readdirSync(join(DIR, folder)).filter((f) => f.endsWith('.json')).sort().map((f) => join(folder, f)) : [])
const load = (rel: string): Saved => JSON.parse(readFileSync(join(DIR, rel), 'utf8'))

function describe(g: GameState, a: Action): string {
  const any = a as any
  const card = any.cardId ? g.cards[any.cardId]?.name : undefined
  const unit = (id?: string) => (id && g.units[id] ? `${g.units[id].name}@${g.units[id].x},${g.units[id].y}` : id)
  switch (a.t) {
    case 'castSpell': return `cast ${card}${any.at ? ` at ${any.at.x},${any.at.y}` : ''}${any.targets?.length ? ` → ${JSON.stringify(any.targets)}` : ''}`
    case 'activate': return `use ${g.units[any.sourceId]?.name ?? g.sites[any.sourceId]?.name ?? g.artifacts[any.sourceId]?.name ?? any.sourceId}:${any.ability}`
    case 'prompt': return `answer "${String(g.prompts[0]?.title ?? g.prompts[0]?.kind ?? '').slice(0, 60)}" → ${JSON.stringify(any.choice)}`
    case 'avatarSite': return `avatar: ${any.mode} site${card ? ` ${card}` : ''}`
    default: return `${a.t}${any.unitId ? ` ${unit(any.unitId)}` : ''}${any.attackerId ? ` ${unit(any.attackerId)}` : ''}${any.to ? ` → ${any.to.x},${any.to.y}` : ''}${any.targetId ? ` ⚔ ${unit(any.targetId) ?? any.targetId}` : ''}`
  }
}

function board(g: GameState, names: [string, string]): void {
  console.log(`  turn ${g.turn}, ${names[g.activePlayer]} to play, phase ${g.phase}${g.prompts[0] ? `, open prompt for ${names[g.prompts[0].player]}: "${g.prompts[0].title ?? g.prompts[0].kind}"` : ''}`)
  for (const p of [0, 1] as PlayerId[]) {
    const pl = g.players[p]
    let life: number | string = '?'
    try { life = avatarOf(g, p).life ?? '?' } catch { /* no avatar */ }
    const sites = Object.values(g.sites).filter((s) => s.controller === p && !s.isRubble).length
    console.log(`  ${names[p]}: life ${life}, mana ${pl.mana}, ${sites} sites, hand ${pl.hand.length} [${pl.hand.map((id) => g.cards[id]?.name).join(', ')}]`)
    const units = Object.values(g.units).filter((u) => u.controller === p)
    for (const u of units) {
      const def = getCard(u.name)
      const marks = [u.tapped ? 'tapped' : 'untapped', u.stealth ? 'stealth' : '', u.owner !== undefined && (u as any).owner !== p ? 'STOLEN' : '', u.damage ? `${u.damage} dmg` : ''].filter(Boolean).join(', ')
      console.log(`     ${u.isAvatar ? '★' : '·'} ${u.name} ${u.isAvatar ? '' : `${(def as any).power ?? '?'}/${(def as any).defence ?? (def as any).defense ?? '?'} `}at ${u.x},${u.y} ${u.region} (${marks})`)
    }
  }
}

function botChoices(g: GameState, names: [string, string]): void {
  const seat = g.prompts[0] ? actingSeatFor(g, g.prompts[0].player) : g.activePlayer
  const line = (label: string, choose: (s: GameState) => Action, steps: number) => {
    const s = cloneState(g)
    const out: string[] = []
    try {
      for (let i = 0; i < steps && s.phase !== 'over'; i++) {
        const who = s.prompts[0] ? actingSeatFor(s, s.prompts[0].player) : s.activePlayer
        if (who !== seat) break
        const a = choose(s)
        out.push(describe(s, a))
        if (!applyAction(s, seat, a).ok || a.t === 'endTurn') break
      }
    } catch (e: any) { out.push(`(error: ${String(e?.message ?? e).slice(0, 80)})`) }
    console.log(`  ${label} would play, as ${names[seat]}:`)
    out.forEach((o, i) => console.log(`     ${i + 1}. ${o}`))
  }
  line('Fast bot today', (s) => botAction(s, seat), 12)
  line('Thinking bot today (3 s)', (s) => searchBotAction(s, seat, { ...DEFAULT_SEARCH, timeBudgetMs: 3000 }), 12)
}

function inspect(saved: Saved, at: number, note?: string): void {
  const r = saved.replay
  const g = replayStateAt(r, at)
  console.log(`\n── after action ${at} of ${r.actions.length}${note !== undefined ? ` — flagged: "${note}"` : ''}`)
  board(g, r.names)
  console.log('  log just before:')
  g.log.slice(-8).forEach((e) => console.log(`     T${e.turn} ${e.msg}`))
  console.log('  played next in the game:')
  const walk = cloneState(g)
  for (let i = at; i < Math.min(r.actions.length, at + 12); i++) {
    const { seat, action } = r.actions[i]
    console.log(`     ${i + 1}. ${r.names[seat]}: ${describe(walk, action)}`)
    try { applyAction(walk, seat, action) } catch { break }
  }
  botChoices(g, r.names)
}

if (!pick) {
  const queue = files('review')
  console.log(`Review queue (${join(DIR, 'review')}): ${queue.length} game(s)`)
  for (const f of queue) {
    const s = load(f)
    console.log(`\n  ${f}\n    ${s.replay.decks[0].name} vs ${s.replay.decks[1].name}${s.botDifficulty ? ` · ${s.botDifficulty} bot` : ''} · ${s.finished ? `won by ${s.winner}` : 'unfinished'} · turn ${s.turns} · code ${s.codeCommit ?? '?'}`)
    s.flags.forEach((fl) => console.log(`    🚩 turn ${fl.turn}, action ${fl.at}: ${fl.note || '(no note)'}`))
  }
  console.log(`\nOther saved games (${join(DIR, 'games')}): ${files('games').length}`)
  console.log('Open one with: npm run replay:review -- <part of the file name>')
} else {
  const match = [...files('review'), ...files('games')].filter((f) => f.includes(pick))
  if (match.length !== 1) { console.error(match.length ? `"${pick}" matches ${match.length} files:\n  ${match.join('\n  ')}` : `No saved game matches "${pick}".`); process.exit(1) }
  const saved = load(match[0])
  console.log(`${match[0]}\n${saved.replay.decks[0].name} (${saved.replay.names[0]}) vs ${saved.replay.decks[1].name} (${saved.replay.names[1]})${saved.botDifficulty ? ` · ${saved.botDifficulty} bot` : ''} · ${saved.finished ? `won by ${saved.winner}` : 'unfinished'} · played on code ${saved.codeCommit ?? '?'}`)
  if (atArg !== null) inspect(saved, atArg)
  else if (saved.flags.length) saved.flags.forEach((fl) => inspect(saved, fl.at, fl.note))
  else console.log('No flagged moments in this game. Use --at <action number> to inspect a position.')
}
