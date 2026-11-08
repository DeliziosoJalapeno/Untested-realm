// Target-enumeration benchmark: times the bots' move generation on a FIXED corpus of game states, so a
// change to how legal targets are enumerated can be compared before/after on identical inputs.
//
//   npx tsx scripts/bench_targets.ts --gen corpus.json      play seeded Fast-bot games, save states
//   npx tsx scripts/bench_targets.ts --run corpus.json      time expandActions / Fast bot / search bot
//
// The corpus has the main-phase states the games went through, plus a "heavy" copy of each with a hand
// full of targeted spells (dependent picks, targetOptions, multi-target) and the mana to cast them.
// --run prints medians and a fingerprint of the generated actions, so a behaviour change shows up too.

import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { createGame, applyAction, starterDecks, getCard, type GameState, type PlayerId, type Action } from '../packages/shared/src'
import { expandActions } from '../packages/shared/src/bot/moves'
import { botAction as fastBotAction, botNeedsToAct } from '../packages/client/src/bot'
import { searchBotAction, DEFAULT_SEARCH } from '../packages/client/src/bot_search'

const argv = process.argv.slice(2)
const arg = (name: string): string | undefined => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }

const HEAVY = [
  'Blink', 'Trial by Water', 'Meteor Shower', 'Major Explosion', 'Minor Explosion', 'Lightning Bolt',
  'Displace', 'Abyssal Assault', 'Grapple Shot', 'Lure', 'Extinguish', 'Stone Rain', 'Incinerate',
  'Chain Lightning', 'Dispel', 'Unravel', 'Cave-In', 'Riptide', 'Fireball', 'Bury',
]

function gen(out: string) {
  const decks = starterDecks
  const states: GameState[] = []
  let gi = 0
  for (let a = 0; a < decks.length && gi < 6; a++) {
    const g = createGame([decks[(a * 2) % decks.length], decks[(a * 2 + 1) % decks.length]], ['P0', 'P1'], 0x5eed00 + gi, (gi % 2) as PlayerId)
    gi++
    let steps = 0, decisions = 0
    while (g.phase !== 'over' && steps++ < 1500 && g.turn <= 14) {
      const seat: PlayerId | null = botNeedsToAct(g, 0) ? 0 : botNeedsToAct(g, 1) ? 1 : null
      if (seat === null) { if (!applyAction(g, g.activePlayer, { t: 'endTurn' }).ok) break; continue }
      if (g.phase === 'main' && !g.prompts.length && seat === g.activePlayer && decisions++ % 4 === 0) states.push(JSON.parse(JSON.stringify(g)))
      let action: Action
      try { action = fastBotAction(g, seat) } catch { action = { t: 'endTurn' } }
      if (!applyAction(g, seat, action).ok) {
        const fb: Action = g.prompts[0]?.player === seat ? { t: 'prompt', promptId: g.prompts[0].id, choice: null } : { t: 'endTurn' }
        if (!applyAction(g, seat, fb).ok) applyAction(g, seat, { t: 'concede' })
      }
    }
  }
  // heavy variants: the same boards with a hand of targeted spells, mana and thresholds waived
  const heavy = states.map((s) => {
    const g: GameState = JSON.parse(JSON.stringify(s))
    const me = g.activePlayer
    for (const name of HEAVY) {
      try { getCard(name) } catch { continue }
      const id = `cbench${g.nextId++}`
      g.cards[id] = { id, name, owner: me } as any
      g.players[me].hand.push(id)
    }
    g.players[me].mana += 30
    g.flow = g.flow ?? {}
    g.flow.noThreshold = { ...(g.flow.noThreshold ?? {}), [me]: g.turn }
    return g
  })
  writeFileSync(out, JSON.stringify({ normal: states, heavy }))
  console.log(`corpus: ${states.length} normal + ${heavy.length} heavy states → ${out}`)
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const clone = (g: GameState): GameState => JSON.parse(JSON.stringify(g))
const fp = (xs: unknown[]) => createHash('sha1').update(JSON.stringify(xs)).digest('hex').slice(0, 10)

function timeIt(label: string, states: GameState[], reps: number, fn: (g: GameState) => unknown): void {
  const results: unknown[] = []
  for (const s of states.slice(0, 5)) fn(clone(s)) // warm-up (JIT)
  const times: number[] = []
  for (let r = 0; r < reps; r++) {
    const copies = states.map(clone) // cloning stays out of the timed region
    const t0 = performance.now()
    for (const g of copies) { const v = fn(g); if (r === 0) results.push(v) }
    times.push(performance.now() - t0)
  }
  console.log(`${label.padEnd(34)} median ${median(times).toFixed(0).padStart(6)} ms  (runs: ${times.map((t) => t.toFixed(0)).join(', ')})  fingerprint ${fp(results)}`)
}

function run(file: string) {
  const { normal, heavy } = JSON.parse(readFileSync(file, 'utf8')) as { normal: GameState[]; heavy: GameState[] }
  console.log(`corpus: ${normal.length} normal + ${heavy.length} heavy states`)
  const describe = (xs: { action: Action }[]) => xs.map((x) => JSON.stringify(x.action)).sort()
  for (const [name, set] of [['normal', normal], ['heavy', heavy]] as const) {
    timeIt(`expandActions (${name})`, set, 5, (g) => describe(expandActions(g, g.activePlayer, { minionCasters: true })))
    const casts = set.reduce((n, s) => n + expandActions(clone(s), s.activePlayer, { minionCasters: true }).filter((x) => x.action.t === 'castSpell').length, 0)
    console.log(`  castSpell actions generated (${name}): ${casts}`)
    timeIt(`Fast bot (${name})`, set, 5, (g) => JSON.stringify(fastBotAction(g, g.activePlayer)))
  }
  // the thinking bot with a fixed node budget and no deadline: time measures per-node cost, not the clock
  const searchSet = [...normal.filter((_, i) => i % 6 === 0), ...heavy.filter((_, i) => i % 6 === 0)]
  const cfg = { ...DEFAULT_SEARCH, timeBudgetMs: 10 * 60_000, nodeBudget: 1500 }
  timeIt(`search bot (${searchSet.length} states, 1500 nodes)`, searchSet, 3, (g) => JSON.stringify(searchBotAction(g, g.activePlayer, cfg)))
}

const g = arg('gen'), r = arg('run')
if (g) gen(g)
else if (r) run(r)
else console.log('usage: --gen <corpus.json> | --run <corpus.json>')
