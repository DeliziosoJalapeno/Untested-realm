// No-op / log-only effect detector. Runs each card's PRIMARY effect body in
// isolation (direct-invoke of onCast/genesis via makeCtx) and diffs the game
// state before/after, ignoring the log. A card whose effect body changes NOTHING
// but the log is a candidate "does nothing observable" bug — exactly the class of
// old-Lookout (its genesis only pushLog'd the opponent's hand; the player could
// never see it). Heuristic: conditional effects that find no target on this board
// also show up, so output is CANDIDATES TO REVIEW, not confirmed bugs.
//   npx tsx scripts/audit_noop.ts [--only "Name"]
import {
  createGame, applyAction, makeCtx, emitUnitEnters, starterDecks,
  type GameState, type PlayerId, type Region,
} from '../packages/shared/src'
import { allCards } from '../packages/shared/src/cards/db'
import { getScript, type TargetSpec } from '../packages/shared/src/cards/scripts/registry'
import '../packages/shared/src/cards/scripts/index'

const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

function place(g: GameState, p: PlayerId, name: string, x: number, y: number, flooded = false) {
  const cardId = `fz${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `fzs${g.nextId++}`
  g.sites[id] = { id, cardId, name, owner: p, controller: p, x, y, tapped: false, isRubble: false, flooded: flooded || undefined } as any
  return id
}
function summon(g: GameState, p: PlayerId, name: string, x: number, y: number, region: Region = 'surface') {
  const cardId = `fz${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `fzu${g.nextId++}`
  g.units[id] = { id, cardId, name, owner: p, controller: p, isAvatar: false, x, y, region, tapped: false, damage: 0, enteredTurn: -5, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as any
  return id
}
function board(): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 7, 0)
  applyAction(g, 0, { t: 'keepHand' }); applyAction(g, 1, { t: 'keepHand' })
  for (let y = 0; y < 4; y++) for (let x = 1; x <= 3; x++) place(g, x < 2 ? 0 : 1, 'Rustic Village', x, y)
  summon(g, 0, 'Foot Soldier', 2, 1); summon(g, 1, 'Foot Soldier', 2, 2)
  // give both players hand cards so hand-reveal / discard effects have material
  for (const p of [0, 1] as PlayerId[]) for (const n of ['Fireball', 'Foot Soldier', 'Lightning Bolt']) {
    const id = `fzh${g.nextId++}`; g.cards[id] = { id, name: n, owner: p } as any; g.players[p].hand.push(id)
  }
  g.players[0].mana += 50; g.players[1].mana += 50
  g.flow = { noThreshold: { 0: g.turn, 1: g.turn } } as any
  return g
}
function candForSpec(g: GameState, spec: TargetSpec): any[] {
  const own = (o: any) => spec.owner === 'ally' ? o.controller === 0 : spec.owner === 'enemy' ? o.controller === 1 : true
  if (spec.what === 'square') return Object.values(g.sites).map((s) => ({ square: { x: s.x, y: s.y, region: 'surface' as Region } }))
  if (spec.what === 'site') return Object.values(g.sites).filter(own).map((s) => ({ site: s.id }))
  if (spec.what === 'artifact') return Object.values(g.artifacts).map((a) => ({ artifact: a.id }))
  let us = Object.values(g.units).filter(own)
  if (spec.what === 'minion') us = us.filter((u) => !u.isAvatar)
  if (spec.what === 'avatar') us = us.filter((u) => u.isAvatar)
  return us.map((u) => ({ unit: u.id }))
}
function refs(g: GameState, specs?: TargetSpec[]): any[] {
  const out: any[] = []
  for (const spec of specs ?? []) { const c = candForSpec(g, spec); for (let i = 0; i < spec.count; i++) if (c[i % (c.length || 1)]) out.push(c[i % c.length]) }
  return out
}
function answerFor(g: GameState): any {
  const p = g.prompts[0]; const d = p.data ?? {}
  switch (p.kind) {
    case 'drawDeck': return 'atlas'
    case 'defend': return []
    case 'intercept': return null
    case 'stayInFight': return true
    case 'yesNo': return true
    case 'chooseOption': return (d.options ?? [])[0] ?? null
    case 'nameCard': return (d.names ?? [])[0] ?? 'Fireball'
    case 'chooseCards': { const n = (d.cards ?? []).length; return n ? [0] : [] }
    case 'orderCards': return (d.cards ?? []).map((_: any, i: number) => i)
    case 'allocateDamage': { const c = d.candidates ?? []; const a: any = {}; if (c.length) a[c[0]] = d.power ?? 0; return { strikerId: d.strikerId, allocation: a } }
    case 'chooseTargets': { if (d.upTo) return []; const c = d.candidates ?? d.ids ?? []; return c.length ? [c[0]] : (Object.keys(d.kind === 'site' ? g.sites : g.units).slice(0, 1)) }
    default: return null
  }
}
function drain(g: GameState) {
  let guard = 0
  while (g.prompts.length && guard++ < 60) {
    const before = g.prompts[0].id
    const r = applyAction(g, g.prompts[0].player, { t: 'prompt', promptId: g.prompts[0].id, choice: answerFor(g) })
    if (!r.ok && g.prompts[0]?.id === before) { for (const alt of [[], null, false]) { applyAction(g, g.prompts[0].player, { t: 'prompt', promptId: g.prompts[0].id, choice: alt }); if (g.prompts[0]?.id !== before) break } if (g.prompts[0]?.id === before) return }
  }
}
// serialize state ignoring the log + version (the only "expected" no-op deltas)
function snap(g: GameState): string {
  const { log, version, ...rest } = g as any
  return JSON.stringify(rest)
}

