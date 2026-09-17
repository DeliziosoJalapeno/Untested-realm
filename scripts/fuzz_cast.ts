// Cast-smoke fuzzer: cast/play every card in a controlled board, auto-resolve
// prompts with validly-shaped choices, and catch THROWN exceptions — those are
// real engine/script crashes (dispatch() doesn't wrap script execution).
// Validation failures (ok:false) are NOT bugs and are ignored.
//
//   npx tsx scripts/fuzz_cast.ts [--verbose] [--only "Card Name"]
import { createGame, applyAction, starterDecks, type GameState, type PlayerId, type Action } from '../packages/shared/src'
import { allCards, getCard } from '../packages/shared/src/cards/db'
import { getScript } from '../packages/shared/src/cards/scripts/registry'
import '../packages/shared/src/cards/scripts/index'

const VERBOSE = process.argv.includes('--verbose')
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

// tiny seeded RNG so runs are reproducible
function rng(seed: number) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 }

type Crash = { card: string; stage: string; action?: any; err: string; stack: string }
const crashes: Crash[] = []
const cov = { castOk: 0, noShape: 0, abilitiesRun: 0 }
const noShapeCards: string[] = []

function board(): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 7, 0)
  applyAction(g, 0, { t: 'keepHand' })
  applyAction(g, 1, { t: 'keepHand' })
  // give a castable context: friendly + enemy sites and minions
  place(g, 0, 'Rustic Village', 2, 0) // under p0 avatar
  place(g, 0, 'Rustic Village', 2, 1)
  place(g, 1, 'Rustic Village', 2, 3) // under p1 avatar
  place(g, 1, 'Rustic Village', 2, 2)
  summon(g, 0, 'Foot Soldier', 2, 1)
  summon(g, 1, 'Foot Soldier', 2, 2)
  return g
}
function place(g: GameState, p: PlayerId, name: string, x: number, y: number) {
  const cardId = `fz${g.nextId++}`
  g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `fzs${g.nextId++}`
  g.sites[id] = { id, cardId, name, owner: p, controller: p, x, y, tapped: false, isRubble: false } as any
  return id
}
function summon(g: GameState, p: PlayerId, name: string, x: number, y: number) {
  const cardId = `fz${g.nextId++}`
  g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `fzu${g.nextId++}`
  g.units[id] = { id, cardId, name, owner: p, controller: p, isAvatar: false, x, y, region: 'surface', tapped: false, damage: 0, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as any
  return id
}
function inject(g: GameState, p: PlayerId, name: string) {
  const id = `fzc${g.nextId++}`
  g.cards[id] = { id, name, owner: p } as any
  g.players[p].hand.push(id)
  return id
}

// answer a prompt with a validly-shaped random choice for its kind
function answerFor(g: GameState, rand: () => number): any {
  const p = g.prompts[0]
  const d = p.data ?? {}
  switch (p.kind) {
    case 'drawDeck': return rand() < 0.5 ? 'spellbook' : 'atlas'
    case 'defend': return []
    case 'intercept': return null
    case 'stayInFight': return rand() < 0.5
    case 'yesNo': return rand() < 0.5
    case 'chooseOption': return (d.options ?? [])[Math.floor(rand() * (d.options?.length || 1))] ?? null
    case 'chooseSquare': return (d.squares ?? [])[Math.floor(rand() * (d.squares?.length || 1))] ?? { x: 2, y: 1 }
    case 'nameCard': return (d.names ?? [])[0] ?? 'Foot Soldier'
    case 'chooseCards': {
      const n = (d.cards ?? []).length
      if (n === 0) return []
      if (d.upTo !== false && rand() < 0.3) return []
      const pick = Math.min(d.pick ?? 1, n)
      return Array.from({ length: pick }, (_, i) => i)
    }
    case 'orderCards': return (d.cards ?? []).map((_: any, i: number) => i)
    case 'allocateDamage': {
      const cands: string[] = d.candidates ?? []
      const power: number = d.power ?? 0
      const allocation: Record<string, number> = {}
      if (cands.length) allocation[cands[0]] = power
      return { strikerId: d.strikerId, allocation }
    }
    case 'chooseTargets': {
      if (d.upTo) return []
      const cands: string[] = d.candidates ?? d.ids ?? []
      if (cands.length) return [cands[0]]
      // fall back to any board entity of the right kind
      const pool = d.kind === 'site' ? Object.keys(g.sites) : Object.keys(g.units)
      return pool.length ? [pool[0]] : []
    }
    default: return null
  }
}

function drainPrompts(g: GameState, card: string, rand: () => number) {
  let guard = 0
  while (g.prompts.length && guard++ < 60) {
    const before = g.prompts[0].id
    const choice = answerFor(g, rand)
    const pr = g.prompts[0]
    const res = applyAction(g, pr.player, { t: 'prompt', promptId: pr.id, choice })
    if (!res.ok && g.prompts[0]?.id === before) {
      // couldn't resolve with a valid-shaped choice; try the escape hatches then bail
      for (const alt of [[], null, false, true]) {
        const r2 = applyAction(g, g.prompts[0].player, { t: 'prompt', promptId: g.prompts[0].id, choice: alt })
        if (r2.ok || g.prompts[0]?.id !== before) break
      }
      if (g.prompts[0]?.id === before) return // stuck — stop (not necessarily a bug)
    }
  }
}

function tryCard(def: { name: string; type: string }) {
  const rand = rng(hash(def.name))
  let g: GameState
  try { g = board() } catch (e: any) { record(def.name, 'board-setup', null, e); return }

  const p: PlayerId = 0
  const cardId = inject(g, p, def.name)
  g.players[p].mana += 50
  g.flow = g.flow ?? {}
  g.flow.noThreshold = { ...(g.flow.noThreshold ?? {}), [p]: g.turn } as any
  const caster = g.players[p].avatarUnitId

  // candidate targets to try (units + sites, both sides)
  const unitIds = Object.keys(g.units)
  const siteIds = Object.keys(g.sites)
  const squares = [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 3 }]

  const actions: Action[] = []
  if (def.type === 'Site') {
    for (const sq of [{ x: 1, y: 1 }, { x: 3, y: 0 }, { x: 0, y: 0 }])
      actions.push({ t: 'avatarSite', mode: 'play', cardId, x: sq.x, y: sq.y })
  } else if (def.type === 'Avatar') {
    return // avatars aren't cast
  } else {
    const targetSets = [undefined, [], [unitIds[0]], [unitIds[1]], [siteIds[0]], [unitIds[0], unitIds[1]]]
    for (const at of squares) for (const targets of targetSets)
      actions.push({ t: 'castSpell', cardId, casterId: caster, at, targets: targets as any })
  }

  // try each action shape until one is accepted (ok); catch throws on every attempt
  for (const action of actions) {
    // fresh game per attempt so a partial cast doesn't poison the next shape
    let gg: GameState
    try { gg = board() } catch { continue }
    const cid = inject(gg, p, def.name)
    gg.players[p].mana += 50
    gg.flow = gg.flow ?? {}
    gg.flow.noThreshold = { ...(gg.flow.noThreshold ?? {}), [p]: gg.turn } as any
    const a2 = { ...action, cardId: cid, casterId: gg.players[p].avatarUnitId } as Action
    let res
    try { res = applyAction(gg, p, a2) } catch (e: any) { record(def.name, 'cast-throw', a2, e); continue }
    if (res.ok) {
      cov.castOk++
      try { drainPrompts(gg, def.name, rand) } catch (e: any) { record(def.name, 'prompt-throw', a2, e) }
      try { tryAbilities(gg, def.name, rand) } catch (e: any) { record(def.name, 'ability-throw', null, e) }
      if (VERBOSE) console.log('  cast ok:', def.name)
      return
    }
  }
  cov.noShape++
  noShapeCards.push(`${def.name} [${def.type}]`)
  if (VERBOSE) console.log('  (no legal cast shape found for', def.name + ')')
}

