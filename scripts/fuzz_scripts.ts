// Deep script fuzzer: GUARANTEES every card's script body executes, catching
// thrown exceptions. Two layers:
//   1. action path — legal castSpell/avatarSite with SPEC-MATCHED targets
//      (introspected from script.targets/genesisTargets) + projectile dirs.
//   2. direct-invoke fallback — for cards no legal action reaches, call the
//      script's onCast/genesis directly via makeCtx with spec-matched TargetRefs
//      (bypasses validation; the point is to run the body and catch crashes).
// Also fires every ability and every unit's deathrite. Reports how each card
// was exercised so blind spots are explicit.
//   npx tsx scripts/fuzz_scripts.ts [--verbose] [--only "Name"]
import {
  createGame, applyAction, killUnit, emitUnitEnters, makeCtx, starterDecks,
  type GameState, type PlayerId, type Action, type Region,
} from '../packages/shared/src'
import { allCards } from '../packages/shared/src/cards/db'
import { getScript, type TargetSpec } from '../packages/shared/src/cards/scripts/registry'
import '../packages/shared/src/cards/scripts/index'

const VERBOSE = process.argv.includes('--verbose')
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

function rng(seed: number) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 }
type Crash = { card: string; stage: string; err: string; stack: string }
const crashes: Crash[] = []
const exercised: Record<string, string[]> = { action: [], direct: [], failed: [] }
const directNoHook: string[] = [] // direct-invoke cards where no onCast/genesis/ability/deathrite existed to run
let lastHookRan = false

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
function giveArt(g: GameState, carrier: any, name: string) {
  const cardId = `fz${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: carrier.controller } as any
  const id = `fza${g.nextId++}`
  g.artifacts[id] = { id, cardId, name, conjuredBy: carrier.controller, x: carrier.x, y: carrier.y, region: carrier.region, carriedBy: carrier.id, tapped: false } as any
  carrier.carrying.push(id); return id
}
function groundArt(g: GameState, p: PlayerId, name: string, x: number, y: number) {
  const cardId = `fz${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `fza${g.nextId++}`
  g.artifacts[id] = { id, cardId, name, conjuredBy: p, x, y, region: 'surface', tapped: false } as any
  return id
}
// a rich board: sites (land + water), units in every region, artifacts, both sides
function board(): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 7, 0)
  applyAction(g, 0, { t: 'keepHand' }); applyAction(g, 1, { t: 'keepHand' })
  for (let y = 0; y < 4; y++) for (let x = 1; x <= 3; x++) place(g, x < 2 ? 0 : 1, 'Rustic Village', x, y)
  place(g, 1, 'Rustic Village', 3, 3, true) // a flooded (water) site
  summon(g, 0, 'Foot Soldier', 2, 1)
  summon(g, 1, 'Foot Soldier', 2, 2)
  summon(g, 0, 'Foot Soldier', 1, 1, 'underground')
  summon(g, 1, 'Foot Soldier', 3, 3, 'underwater')
  const av0 = g.units[g.players[0].avatarUnitId]
  giveArt(g, av0, 'Lance')
  groundArt(g, 0, 'Lance', 1, 0)
  g.players[0].mana += 50; g.players[1].mana += 50
  g.flow = g.flow ?? {}
  g.flow.noThreshold = { 0: g.turn, 1: g.turn } as any
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
    case 'chooseCards': { const n = (d.cards ?? []).length; if (!n) return d.upTo !== false ? [] : []; return [0] }
    case 'orderCards': return (d.cards ?? []).map((_: any, i: number) => i)
    case 'allocateDamage': { const c = d.candidates ?? []; const a: any = {}; if (c.length) a[c[0]] = d.power ?? 0; return { strikerId: d.strikerId, allocation: a } }
    case 'chooseTargets': { if (d.upTo) return []; const c = d.candidates ?? d.ids ?? []; if (c.length) return [c[0]]; const pool = d.kind === 'site' ? Object.keys(g.sites) : Object.keys(g.units); return pool.length ? [pool[0]] : [] }
    default: return null
  }
}
function drain(g: GameState, rand: () => number) {
  let guard = 0
  while (g.prompts.length && guard++ < 100) {
    const before = g.prompts[0].id, pr = g.prompts[0]
    const res = applyAction(g, pr.player, { t: 'prompt', promptId: pr.id, choice: answerFor(g, rand) })
    if (!res.ok && g.prompts[0]?.id === before) {
      let esc = false
      for (const alt of [[], null, false, true, 0]) { const r2 = applyAction(g, g.prompts[0].player, { t: 'prompt', promptId: g.prompts[0].id, choice: alt }); if (r2.ok || g.prompts[0]?.id !== before) { esc = true; break } }
      if (!esc) return
    }
  }
}

