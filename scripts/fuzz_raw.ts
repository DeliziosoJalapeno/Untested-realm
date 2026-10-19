// Raw-action crash fuzzer: the engine must REJECT malformed input, never throw. Other sites embed the engine
// with their own clients, so every action/answer shape a hostile or buggy client could send is fair game.
// Plays real bot games over the 12 precons and, every few steps, fires a batch of malformed actions and
// prompt answers at a CLONE of the live state, recording every throw (deduped by action type + message).
//
//   npx tsx scripts/fuzz_raw.ts [--games 12] [--every 3] [--tries 60] [--seed 1]
import { createGame, applyAction, PRECONS, type GameState, type PlayerId, type Action } from '../packages/shared/src'
import '../packages/shared/src/cards/scripts/index'
import { botAction, botNeedsToAct, botActionKey } from '../packages/client/src/bot'

const argv = process.argv.slice(2)
const arg = (k: string, d: number) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? Number(argv[i + 1]) : d }
const GAMES = arg('games', 12), EVERY = arg('every', 3), TRIES = arg('tries', 60)
let seed = arg('seed', 1)
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]

const JUNK: unknown[] = [null, undefined, -1, 0, 1, 99, NaN, Infinity, 1e12, '', 'x', 'u999', '__proto__', 'constructor', true, false, [], [null], [[]], {}, { x: null }, { x: 'a', y: 'b' }, { x: -5, y: 99 }, 'sq:a,b,c', 'sq:99,99,void', 'sq:-1,-1,surface']
const REGIONS = ['surface', 'underground', 'underwater', 'void', 'sky', 7]

function ids(g: GameState) {
  const p0 = g.players[0], p1 = g.players[1]
  return {
    units: Object.keys(g.units), sites: Object.keys(g.sites), arts: Object.keys(g.artifacts), auras: Object.keys(g.auras),
    hand: [...p0.hand, ...p1.hand], deck: [...p0.spellbook.slice(0, 3), ...p1.atlas.slice(0, 3)], cem: [...p0.cemetery, ...p1.cemetery],
  }
}
/** a value that is sometimes a real id, sometimes junk */
function val(g: GameState, pool: string[]): any { return rand() < 0.6 && pool.length ? pick(pool) : pick(JUNK) }
function sq(): any { return rand() < 0.7 ? { x: Math.floor(rand() * 7) - 1, y: Math.floor(rand() * 6) - 1, region: pick(REGIONS) } : pick(JUNK) }
function targets(g: GameState): any {
  if (rand() < 0.15) return pick(JUNK)
  const I = ids(g)
  const all = [...I.units, ...I.sites, ...I.arts, ...I.auras, ...I.hand]
  const n = Math.floor(rand() * 4)
  return Array.from({ length: n }, () => rand() < 0.3 ? `sq:${Math.floor(rand() * 7) - 1},${Math.floor(rand() * 6) - 1},${pick(REGIONS)}` : val(g, all))
}
function extra(): any {
  if (rand() < 0.3) return pick(JUNK)
  const e: any = {}
  for (const k of ['direction', 'castRegion', 'castOrigin', 'origin', 'teleportPlace', 'giveTo', 'mimicArtifact', 'wallSide', 'x', 'sitePermutation'])
    if (rand() < 0.25) e[k] = k === 'direction' ? pick(['n', 's', 'e', 'w', 'up', null, 3]) : k.endsWith('Origin') || k === 'origin' || k === 'teleportPlace' ? sq() : pick(JUNK)
  return e
}
function garbageAction(g: GameState): Action {
  const I = ids(g)
  const t = pick(['mulligan', 'keepHand', 'drawChoice', 'avatarSite', 'castSpell', 'castSpell', 'castSpell', 'moveAttack', 'moveAttack', 'activate', 'activate', 'pickUp', 'drop', 'endTurn', 'prompt', 'prompt', 'prompt', 'addTime', 'requestInterject', 'endInterject', 'bogus'])
  const a: any = { t }
  switch (t) {
    case 'mulligan': a.back = rand() < 0.5 ? [val(g, I.hand), val(g, I.hand)] : pick(JUNK); break
    case 'drawChoice': a.deck = pick(['spellbook', 'atlas', 'cemetery', null]); break
    case 'avatarSite': a.mode = pick(['draw', 'play', 'x']); a.cardId = val(g, I.hand); a.x = pick([0, 2, 4, -1, 9, NaN, 'a']); a.y = pick([0, 1, 3, -1, 9, NaN]); break
    case 'castSpell': a.cardId = val(g, [...I.hand, ...I.cem, ...I.deck]); a.casterId = val(g, [...I.units, ...I.sites, ...I.arts]); a.targets = targets(g); if (rand() < 0.6) a.at = sq(); if (rand() < 0.6) a.extra = extra(); break
    case 'moveAttack': a.unitId = val(g, I.units); a.path = rand() < 0.8 ? Array.from({ length: Math.floor(rand() * 4) }, sq) : pick(JUNK); if (rand() < 0.6) a.attack = pick([{ unit: val(g, I.units) }, { site: val(g, I.sites) }, null, {}, 'x']); break
    case 'activate': {
      a.sourceId = val(g, [...I.units, ...I.sites, ...I.arts]); a.ability = pick(['ranged', 'trap:spring', 'tap', 'a0', 'x', null])
      const src: any = g.units[a.sourceId] ?? g.sites[a.sourceId] ?? g.artifacts[a.sourceId]
      if (src && rand() < 0.6) { const s: any = (globalThis as any).__getScript?.(src.name); if (s?.abilities?.length) a.ability = pick(s.abilities).key }
      a.targets = targets(g); if (rand() < 0.5) a.at = sq(); a.extra = extra(); break
    }
    case 'pickUp': case 'drop': a.unitId = val(g, I.units); a.artifactIds = rand() < 0.7 ? [val(g, I.arts), val(g, I.arts)] : pick(JUNK); if (rand() < 0.5) a.unitIds = rand() < 0.7 ? [val(g, I.units)] : pick(JUNK); break
    case 'prompt': a.promptId = rand() < 0.85 ? g.prompts[0]?.id ?? 'p1' : pick(JUNK); a.choice = promptGarbage(g); break
    case 'addTime': a.player = pick([0, 1, 2, -1, null, 'x']); a.ms = pick([1000, -5, NaN, 'abc', 1e15, null]); break
  }
  return a
}
/** answers shaped like the prompt's own data (valid ids, off-by-one indices, wrong types) + raw junk */
function promptGarbage(g: GameState): any {
  const p: any = g.prompts[0]
  if (!p || rand() < 0.25) return pick(JUNK)
  const d = p.data ?? {}
  const I = ids(g)
  switch (Math.floor(rand() * 8)) {
    case 0: return d.candidates?.length ? [pick(d.candidates), pick(d.candidates)] : [val(g, I.units)]
    case 1: return d.options?.length ? pick(d.options) : pick(['yes', 'n', 0])
    case 2: return d.squares?.length ? { ...pick(d.squares as any[]), x: pick([0, 99, -1, 'a']) } : sq()
    case 3: return d.cards?.length ? [d.cards.length, -1, 0, 0] : [0, 1, 2]
    case 4: return { strikerId: val(g, I.units), allocation: rand() < 0.5 ? { [val(g, I.units)]: pick([1, -3, 1.5, NaN, 'x', 99]) } : pick(JUNK) }
    case 5: return d.placements?.length ? pick([d.placements.length, -1, '0', null]) : pick(JUNK)
    case 6: return d.edges?.length ? pick([...d.edges.map((e: any) => e.key), 'nope']) : pick(JUNK)
    default: return [{ unitId: val(g, I.units), path: Array.from({ length: 2 }, sq) }, pick(JUNK)]
  }
}