// after a successful resolve, activate every ability of every p0-controlled entity
function tryAbilities(g: GameState, card: string, rand: () => number) {
  const entities = [...Object.values(g.units), ...Object.values(g.sites)] as any[]
  for (const e of entities) {
    if (e.controller !== 0) continue
    const abilities = getScript(e.name)?.abilities ?? []
    for (const ab of abilities) {
      const gg = g // best-effort on the live state
      const act: Action = { t: 'activate', sourceId: e.id, ability: ab.key, at: { x: e.x, y: e.y }, targets: [] }
      let res
      try { res = applyAction(gg, 0, act) } catch (err: any) { record(card, `ability:${ab.key}`, act, err); continue }
      if (res.ok) { try { drainPrompts(gg, card, rand) } catch (err: any) { record(card, `ability-prompt:${ab.key}`, act, err) } }
    }
  }
}

function record(card: string, stage: string, action: any, e: any) {
  crashes.push({ card, stage, action, err: String(e?.message ?? e), stack: String(e?.stack ?? '').split('\n').slice(0, 5).join('\n') })
}
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

// ---- run ----
const pool = ONLY ? allCards.filter((c) => c.name === ONLY) : allCards
let n = 0
for (const c of pool) { n++; if (n % 200 === 0) console.error(`... ${n}/${pool.length}`); tryCard(c) }

console.log(`\n=== fuzz_cast: ${pool.length} cards, ${crashes.length} crashes ===`)
console.log('coverage:', cov, `(cast/play succeeded for ${cov.castOk}/${pool.length}; no legal shape for ${cov.noShape})`)
// list the cards no shape was found for, grouped by type (blind spots in the harness)
if (VERBOSE) {
  const blind = (ONLY ? [] : allCards).filter((c) => c.type !== 'Avatar')
  // (recomputing which failed would need tracking; rely on --verbose per-card lines above)
}
const byStage: Record<string, number> = {}
for (const c of crashes) byStage[c.stage.split(':')[0]] = (byStage[c.stage.split(':')[0]] ?? 0) + 1
console.log('by stage:', byStage)
for (const c of crashes) {
  console.log(`\n■ ${c.card} @ ${c.stage}`)
  console.log(`  err: ${c.err}`)
  if (VERBOSE) console.log(c.stack.split('\n').map((l) => '    ' + l).join('\n'))
}
console.log('\n=== no legal cast shape (harness blind spots), by type ===')
const ng: Record<string, string[]> = {}
for (const s of noShapeCards) { const t = s.match(/\[(\w+)\]/)?.[1] ?? '?'; (ng[t] ??= []).push(s.replace(/ \[\w+\]/, '')) }
for (const [t, list] of Object.entries(ng)) console.log(`${t} (${list.length}): ${list.slice(0, 60).join(', ')}`)
