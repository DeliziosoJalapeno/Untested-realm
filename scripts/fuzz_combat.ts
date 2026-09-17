// Combat/deathrite smoke: for every Minion, exercise the trigger paths that
// cast-smoke can't reach — striking a minion, striking an avatar, being struck,
// and dying (deathrite). Catches THROWN exceptions only (real crashes).
//   npx tsx scripts/fuzz_combat.ts [--verbose] [--only "Card Name"]
import { createGame, applyAction, killUnit, starterDecks, type GameState, type PlayerId, type Action } from '../packages/shared/src'
import { allCards } from '../packages/shared/src/cards/db'
import '../packages/shared/src/cards/scripts/index'

const VERBOSE = process.argv.includes('--verbose')
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

function rng(seed: number) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 }
type Crash = { card: string; stage: string; err: string; stack: string }
const crashes: Crash[] = []
const cov = { attacked: 0, killed: 0 }

function place(g: GameState, p: PlayerId, name: string, x: number, y: number) {
  const cardId = `fz${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `fzs${g.nextId++}`
  g.sites[id] = { id, cardId, name, owner: p, controller: p, x, y, tapped: false, isRubble: false } as any
}
function summon(g: GameState, p: PlayerId, name: string, x: number, y: number) {
  const cardId = `fz${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `fzu${g.nextId++}`
  g.units[id] = { id, cardId, name, owner: p, controller: p, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: -5, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as any
  return id
}
function base(): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 7, 0)
  applyAction(g, 0, { t: 'keepHand' }); applyAction(g, 1, { t: 'keepHand' })
  for (let y = 0; y < 4; y++) for (let x = 1; x <= 3; x++) place(g, x < 2 ? 0 : 1, 'Rustic Village', x, y)
  return g
}
function answerFor(g: GameState, rand: () => number): any {
  const p = g.prompts[0]; const d = p.data ?? {}
  switch (p.kind) {
    case 'drawDeck': return 'atlas'
    case 'defend': { const c = d.candidates ?? []; return rand() < 0.5 && c.length ? [c[0]] : [] }
    case 'intercept': { const c = d.candidates ?? []; return rand() < 0.5 && c.length ? c[0] : null }
    case 'stayInFight': return rand() < 0.5
    case 'yesNo': return rand() < 0.5
    case 'chooseOption': return (d.options ?? [])[Math.floor(rand() * (d.options?.length || 1))] ?? null
    case 'nameCard': return (d.names ?? [])[0] ?? 'Foot Soldier'
    case 'chooseCards': { const n = (d.cards ?? []).length; if (!n) return []; return [0] }
    case 'orderCards': return (d.cards ?? []).map((_: any, i: number) => i)
    case 'allocateDamage': { const c = d.candidates ?? []; const a: any = {}; if (c.length) a[c[0]] = d.power ?? 0; return { strikerId: d.strikerId, allocation: a } }
    case 'chooseTargets': { if (d.upTo) return []; const c = d.candidates ?? d.ids ?? []; if (c.length) return [c[0]]; const pool = d.kind === 'site' ? Object.keys(g.sites) : Object.keys(g.units); return pool.length ? [pool[0]] : [] }
    default: return null
  }
}
function drain(g: GameState, rand: () => number) {
  let guard = 0
  while (g.prompts.length && guard++ < 80) {
    const before = g.prompts[0].id
    const pr = g.prompts[0]
    const res = applyAction(g, pr.player, { t: 'prompt', promptId: pr.id, choice: answerFor(g, rand) })
    if (!res.ok && g.prompts[0]?.id === before) {
      let escaped = false
      for (const alt of [[], null, false, true]) { const r2 = applyAction(g, g.prompts[0].player, { t: 'prompt', promptId: g.prompts[0].id, choice: alt }); if (r2.ok || g.prompts[0]?.id !== before) { escaped = true; break } }
      if (!escaped) return
    }
  }
}
function record(card: string, stage: string, e: any) {
  crashes.push({ card, stage, err: String(e?.message ?? e), stack: String(e?.stack ?? '').split('\n').slice(0, 6).join('\n') })
}
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

function scenarios(name: string) {
  const rand = rng(hash(name))
  // 1) attacker strikes an enemy minion (adjacent)
  run(name, 'strike-minion', rand, (g) => {
    const atk = summon(g, 0, name, 2, 1); const def = summon(g, 1, 'Foot Soldier', 2, 2)
    const r = applyAction(g, 0, { t: 'moveAttack', unitId: atk, path: [], attack: { unit: def } } as Action)
    if (r.ok) cov.attacked++
  })
  // 2) attacker strikes the enemy avatar
  run(name, 'strike-avatar', rand, (g) => {
    const atk = summon(g, 0, name, 2, 2); const av = g.players[1].avatarUnitId
    applyAction(g, 0, { t: 'moveAttack', unitId: atk, path: [], attack: { unit: av } } as Action)
  })
  // 3) minion is struck by an enemy attacker
  run(name, 'be-struck', rand, (g) => {
    summon(g, 0, name, 2, 2); const atk = summon(g, 1, 'Foot Soldier', 2, 1)
    const victim = Object.values(g.units).find((u) => u.name === name && u.controller === 0)!
    applyAction(g, 1, { t: 'moveAttack', unitId: atk, path: [], attack: { unit: victim.id } } as Action)
  })
  // 4) minion dies → deathrite
  run(name, 'deathrite', rand, (g) => {
    const id = summon(g, 0, name, 2, 1); killUnit(g, id); cov.killed++
  })
}
function run(name: string, stage: string, rand: () => number, setup: (g: GameState) => void) {
  let g: GameState
  try { g = base() } catch (e) { record(name, stage + '/base', e); return }
  try { setup(g) } catch (e) { record(name, stage, e); return }
  try { drain(g, rand) } catch (e) { record(name, stage + '/drain', e) }
}

const pool = (ONLY ? allCards.filter((c) => c.name === ONLY) : allCards).filter((c) => c.type === 'Minion')
let n = 0
for (const c of pool) { n++; if (n % 100 === 0) console.error(`... ${n}/${pool.length}`); scenarios(c.name) }

console.log(`\n=== fuzz_combat: ${pool.length} minions, ${crashes.length} crashes ===`)
console.log('coverage:', cov)
const byStage: Record<string, number> = {}
for (const c of crashes) byStage[c.stage] = (byStage[c.stage] ?? 0) + 1
console.log('crashes by stage:', byStage)
for (const c of crashes) { console.log(`\n■ ${c.card} @ ${c.stage}\n  err: ${c.err}`); if (VERBOSE) console.log(c.stack.split('\n').map((l) => '    ' + l).join('\n')) }