const SHOW = argv.includes('--show-accepted')
const acc: Record<string, number> = {}
const samples: Record<string, string[]> = {}
const crashes = new Map<string, { n: number; action: string; stack: string }>()
let tried = 0, accepted = 0
import('../packages/shared/src/cards/scripts/registry').then(({ getScript }) => {
  ;(globalThis as any).__getScript = getScript
  for (let gi = 0; gi < GAMES; gi++) {
    const g: GameState = createGame([PRECONS[gi % 12], PRECONS[(gi * 5 + 3) % 12]], ['A', 'B'], 500 + gi, 0)
    const banned: Record<number, Set<string>> = { 0: new Set(), 1: new Set() }
    let lastTurn = -1
    for (let step = 0; step < 4000 && g.phase !== 'over'; step++) {
      if (step % EVERY === 0) {
        for (let k = 0; k < TRIES; k++) {
          const clone: GameState = JSON.parse(JSON.stringify(g))
          const a = garbageAction(clone)
          const seat: PlayerId = rand() < 0.5 ? (clone.prompts[0]?.player ?? clone.activePlayer) : (pick([0, 1]) as PlayerId)
          tried++
          try { if (applyAction(clone, seat, a).ok) { accepted++; if (SHOW) { const k = a.t === 'prompt' ? `prompt ${g.prompts[0]?.kind}` : a.t; acc[k] = (acc[k] ?? 0) + 1; if ((samples[k] ??= []).length < 6) samples[k].push(JSON.stringify(a).slice(0, 300) + (g.prompts[0] ? `  data=${JSON.stringify(g.prompts[0].data).slice(0, 200)}` : '')) } } } catch (e: any) {
            const top = String(e?.stack ?? '').split('\n').slice(1, 3).map((l) => l.trim().replace(/^at /, '').replace(/\(.*[\\/](packages[\\/].*)\)$/, '($1)')).join(' ← ')
            const key = `${a.t}: ${e?.message ?? e} @ ${top.split(' ← ')[0]}`
            const c = crashes.get(key)
            if (c) c.n++
            else crashes.set(key, { n: 1, action: JSON.stringify(a, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)).slice(0, 400) + (clone.prompts[0] ? `  [prompt ${clone.prompts[0].kind} ${clone.prompts[0].cont}]` : ''), stack: top })
          }
        }
      }
      if (g.turn !== lastTurn) { lastTurn = g.turn; banned[0].clear(); banned[1].clear() }
      const me = ([0, 1] as PlayerId[]).find((p) => botNeedsToAct(g, p))
      if (me === undefined) break
      const act = botAction(g, me, banned[me])
      const r = applyAction(g, g.prompts[0] ? g.prompts[0].player : me, act)
      if (!r.ok) { banned[me].add(botActionKey(act)); if (g.prompts[0]) break }
    }
    console.log(`game ${gi + 1}/${GAMES}: ${g.phase} turn ${g.turn} — ${tried} raw actions so far, ${crashes.size} distinct crashes`)
  }
  console.log(`\n=== fuzz_raw: ${tried} malformed actions, ${accepted} accepted, ${crashes.size} distinct crashes ===`)
  if (SHOW) for (const k of Object.keys(acc)) console.log(`\naccepted ${k}: ${acc[k]}\n  ` + samples[k].join('\n  '))
  for (const [k, c] of [...crashes].sort((a, b) => b[1].n - a[1].n)) console.log(`\n[${c.n}x] ${k}\n   ${c.action}\n   ${c.stack}`)
})
