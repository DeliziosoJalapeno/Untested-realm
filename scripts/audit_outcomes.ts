// Outcome auditor: for each card whose text matches an UNAMBIGUOUS template,
// set up a real scenario, resolve the card, and assert the expected observable
// outcome (via game state / the same values viewFor would expose). Flags cards
// whose effect doesn't do what the text says — the "logic" bug class (a wrong
// or no-op effect that never throws). Reports FAIL (wrong outcome), and skips
// cards it can't set up cleanly.
//   npx tsx scripts/audit_outcomes.ts [--verbose] [--only "Name"]
import {
  createGame, applyAction, avatarOf, starterDecks,
  type GameState, type PlayerId, type Action, type Region,
} from '../packages/shared/src'
import { allCards, getCard } from '../packages/shared/src/cards/db'
import '../packages/shared/src/cards/scripts/index'

const VERBOSE = process.argv.includes('--verbose')
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

const fails: { name: string; text: string; expected: string; got: string }[] = []
const checked: string[] = []

// NOTE: parseTargetRefs identifies targets by id prefix (u=unit, s=site,
// a=artifact), so test ids MUST use those prefixes (high numbers to avoid
// colliding with engine ids like u2/s0).
function place(g: GameState, p: PlayerId, name: string, x: number, y: number) {
  const cardId = `c9${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `s9${g.nextId++}`
  g.sites[id] = { id, cardId, name, owner: p, controller: p, x, y, tapped: false, isRubble: false } as any
}
function summon(g: GameState, p: PlayerId, name: string, x: number, y: number, region: Region = 'surface') {
  const cardId = `c9${g.nextId++}`; g.cards[cardId] = { id: cardId, name, owner: p } as any
  const id = `u9${g.nextId++}`
  g.units[id] = { id, cardId, name, owner: p, controller: p, isAvatar: false, x, y, region, tapped: false, damage: 0, enteredTurn: -5, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {} } as any
  return id
}
function board(): GameState {
  const g = createGame([starterDecks[0], starterDecks[1]], ['A', 'B'], 7, 0)
  applyAction(g, 0, { t: 'keepHand' }); applyAction(g, 1, { t: 'keepHand' })
  // coherent ownership: p0 owns the bottom rows (incl. its avatar at (2,0)),
  // p1 the top rows (incl. its avatar at (2,3)).
  for (let y = 0; y < 4; y++) for (let x = 1; x <= 3; x++) place(g, y <= 1 ? 0 : 1, 'Rustic Village', x, y)
  g.players[0].mana += 50; g.players[1].mana += 50
  g.flow = { noThreshold: { 0: g.turn, 1: g.turn } } as any
  return g
}
function inject(g: GameState, p: PlayerId, name: string) {
  const id = `fzc${g.nextId++}`; g.cards[id] = { id, name, owner: p } as any; g.players[p].hand.push(id); return id
}
function answerFor(g: GameState): any {
  const p = g.prompts[0]; const d = p.data ?? {}
  switch (p.kind) {
    case 'drawDeck': return 'spellbook'
    case 'yesNo': return true
    case 'chooseOption': return (d.options ?? [])[0] ?? null
    case 'nameCard': return (d.names ?? [])[0] ?? 'Fireball'
    case 'chooseCards': { const n = (d.cards ?? []).length; return n ? [0] : [] }
    case 'orderCards': return (d.cards ?? []).map((_: any, i: number) => i)
    case 'chooseTargets': { if (d.upTo) return []; const c = d.candidates ?? d.ids ?? []; return c.length ? [c[0]] : [] }
    case 'chooseSquare': return (d.squares ?? [{ x: 2, y: 1 }])[0]
    default: return null
  }
}
function drain(g: GameState) {
  let guard = 0
  while (g.prompts.length && guard++ < 40) {
    const before = g.prompts[0].id
    const r = applyAction(g, g.prompts[0].player, { t: 'prompt', promptId: g.prompts[0].id, choice: answerFor(g) })
    if (!r.ok && g.prompts[0]?.id === before) { for (const alt of [[], null, false]) { applyAction(g, g.prompts[0].player, { t: 'prompt', promptId: g.prompts[0].id, choice: alt }); if (g.prompts[0]?.id !== before) break } if (g.prompts[0]?.id === before) return }
  }
}
function num(word: string): number {
  const m: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }
  return m[word.toLowerCase()] ?? (Number(word) || 0)
}
function castMagic(g: GameState, name: string, targets?: string[], at?: any): string | null {
  const cid = inject(g, 0, name)
  const res = applyAction(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, targets, at })
  if (!res.ok) return res.error!
  drain(g); return null
}
function fail(name: string, text: string, expected: string, got: string) { fails.push({ name, text, expected, got }) }

const pool = ONLY ? allCards.filter((c) => c.name === ONLY) : allCards
for (const c of pool) {
  const text = (c.text || '').replace(/\n+/g, ' ').trim()
  let m: RegExpMatchArray | null

  // --- TEMPLATE: "(You) gain N life." (whole-text Magic) ---
  if (c.type === 'Magic' && (m = text.match(/^(?:you )?gain (\d+|a|two|three|four|five|six|seven) life\.?$/i))) {
    const want = num(m[1]); const g = board()
    avatarOf(g, 0).life = 1 // create healing headroom (gainLife caps at max)
    const before = avatarOf(g, 0).life!
    const err = castMagic(g, c.name); checked.push(c.name)
    if (err) { if (VERBOSE) console.log(`skip ${c.name}: ${err}`); continue }
    const got = avatarOf(g, 0).life! - before
    if (got !== want) fail(c.name, text, `avatar life +${want}`, `+${got}`)
    continue
  }

  // --- TEMPLATE: whole-text "Draw N spell(s)/card(s)." ---
  if (c.type === 'Magic' && (m = text.match(/^draw (\d+|a|two|three|four|five|six|seven) (spell|card)s?\.?$/i))) {
    const want = num(m[1]); const g = board(); const before = g.players[0].spellbook.length
    const err = castMagic(g, c.name); checked.push(c.name)
    if (err) { if (VERBOSE) console.log(`skip ${c.name}: ${err}`); continue }
    const drew = before - g.players[0].spellbook.length
    if (drew !== want) fail(c.name, text, `spellbook -${want}`, `-${drew}`)
    continue
  }

  // --- TEMPLATE: "Deal N damage to target [minion|unit]." (whole text) ---
  if (c.type === 'Magic' && (m = text.match(/^deal (\d+) damage to target (minion|unit|enemy)\b.*\.?$/i))) {
    const want = Number(m[1]); const g = board()
    // enemy minion adjacent to the p0 avatar (avatar at (2,0), target at (2,1))
    const tgt = summon(g, 1, 'Foot Soldier', 2, 1)
    const err = castMagic(g, c.name, [tgt], { x: 2, y: 1 }); checked.push(c.name)
    if (err) { if (VERBOSE) console.log(`skip ${c.name}: ${err}`); continue }
    const u = g.units[tgt]
    const dealt = u ? u.damage : Math.max(want, 1) // dead => at least lethal (1/1)
    if (u && dealt !== want) fail(c.name, text, `target takes ${want}`, `took ${dealt}`)
    if (!u && want === 0) fail(c.name, text, `target takes 0 (survives)`, `died`)
    continue
  }

  // --- TEMPLATE: "Destroy/Banish target minion." (whole text) ---
  if (c.type === 'Magic' && (m = text.match(/^(destroy|banish) target (minion|unit)\.?$/i))) {
    const verb = m[1].toLowerCase(); const g = board()
    const tgt = summon(g, 1, 'Foot Soldier', 2, 1)
    const cardIdOfTgt = g.units[tgt].cardId
    const err = castMagic(g, c.name, [tgt], { x: 2, y: 1 }); checked.push(c.name)
    if (err) { if (VERBOSE) console.log(`skip ${c.name}: ${err}`); continue }
    if (g.units[tgt]) { fail(c.name, text, `target ${verb}ed (removed from board)`, 'still on board'); continue }
    if (verb === 'banish' && !g.players[1].banished.includes(cardIdOfTgt)) fail(c.name, text, 'card in banished zone', 'not banished')
    if (verb === 'destroy' && !g.players[1].cemetery.includes(cardIdOfTgt)) fail(c.name, text, 'card in cemetery', 'not in cemetery')
    continue
  }

  // --- TEMPLATE: minion "Genesis → Gain N life." ---
  if (c.type === 'Minion' && (m = text.match(/genesis\s*→\s*gain (\d+|a|two|three|four|five|six|seven) life/i))) {
    const want = num(m[1]); const g = board()
    avatarOf(g, 0).life = 1 // headroom
    const before = avatarOf(g, 0).life!
    const cid = inject(g, 0, c.name)
    const res = applyAction(g, 0, { t: 'castSpell', cardId: cid, casterId: g.players[0].avatarUnitId, at: { x: 1, y: 1 } })
    checked.push(c.name)
    if (!res.ok) { if (VERBOSE) console.log(`skip ${c.name}: ${res.error}`); continue }
    drain(g)
    const got = avatarOf(g, 0).life! - before
    if (got !== want) fail(c.name, text, `avatar life +${want}`, `+${got}`)
    continue
  }
}

console.log(`\n=== audit_outcomes: checked ${checked.length} templated cards, ${fails.length} FAILED ===`)
for (const f of fails) {
  console.log(`\n✗ ${f.name}`)
  console.log(`   text:     ${f.text}`)
  console.log(`   expected: ${f.expected}`)
  console.log(`   got:      ${f.got}`)
}
if (VERBOSE) console.log('\nchecked:', checked.join(', '))
