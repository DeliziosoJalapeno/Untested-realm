// GUI ↔ ENGINE INTERACTION-PARITY sweep. Two-directional contract, per card:
//   • every interaction the ENGINE allows must be reachable through the GUI flow
//   • the GUI must not let you commit something the engine denies
//
// It drives each card through the shared planCast (the exact flow clickHandCard
// begins), auto-completes with legal picks, and — crucially — at EVERY prompt it
// tries EVERY legal choice the engine offered (plus the skip when the prompt is
// optional), flagging any offered choice the engine then rejects. That is the
// "interacted with in all ways the engine allows" check; Valor-style per-option
// routing bugs surface here. A brute-force oracle decides whether the engine
// supports a card at all, so we can separate GUI-misalignment from "needs a
// specific board".
//
//   npx tsx scripts/audit_playable.ts [--verbose] [--only "Card Name"]
import { createGame, applyAction, starterDecks, planCast, validateSummonAt, makeCtx, board, place, summon, inject, ALL_SQUARES, ELEM_SITE, triggerBoard, abilityBoard, placeInPlay, mkUnit, type GameState, type PlayerId, type Action, type Region } from '../packages/shared/src'
import { allCards, getCard } from '../packages/shared/src/cards/db'
import { getScript } from '../packages/shared/src/cards/scripts/registry'
import '../packages/shared/src/cards/scripts/index'

const VERBOSE = process.argv.includes('--verbose')
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
const clone = (g: GameState): GameState => JSON.parse(JSON.stringify(g))

// ---------------- board scaffolding ----------------
// board() / place() / summon() / inject() / ALL_SQUARES now live in the shared
// engine (packages/shared/src/engine/auditboard.ts) so the DOM-level playability
// audit runs on the SAME boards; the definitions are identical to the originals.

// ---------------- the parity engine: drive a resolution, checking every prompt ----------------
type Violation = { where: string; detail: string }

/** enumerate the individual legal choices the engine OFFERED for a single-select
 *  prompt (the set the GUI must let the player pick from). null = not enumerable. */
function offeredChoices(g: GameState): { choices: any[]; optional: boolean; kind: string } | null {
  const p = g.prompts[0]; const d = p.data ?? {}
  switch (p.kind) {
    case 'yesNo': return { choices: [true, false], optional: false, kind: p.kind }
    case 'stayInFight': return { choices: [true, false], optional: false, kind: p.kind }
    case 'chooseOption': return { choices: (d.options ?? []).slice(), optional: false, kind: p.kind }
    case 'chooseSquare': return { choices: (d.squares ?? []).slice(), optional: false, kind: p.kind }
    case 'nameCard': return d.names ? { choices: d.names.slice(), optional: false, kind: p.kind } : null
    case 'chooseTargets': return { choices: (d.candidates ?? []).map((id: string) => [id]), optional: !!d.upTo, kind: p.kind }
    case 'defend': return { choices: (d.candidates ?? []).map((id: string) => [id]), optional: true, kind: p.kind }
    case 'intercept': return { choices: (d.candidates ?? []).map((id: string) => id), optional: true, kind: p.kind }
    case 'drawDeck': return { choices: (d.options ?? []).slice(), optional: false, kind: p.kind }
    default: return null // multi-select (chooseCards/orderCards/allocateDamage): checked via canonical answer only
  }
}
/** a single canonical valid answer to advance the MAIN resolution past a prompt */
function canonical(g: GameState): any {
  const p = g.prompts[0]; const d = p.data ?? {}
  switch (p.kind) {
    case 'drawDeck': return g.players[p.player].spellbook.length ? 'spellbook' : 'atlas'
    case 'defend': return []
    case 'intercept': return null
    case 'stayInFight': return true
    case 'yesNo': return true
    case 'chooseOption': return (d.options ?? [])[0] ?? null
    case 'chooseSquare': return (d.squares ?? [])[0] ?? { x: 2, y: 1 }
    case 'nameCard': return (d.names ?? [])[0] ?? 'Foot Soldier'
    case 'chooseCards': { const n = (d.cards ?? []).length; return n ? Array.from({ length: Math.min(d.pick ?? 1, n) }, (_, i) => i) : [] }
    case 'orderCards': return (d.cards ?? []).map((_: any, i: number) => i)
    case 'allocateDamage': { const c: string[] = d.candidates ?? []; const a: Record<string, number> = {}; if (c.length) a[c[0]] = d.power ?? 0; return { strikerId: d.strikerId, allocation: a } }
    case 'chooseTargets': { if (d.upTo) return []; const c: string[] = d.candidates ?? []; return c.length ? [c[0]] : [] }
    default: return null
  }
}
const RENDERED = new Set(['drawDeck', 'defend', 'intercept', 'stayInFight', 'yesNo', 'chooseOption', 'chooseSquare', 'nameCard', 'chooseCards', 'orderCards', 'allocateDamage', 'chooseTargets'])