// build target REFS matching a spec from the board
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
function refsForScript(g: GameState, specs: TargetSpec[] | undefined): any[] {
  const refs: any[] = []
  for (const spec of specs ?? []) { const c = candForSpec(g, spec); for (let i = 0; i < spec.count; i++) if (c[i % (c.length || 1)]) refs.push(c[i % c.length]) }
  return refs
}
function refToRaw(r: any): string | null {
  if (r.unit) return r.unit; if (r.site) return r.site; if (r.artifact) return r.artifact
  if (r.square) return `sq:${r.square.x},${r.square.y},${r.square.region ?? 'surface'}`
  return null
}

function record(card: string, stage: string, e: any) {
  crashes.push({ card, stage, err: String(e?.message ?? e), stack: String(e?.stack ?? '').split('\n').slice(0, 6).join('\n') })
}
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }

function tryActionCast(name: string, type: string, rand: () => number): boolean {
  const specs = getScript(name)?.[type === 'Magic' ? 'targets' : 'genesisTargets'] as TargetSpec[] | undefined
  const projectile = !!getScript(name)?.shootsProjectile
  const dirs = projectile ? ['n', 's', 'e', 'w'] : [undefined]
  const squares = [{ x: 1, y: 1 }, { x: 3, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 3 }, { x: 4, y: 2 }]
  for (const dir of dirs) for (const sq of squares) {
    let g: GameState; try { g = board() } catch { continue }
    const cid = `fzc${g.nextId++}`; g.cards[cid] = { id: cid, name, owner: 0 } as any; g.players[0].hand.push(cid)
    const caster = g.players[0].avatarUnitId
    const refs = refsForScript(g, specs)
    const rawTargets = refs.map(refToRaw).filter(Boolean) as string[]
    const action: Action = type === 'Site'
      ? { t: 'avatarSite', mode: 'play', cardId: cid, x: sq.x, y: sq.y }
      : { t: 'castSpell', cardId: cid, casterId: caster, at: sq, targets: rawTargets, extra: dir ? { direction: dir } : undefined }
    let res
    try { res = applyAction(g, 0, action) } catch (e) { record(name, 'action-cast-throw', e); return true /* body ran & threw */ }
    if (res.ok) {
      try { drain(g, rand) } catch (e) { record(name, 'action-prompt-throw', e) }
      try { runAbilitiesAndDeaths(g, name, rand) } catch (e) { record(name, 'action-post-throw', e) }
      return true
    }
  }
  return false
}