const noop: { name: string; type: string; text: string }[] = []
const pool = ONLY ? allCards.filter((c) => c.name === ONLY) : allCards
for (const c of pool) {
  const s: any = getScript(c.name)
  // only cards whose PRIMARY effect is an onCast/genesis body (skip pure statics,
  // keyword-only, triggers, activated abilities — different detectors apply there)
  const hook = c.type === 'Magic' ? s?.onCast : s?.genesis
  if (!hook) continue
  let g: GameState; try { g = board() } catch { continue }
  // place the source and isolate the effect body
  let sourceId = g.players[0].avatarUnitId
  try {
    if (c.type === 'Minion') { sourceId = summon(g, 0, c.name, 2, 1); emitUnitEnters(g, g.units[sourceId]) }
    else if (c.type === 'Site') { sourceId = place(g, 0, c.name, 0, 0) }
    else if (c.type === 'Artifact') { const av = g.units[g.players[0].avatarUnitId]; const id = `fza${g.nextId++}`; g.cards[id] = { id, name: c.name, owner: 0 } as any; g.artifacts[id] = { id, cardId: id, name: c.name, conjuredBy: 0, x: av.x, y: av.y, region: av.region, carriedBy: av.id, tapped: false } as any; av.carrying.push(id); sourceId = id }
    else if (c.type === 'Aura') { const id = `fzr${g.nextId++}`; g.cards[id] = { id, name: c.name, owner: 0 } as any; g.auras[id] = { id, cardId: id, name: c.name, owner: 0, controller: 0, squares: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }] } as any; sourceId = id }
  } catch { continue }
  const before = snap(g)
  try {
    const t = refs(g, c.type === 'Magic' ? s.targets : s.genesisTargets)
    hook(makeCtx(g, sourceId, 0, t as any, { x: 2, y: 1 }, s.shootsProjectile ? { direction: 'e' } : undefined))
    drain(g)
  } catch { continue } // crashes are the fuzzers' job
  const after = snap(g)
  if (before === after) noop.push({ name: c.name, type: c.type, text: (c.text || '').replace(/\n/g, ' ') })
}

// HIGH-CONFIDENCE slice: effects that promise the PLAYER INFORMATION (look at /
// reveal a hand, spy, etc.). These MUST change observable state (handReveals) —
// if such a card is a no-op it's a real Lookout-class bug, not a missing target.
const infoRe = /look at|reveal[s]?\b|\bspy|\bspies|see .*(hand|card)/i
const highConf = noop.filter((c) => infoRe.test(c.text))

console.log(`\n=== audit_noop ===`)
console.log(`HIGH-CONFIDENCE (information-reveal effects that changed nothing — real bugs): ${highConf.length}`)
for (const c of highConf) console.log(`  ⚠ ${c.name} [${c.type}] :: ${c.text}`)
console.log(`\nLOW-CONFIDENCE (${noop.length} total no-op on this board — mostly conditional effects lacking a valid target here; review individually):`)
for (const c of noop) console.log(`  · ${c.name} [${c.type}]`)