/** drive the resolution to completion; at each prompt verify every engine-offered
 *  choice is engine-accepted (interaction parity). Returns violations found. */
function driveWithParity(g: GameState): Violation[] {
  const v: Violation[] = []; let guard = 0
  while (g.prompts.length && guard++ < 80) {
    const pr = g.prompts[0]
    if (!RENDERED.has(pr.kind)) { v.push({ where: pr.kind, detail: `prompt kind '${pr.kind}' has no client renderer` }); return v }
    const off = offeredChoices(g)
    if (off) {
      // every offered choice must be accepted when chosen alone. (resolvePrompt
      // shifts the prompt off BEFORE running the cont, so a rejected choice still
      // consumes it — !res.ok is the reliable signal, not "prompt unchanged".)
      for (const ch of off.choices) {
        const gg = clone(g); const p2 = gg.prompts[0]
        const res = applyAction(gg, p2.player, { t: 'prompt', promptId: p2.id, choice: ch })
        if (!res.ok) v.push({ where: pr.kind, detail: `offered choice ${JSON.stringify(ch).slice(0, 40)} rejected: ${res.error}` })
      }
      // an optional prompt must accept a skip ([] / null)
      if (off.optional) {
        let skippable = false
        for (const skip of [[], null]) {
          const gg = clone(g); const p2 = gg.prompts[0]
          if (applyAction(gg, p2.player, { t: 'prompt', promptId: p2.id, choice: skip as any }).ok) { skippable = true; break }
        }
        if (!skippable) v.push({ where: pr.kind, detail: `optional prompt won't accept a skip` })
      }
    }
    // advance the real resolution
    const res = applyAction(g, pr.player, { t: 'prompt', promptId: pr.id, choice: canonical(g) })
    if (!res.ok) { v.push({ where: pr.kind, detail: `canonical answer rejected: ${res.error}` }); return v }
  }
  return v
}

// ---------------- complete a plan into the actions the GUI would send ----------------
function completions(g: GameState, cardId: string, name: string, casterId: string, plan: ReturnType<typeof planCast>): Action[] {
  const acts: Action[] = []
  const units = Object.keys(g.units); const sites = Object.keys(g.sites)
  const legalSummon = ALL_SQUARES.flatMap((sq) => (['surface', 'underground', 'underwater', 'void'] as Region[])
    .filter((r) => validateSummonAt(g, 0, name, { x: sq.x, y: sq.y, region: r }) === null)
    .map((r) => ({ ...sq, region: r })))
  const targetPicks = (n: number): string[][] => {
    const pool = [...units, ...sites, 'sq:2,1,surface', 'sq:2,2,surface', 'sq:3,1,surface']
    if (n <= 1) return pool.map((id) => [id])
    const out: string[][] = []
    for (const a of pool) for (const b of pool) if (a !== b) out.push([a, b])
    return out.slice(0, 80)
  }
  switch (plan.kind) {
    case 'cast': acts.push({ t: 'castSpell', cardId, casterId }); break
    case 'projectile': for (const dir of ['e', 'w', 'n', 's']) acts.push({ t: 'castSpell', cardId, casterId, extra: { direction: dir } } as any); break
    case 'targets': for (const targets of targetPicks(plan.specCount || 1)) acts.push({ t: 'castSpell', cardId, casterId, targets }); break
    case 'summon':
      for (const at of legalSummon) {
        acts.push({ t: 'castSpell', cardId, casterId, at, targets: [] })
        acts.push({ t: 'castSpell', cardId, casterId, at, targets: [units[0]] })
        acts.push({ t: 'castSpell', cardId, casterId, at, targets: [sites[0]] })
      }
      break
    case 'conjure':
      acts.push({ t: 'castSpell', cardId, casterId, extra: { giveTo: casterId } } as any)
      for (const sq of ALL_SQUARES) acts.push({ t: 'castSpell', cardId, casterId, at: sq }); break
    case 'aura': for (const sq of ALL_SQUARES) acts.push({ t: 'castSpell', cardId, casterId, at: sq }); break
    case 'site': case 'siteOrSpell': for (const sq of ALL_SQUARES) acts.push({ t: 'avatarSite', mode: 'play', cardId, x: sq.x, y: sq.y } as any); break
    case 'chaosTwister': case 'blocked': break
  }
  return acts
}