// directly invoke the script body via makeCtx (guaranteed execution)
function directInvoke(name: string, type: string, rand: () => number) {
  let g: GameState; try { g = board() } catch (e) { record(name, 'direct-base', e); return }
  const script = getScript(name); if (!script) return
  try {
    if (type === 'Magic') {
      const specs = script.targets as TargetSpec[] | undefined
      const refs = refsForScript(g, specs)
      const ctx = makeCtx(g, g.players[0].avatarUnitId, 0, refs as any, { x: 2, y: 1 }, script.shootsProjectile ? { direction: 'e' } : undefined)
      script.onCast?.(ctx)
    } else if (type === 'Minion') {
      const id = summon(g, 0, name, 2, 1)
      try { emitUnitEnters(g, g.units[id]) } catch (e) { record(name, 'direct-enter', e) }
      const refs = refsForScript(g, script.genesisTargets as TargetSpec[] | undefined)
      script.genesis?.(makeCtx(g, id, 0, refs as any, { x: 2, y: 1 }))
    } else if (type === 'Site') {
      const id = place(g, 0, name, 0, 0); g.sites[id].name = name; g.cards[g.sites[id].cardId].name = name
      const refs = refsForScript(g, script.genesisTargets as TargetSpec[] | undefined)
      script.genesis?.(makeCtx(g, id, 0, refs as any, { x: 0, y: 0 }))
    } else if (type === 'Aura') {
      const cardId = `fz${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: 0 } as any
      const id = `fzr${g.nextId++}`
      g.auras[id] = { id, cardId, name, owner: 0, controller: 0, squares: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }] } as any
      script.genesis?.(makeCtx(g, id, 0, [] as any, { x: 2, y: 1 }))
    } else if (type === 'Artifact') {
      const av = g.units[g.players[0].avatarUnitId]; const id = giveArt(g, av, name)
      const refs = refsForScript(g, script.genesisTargets as TargetSpec[] | undefined)
      script.genesis?.(makeCtx(g, id, 0, refs as any, { x: 2, y: 0 }))
    } else if (type === 'Avatar') {
      // make p0's avatar the tested one and run its hooks
      const av = g.units[g.players[0].avatarUnitId]; av.name = name; g.cards[av.cardId].name = name
      try { emitUnitEnters(g, av) } catch (e) { record(name, 'direct-avatar-enter', e) }
      script.genesis?.(makeCtx(g, av.id, 0, [] as any, { x: 2, y: 0 }))
      script.startOfTurn?.(makeCtx(g, av.id, 0, [] as any))
    }
  } catch (e) { record(name, 'direct-invoke-throw', e); return }
  try { drain(g, rand) } catch (e) { record(name, 'direct-prompt-throw', e) }
  try { runAbilitiesAndDeaths(g, name, rand) } catch (e) { record(name, 'direct-post-throw', e) }
}

function runAbilitiesAndDeaths(g: GameState, card: string, rand: () => number) {
  const ents = [...Object.values(g.units), ...Object.values(g.sites)] as any[]
  for (const e of ents) {
    if (e.controller !== 0) continue
    for (const ab of getScript(e.name)?.abilities ?? []) {
      try { const r = applyAction(g, 0, { t: 'activate', sourceId: e.id, ability: ab.key, at: { x: e.x, y: e.y }, targets: [] }); if (r.ok) drain(g, rand) }
      catch (err) { record(card, `ability:${ab.key}`, err) }
    }
  }
  // fire deathrite for any p0 non-avatar unit still around
  for (const u of Object.values(g.units)) {
    if (u.controller === 0 && !u.isAvatar && getScript(u.name)?.deathrite) {
      try { killUnit(g, u.id); drain(g, rand) } catch (err) { record(card, 'deathrite', err) }
    }
  }
}

const pool = ONLY ? allCards.filter((c) => c.name === ONLY) : allCards
let n = 0
for (const c of pool) {
  n++; if (n % 200 === 0) console.error(`... ${n}/${pool.length}`)
  const rand = rng(hash(c.name))
  let viaAction = false
  try { viaAction = tryActionCast(c.name, c.type, rand) } catch (e) { record(c.name, 'action-outer', e); viaAction = true }
  if (viaAction) { exercised.action.push(c.name); continue }
  directInvoke(c.name, c.type, rand)
  exercised.direct.push(c.name)
  const s = getScript(c.name)
  const hasRunnable = !!(s && (s.onCast || s.genesis || s.startOfTurn || (s.abilities?.length) || s.deathrite))
  if (!hasRunnable) directNoHook.push(`${c.name} [${c.type}]`)
}

console.log(`\n=== fuzz_scripts: ${pool.length} cards, ${crashes.length} crashes ===`)
console.log(`exercised: action=${exercised.action.length}, direct-invoke=${exercised.direct.length}`)
console.log(`direct-invoke cards with NO runnable hook (trivial — keyword/static/centralized only): ${directNoHook.length}`)
if (directNoHook.length) console.log('  ' + directNoHook.join(', '))
const byStage: Record<string, number> = {}
for (const c of crashes) byStage[c.stage.split(':')[0]] = (byStage[c.stage.split(':')[0]] ?? 0) + 1
console.log('crashes by stage:', byStage)
for (const c of crashes) { console.log(`\n■ ${c.card} @ ${c.stage}\n  err: ${c.err}`); if (VERBOSE) console.log(c.stack.split('\n').map((l) => '    ' + l).join('\n')) }