/** play the card through the GUI flow; returns { status, violations, reason } */
function guiPlay(name: string): { status: 'ok' | 'skip' | 'blocked' | 'fail'; violations: Violation[]; reason?: string } {
  let plan: ReturnType<typeof planCast>
  try { const g0 = board(); const c0 = inject(g0, 0, name); plan = planCast(g0, 0, c0, g0.players[0].avatarUnitId) }
  catch (e: any) { return { status: 'fail', violations: [], reason: `planCast threw: ${e?.message ?? e}` } }
  if (plan.kind === 'chaosTwister') return { status: 'skip', violations: [] }
  if (plan.kind === 'blocked') return { status: 'blocked', violations: [], reason: `GUI blocks cast (${plan.reason})` }

  const probe = board(); const pc = inject(probe, 0, name)
  const acts = completions(probe, pc, name, probe.players[0].avatarUnitId, plan)
  if (acts.length === 0) return { status: 'skip', violations: [] }
  let lastErr = 'no legal GUI completion'
  for (const action of acts) {
    const g = board(); const c = inject(g, 0, name)
    const a = { ...action, cardId: c, casterId: g.players[0].avatarUnitId } as Action
    let res
    try { res = applyAction(g, 0, a) } catch (e: any) { lastErr = `cast threw: ${e?.message ?? e}`; continue }
    if (!res.ok) { lastErr = `cast rejected: ${res.error}`; continue }
    let violations: Violation[]
    try { violations = driveWithParity(g) } catch (e: any) { lastErr = `resolution threw: ${e?.message ?? e}`; continue }
    return { status: 'ok', violations } // reached a full GUI-driven resolution
  }
  return { status: 'fail', violations: [], reason: lastErr }
}

/** brute-force oracle: does ANY action shape let the engine play this card? */
function engineCanPlay(name: string, type: string): boolean {
  const shapes: Action[] = []
  const g0 = board(); inject(g0, 0, name)
  const caster = g0.players[0].avatarUnitId
  const uIds = Object.keys(g0.units); const sIds = Object.keys(g0.sites)
  if (type === 'Site') for (const sq of ALL_SQUARES) shapes.push({ t: 'avatarSite', mode: 'play', cardId: '', x: sq.x, y: sq.y } as any)
  else {
    const targetSets: any[] = [undefined, [], [uIds[0]], [uIds[1]], [sIds[0]], [uIds[0], uIds[1]], [uIds[0], sIds[0]], ['sq:2,2,surface']]
    const extras = [undefined, { direction: 'e' }, { giveTo: caster }]
    const ats: any[] = [undefined, ...ALL_SQUARES.map((s) => ({ ...s, region: 'surface' }))]
    for (const at of ats) for (const targets of targetSets) for (const extra of extras) shapes.push({ t: 'castSpell', cardId: '', casterId: caster, at, targets, extra } as any)
  }
  for (const shape of shapes) {
    const g = board(); const c = inject(g, 0, name)
    const a = { ...shape, cardId: c, casterId: g.players[0].avatarUnitId } as Action
    let res
    try { res = applyAction(g, 0, a) } catch { continue }
    if (res.ok) return true
  }
  return false
}

// ---------------- phase 2: trigger / response windows ----------------
// The card sits in the zone its script listens from; we fire each triggered hook
// with a PRODUCTION-FAITHFUL makeCtx (correct sourceId — a hand card's id, a unit's
// id, …; that faithfulness is exactly what broke Valor's routing) and run the same
// per-choice parity driver on whatever prompt it raises.
const TRIGGER_HOOKS = ['deathrite', 'onAllyDefends', 'onUnitAttacked', 'onSelfStruck', 'onKill', 'onAnyDeath', 'onDeathsDoor', 'startOfTurn', 'endOfTurn'] as const
// response spells gate on affinity (canRespond checks real thresholds, not the
// noThreshold waiver), so a trigger board must actually PROVIDE every element —
// otherwise the response never fires and the audit sees nothing (this blind spot
// let a reverted Valor fix slip past the sweep).
// ELEM_SITE / triggerBoard / abilityBoard / placeInPlay / mkUnit now live in the
// shared engine (packages/shared/src/engine/auditboard.ts) so the DOM-level audit
// shares them; the definitions there are byte-identical to the originals.
function hookArgs(hook: string, g: GameState): any[] {
  const p0u = Object.values(g.units).find((u) => u.controller === 0 && !u.isAvatar)
  const p1u = Object.values(g.units).find((u) => u.controller === 1 && !u.isAvatar)
  const p0av = Object.values(g.units).find((u) => u.controller === 0 && u.isAvatar)
  switch (hook) {
    case 'onAllyDefends': return [p0u]
    case 'onUnitAttacked': return [p0u, p1u] // (ctx, target, attacker) — combat.ts fires both
    case 'onSelfStruck': case 'onKill': case 'onAnyDeath': return [p1u]
    case 'onDeathsDoor': return [p0av]
    default: return []
  }
}
/** place the card so a triggered hook can fire, returning its production sourceId. */
function placeForTrigger(g: GameState, name: string): string | null {
  const s = getScript(name) as any
  if (s?.listensFromHand) return inject(g, 0, name)
  if (s?.listensFromCemetery) { const id = `fzc${g.nextId++}`; g.cards[id] = { id, name, owner: 0 } as any; g.players[0].cemetery.push(id); return id }
  const def = getCard(name)
  if (def.type === 'Minion') { const id = `fzu${g.nextId++}`; const cid = `fz${g.nextId++}`; g.cards[cid] = { id: cid, name, owner: 0 } as any; g.units[id] = { id, cardId: cid, name, owner: 0, controller: 0, isAvatar: false, x: 2, y: 0, region: 'surface', tapped: false, damage: 0, enteredTurn: 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as any; return id }
  if (def.type === 'Site') { const id = `fzs${g.nextId++}`; const cid = `fz${g.nextId++}`; g.cards[cid] = { id: cid, name, owner: 0 } as any; g.sites[id] = { id, cardId: cid, name, owner: 0, controller: 0, x: 0, y: 3, tapped: false, isRubble: false } as any; return id }
  return null // Magic/Artifact/Aura without zone flags: no in-play trigger surface here
}
function exerciseTriggers(name: string): { confirmed: Violation[]; threw: Violation[] } {
  const s = getScript(name) as any
  const confirmed: Violation[] = [], threw: Violation[] = []
  if (!s) return { confirmed, threw }
  for (const hook of TRIGGER_HOOKS) {
    if (typeof s[hook] !== 'function') continue
    let g: GameState
    try { g = triggerBoard() } catch { continue }
    const sourceId = placeForTrigger(g, name)
    if (!sourceId) continue
    try { s[hook](makeCtx(g, sourceId, 0, []), ...hookArgs(hook, g)) }
    catch (e: any) { threw.push({ where: hook, detail: `hook threw: ${e?.message ?? e}` }); continue } // may be imperfect test args
    let vs: Violation[]
    try { vs = driveWithParity(g) } catch (e: any) { threw.push({ where: hook, detail: `resolution threw: ${e?.message ?? e}` }); continue }
    for (const v of vs) confirmed.push({ where: `${hook}→${v.where}`, detail: v.detail })
  }
  return { confirmed, threw }
}

// ---------------- phase 3: in-play activated abilities ----------------
// Place the card in play on a maxed board and, for each ability its script
// exposes, activate it the way the GUI does (activate with legal targets), then
// run the per-choice parity driver on any prompt it raises. Reachability: if no
// GUI-shaped activation works but the engine accepts SOME shape, the ability is
// GUI-unreachable.
function abilityActions(g: GameState, sourceId: string, ab: any): Action[] {
  const units = Object.keys(g.units); const sites = Object.keys(g.sites)
  const sqRefs = ['sq:2,1,surface', 'sq:2,2,surface', 'sq:2,0,surface', 'sq:0,3,surface']
  const specCount = (ab.targets ?? []).reduce((a: number, s: any) => a + s.count, 0)
  const base = { t: 'activate' as const, sourceId, ability: ab.key }
  if (specCount === 0 && !ab.needsSquare) return [{ ...base, targets: [] } as any]
  const pool = [...units, ...sites, ...sqRefs]
  const acts: Action[] = []
  if (specCount <= 1) { for (const id of pool) { acts.push({ ...base, targets: [id] } as any); acts.push({ ...base, targets: [id], at: { x: 2, y: 1 } } as any) } }
  else { for (const a of pool) for (const b of pool) if (a !== b) acts.push({ ...base, targets: [a, b] } as any) }
  if (ab.needsSquare) for (const sq of ALL_SQUARES) acts.push({ ...base, targets: [], at: sq } as any)
  return acts.slice(0, 90)
}
function exerciseAbilities(name: string): { confirmed: Violation[]; threw: Violation[]; inconclusive: number } {
  const s = getScript(name) as any
  const confirmed: Violation[] = [], threw: Violation[] = []
  let inconclusive = 0
  if (!s?.abilities?.length) return { confirmed, threw, inconclusive }
  for (const ab of s.abilities) {
    let activated = false, vs: Violation[] = []
    const shapes = (() => { try { const g = abilityBoard(); const id = placeInPlay(g, name); return id ? abilityActions(g, id, ab) : [] } catch { return [] } })()
    for (const shape of shapes) {
      let g: GameState; try { g = abilityBoard() } catch { continue }
      const id = placeInPlay(g, name); if (!id) break
      const a = { ...shape, sourceId: id } as Action
      let res
      try { res = applyAction(g, 0, a) } catch (e: any) { threw.push({ where: `ability:${ab.key}`, detail: `activate threw: ${e?.message ?? e}` }); activated = true; break }
      if (!res.ok) continue
      activated = true
      try { vs = driveWithParity(g) } catch (e: any) { threw.push({ where: `ability:${ab.key}`, detail: `resolution threw: ${e?.message ?? e}` }); break }
      break
    }
    for (const v of vs) confirmed.push({ where: `ability:${ab.key}→${v.where}`, detail: v.detail })
    // "couldn't activate on a generic board" is board-dependent noise (a target the
    // spec needs may not exist / not be in range), NOT a GUI bug — this harness even
    // bypasses button rendering. Count it as inconclusive, never a confirmed bug.
    if (!activated && shapes.length) inconclusive++
  }
  return { confirmed, threw, inconclusive }
}

// ---------------- phase 4: attacks & the combat prompt chain ----------------
// Drive a real attack (unit and site) with each minion and run the per-choice
// parity driver on the combat prompts it raises (defend candidates, stayInFight,
// allocateDamage) — proving the GUI can answer every combat choice the engine
// offers, for every attacker.
function exerciseCombat(name: string): { confirmed: Violation[]; threw: Violation[] } {
  const confirmed: Violation[] = [], threw: Violation[] = []
  if (getCard(name).type !== 'Minion') return { confirmed, threw }
  // (a) attack an enemy unit — opens a defend window with a reachable defender
  try {
    const g = board()
    const M = mkUnit(g, 0, name, 2, 0)
    const target = mkUnit(g, 1, 'Foot Soldier', 2, 0) // co-located target
    mkUnit(g, 1, 'Foot Soldier', 2, 1)                // adjacent defender candidate
    const res = applyAction(g, 0, { t: 'moveAttack', unitId: M, path: [], attack: { unit: target } } as any)
    if (res.ok) for (const v of driveWithParity(g)) confirmed.push({ where: `attack-unit→${v.where}`, detail: v.detail })
  } catch (e: any) { threw.push({ where: 'attack-unit', detail: `threw: ${e?.message ?? e}` }) }
  // (b) attack an enemy site — attacker stands on it and strikes in place
  try {
    const g = board()
    const sid = `fzs${g.nextId++}`; const scid = `fz${g.nextId++}`
    g.cards[scid] = { id: scid, name: 'Rustic Village', owner: 1 } as any
    g.sites[sid] = { id: sid, cardId: scid, name: 'Rustic Village', owner: 1, controller: 1, x: 0, y: 0, tapped: false, isRubble: false } as any
    const M = mkUnit(g, 0, name, 0, 0)
    const res = applyAction(g, 0, { t: 'moveAttack', unitId: M, path: [], attack: { site: sid } } as any)
    if (res.ok) for (const v of driveWithParity(g)) confirmed.push({ where: `attack-site→${v.where}`, detail: v.detail })
  } catch (e: any) { threw.push({ where: 'attack-site', detail: `threw: ${e?.message ?? e}` }) }
  return { confirmed, threw }
}

// ---------------- run ----------------
const pool = (ONLY ? allCards.filter((c) => c.name === ONLY) : allCards).filter((c) => c.type !== 'Avatar')
let clean = 0, skip = 0, needsSetup = 0
const unplayable: { name: string; type: string; reason: string }[] = []
const parityBugs: { name: string; type: string; v: Violation[] }[] = []
const triggerBugs: { name: string; type: string; v: Violation[] }[] = []
const triggerThrew: { name: string; type: string; v: Violation[] }[] = []
const abilityBugs: { name: string; type: string; v: Violation[] }[] = []
const abilityThrew: { name: string; type: string; v: Violation[] }[] = []
let abilityInconclusive = 0
const combatBugs: { name: string; type: string; v: Violation[] }[] = []
const combatThrew: { name: string; type: string; v: Violation[] }[] = []
let n = 0
for (const c of pool) {
  n++; if (n % 150 === 0) console.error(`... ${n}/${pool.length}`)
  const r = guiPlay(c.name)
  if (r.status === 'skip') { skip++ }
  else if (r.status === 'ok') {
    if (r.violations.length) parityBugs.push({ name: c.name, type: c.type, v: r.violations })
    else clean++
  } else if (engineCanPlay(c.name, c.type)) unplayable.push({ name: c.name, type: c.type, reason: r.reason ?? '?' })
  else { needsSetup++; if (VERBOSE) console.log(`  (needs special board) ${c.name}: ${r.reason}`) }

  // phase 2: trigger/response windows (independent of whether the cast phase ran)
  const t = exerciseTriggers(c.name)
  if (t.confirmed.length) triggerBugs.push({ name: c.name, type: c.type, v: t.confirmed })
  if (t.threw.length) triggerThrew.push({ name: c.name, type: c.type, v: t.threw })

  // phase 3: in-play activated abilities
  const ab = exerciseAbilities(c.name)
  if (ab.confirmed.length) abilityBugs.push({ name: c.name, type: c.type, v: ab.confirmed })
  if (ab.threw.length) abilityThrew.push({ name: c.name, type: c.type, v: ab.threw })
  abilityInconclusive += ab.inconclusive

  // phase 4: attacks & the combat prompt chain
  const cb = exerciseCombat(c.name)
  if (cb.confirmed.length) combatBugs.push({ name: c.name, type: c.type, v: cb.confirmed })
  if (cb.threw.length) combatThrew.push({ name: c.name, type: c.type, v: cb.threw })
}

console.log(`\n=== GUI ↔ engine interaction parity: ${pool.length} cards ===`)
console.log(`✓ played + every prompt choice honoured: ${clean}`)
console.log(`● skipped (multi-step blow flow, not modelled): ${skip}`)
console.log(`○ needs a specific board (engine can't play here either): ${needsSetup}`)
console.log(`✗ UNPLAYABLE via GUI flow (engine supports it): ${unplayable.length}`)
console.log(`✗ INTERACTION-PARITY violations (engine offers a choice the GUI/engine then denies): ${parityBugs.length}`)

if (unplayable.length) {
  console.log('\n--- unplayable through the GUI flow ---')
  for (const b of unplayable) console.log(`  ✗ [${b.type}] ${b.name.padEnd(24)} — ${b.reason}`)
}
if (parityBugs.length) {
  console.log('\n--- cast-time interaction-parity violations ---')
  for (const b of parityBugs) { console.log(`  ✗ [${b.type}] ${b.name}`); for (const x of b.v.slice(0, 4)) console.log(`       ${x.where}: ${x.detail}`) }
}

console.log(`\n=== trigger / response windows ===`)
console.log(`✗ CONFIRMED unanswerable trigger prompts (No-continuation / unrenderable / rejected choice): ${triggerBugs.length}`)
console.log(`⚠ hooks that threw when fired (may be imperfect test args — review): ${triggerThrew.length}`)
if (triggerBugs.length) {
  console.log('\n--- confirmed trigger/response bugs ---')
  for (const b of triggerBugs) { console.log(`  ✗ [${b.type}] ${b.name}`); for (const x of b.v.slice(0, 4)) console.log(`       ${x.where}: ${x.detail}`) }
}
if (triggerThrew.length && VERBOSE) {
  console.log('\n--- hooks that threw (review for false positives) ---')
  for (const b of triggerThrew) { console.log(`  ⚠ [${b.type}] ${b.name}`); for (const x of b.v.slice(0, 3)) console.log(`       ${x.where}: ${x.detail}`) }
}

console.log(`\n=== in-play activated abilities ===`)
console.log(`✗ CONFIRMED ability prompt-parity bugs: ${abilityBugs.length}`)
console.log(`⚠ abilities that threw when activated (may be imperfect test setup — review): ${abilityThrew.length}`)
console.log(`○ abilities that didn't activate on the generic board (board-dependent, inconclusive): ${abilityInconclusive}`)
if (abilityBugs.length) {
  console.log('\n--- confirmed ability bugs ---')
  for (const b of abilityBugs) { console.log(`  ✗ [${b.type}] ${b.name}`); for (const x of b.v.slice(0, 4)) console.log(`       ${x.where}: ${x.detail}`) }
}
if (abilityThrew.length && VERBOSE) {
  console.log('\n--- abilities that threw (review) ---')
  for (const b of abilityThrew) { console.log(`  ⚠ [${b.type}] ${b.name}`); for (const x of b.v.slice(0, 3)) console.log(`       ${x.where}: ${x.detail}`) }
}

console.log(`\n=== attacks & the combat prompt chain ===`)
console.log(`✗ CONFIRMED combat prompt-parity bugs: ${combatBugs.length}`)
console.log(`⚠ attacks that threw (review): ${combatThrew.length}`)
if (combatBugs.length) {
  console.log('\n--- confirmed combat bugs ---')
  for (const b of combatBugs) { console.log(`  ✗ [${b.type}] ${b.name}`); for (const x of b.v.slice(0, 4)) console.log(`       ${x.where}: ${x.detail}`) }
}
if (combatThrew.length && VERBOSE) {
  console.log('\n--- attacks that threw (review) ---')
  for (const b of combatThrew) { console.log(`  ⚠ [${b.type}] ${b.name}`); for (const x of b.v.slice(0, 3)) console.log(`       ${x.where}: ${x.detail}`) }
}
