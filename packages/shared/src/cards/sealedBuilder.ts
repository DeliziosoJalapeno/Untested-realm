// The computer's Sealed deck builder: turns a pool of opened boosters into a playable Limited deck,
// the way a careful player would. Also offered to the human as "Suggest a build".
//
//   1. rate every usable spell (bodies first, cheap removal next, situational cards last; nudged by
//      the real-game win-rate statistics in pso.ts)
//   2. pick the one or two elements whose best 24 spells rate highest
//   3. take the 24 best with a sane curve: plenty of cheap plays, a few removal spells, few expensive
//      cards, mostly minions
//   4. build a 15-site atlas: sites from the pool that give the right thresholds, then the supplied
//      basic sites, split by how much of each element the spells ask for
//
// Deterministic: the same pool always gives the same deck.
import { findCard, cardSupport } from './db'
import { cardImpact } from './pso'
import { SEALED_SUPPLIED_AVATAR } from './packs'
import { autofillSealedDeck, MIN_SEALED_SPELLBOOK, type DeckList } from '../engine/decks'
import type { CardDef } from '../engine/types'

export type SealedElement = 'air' | 'earth' | 'fire' | 'water'
const ELEMENTS: readonly SealedElement[] = ['air', 'earth', 'fire', 'water']
const BASIC_SITE: Record<SealedElement, string> = { air: 'Spire', earth: 'Valley', fire: 'Wasteland', water: 'Stream' }

export const SEALED_BOT_SPELLS = MIN_SEALED_SPELLBOOK
export const SEALED_BOT_SITES = 15

const th = (c: CardDef, e: SealedElement): number => Number((c.thresholds as unknown as Record<string, number>)?.[e] ?? 0)
const KEYWORDS = /\b(airborne|ranged|charge|stealth|lethal|spellcaster|burrowing|voidwalk|submerge|immobile)\b/gi
// removal that works on whatever the opponent plays...
const KILLS = /(deals? \d+ damage|\d+-damage|kill target|destroy (target|all) (minion|unit)s?|banish target (minion|unit))/i
// ...as opposed to an answer to one kind of card (Exorcism, Dispel, Boil): situational in Limited
const NARROW = /\b(demon|undead|spirit|beast|mortal|dragon|fire|water|earth|air) (and \w+ )?(minion|aura|site)s?\b|\bartifacts?\b|\bauras?\b/i
const REMOVAL = { test: (text: string) => KILLS.test(text) && !NARROW.test(text) }

/** How much the builder wants a spell in a Limited deck (roughly 0 to 9). */
export function sealedRating(c: CardDef): number {
  const cost = c.cost ?? 0
  let v: number
  if (c.type === 'Minion') {
    const power = c.attack ?? 0
    v = 2.6 + Math.min(power, 7) * 0.85 - Math.max(0, cost - power) * 0.45 // a body, discounted when overpriced
    const kw = new Set((c.text.match(KEYWORDS) ?? []).map((k) => k.toLowerCase()))
    kw.delete('immobile')
    v += Math.min(1.2, kw.size * 0.5)
    if (/\bimmobile\b/i.test(c.text)) v -= 1.2
    if (power === 0) v -= 1
  } else if (c.type === 'Magic') v = REMOVAL.test(c.text) ? 5.2 - Math.max(0, cost - 3) * 0.3 : 2.2
  else if (c.type === 'Aura') v = REMOVAL.test(c.text) ? 3.4 : 1.8
  else v = 1.6 // artifacts: mostly situational in Limited
  if (cost >= 7) v -= 1.5
  else if (cost === 6) v -= 0.6
  v += { Unique: 0.9, Elite: 0.6, Exceptional: 0.2, Ordinary: 0 }[c.rarity ?? 'Ordinary'] ?? 0
  v += Math.max(-1.2, Math.min(1.2, cardImpact(c.name) * 0.4)) // what real games say about the card
  // a heavy threshold is hard to meet in a two-element Limited deck
  const need = ELEMENTS.reduce((n, e) => n + th(c, e), 0)
  if (need >= 3) v -= (need - 2) * 0.5
  return v
}

interface Pick { def: CardDef; rating: number }

/** every copy of every usable spell in the pool, best first */
function spellsOf(pool: Record<string, number>): Pick[] {
  const out: Pick[] = []
  for (const name of Object.keys(pool).sort()) {
    const def = findCard(name)
    if (!def || def.token || def.type === 'Site' || def.type === 'Avatar') continue
    if (cardSupport(def) === 'unsupported') continue
    const rating = sealedRating(def)
    for (let i = 0; i < (pool[name] ?? 0); i++) out.push({ def, rating })
  }
  return out.sort((a, b) => b.rating - a.rating || a.def.name.localeCompare(b.def.name))
}

const castableWith = (c: CardDef, els: readonly SealedElement[]): boolean => ELEMENTS.every((e) => els.includes(e) || th(c, e) === 0)

/** the best `want` spells for these elements, with a curve a Limited deck can play */
function choose(all: Pick[], els: readonly SealedElement[], want: number): Pick[] {
  const pool = all.filter((p) => castableWith(p.def, els))
  const picked: Pick[] = []
  const caps = { dear: 4, nonMinion: 9 }
  let dear = 0, nonMinion = 0
  const take = (p: Pick) => { picked.push(p); if ((p.def.cost ?? 0) >= 6) dear++; if (p.def.type !== 'Minion') nonMinion++ }
  // the cheap plays first: a deck with nothing to do on turns 2 and 3 loses to one that has
  const cheap = pool.filter((p) => p.def.type === 'Minion' && (p.def.cost ?? 0) <= 2 && p.rating >= 2.5).slice(0, 7)
  for (const p of cheap) take(p)
  // and the best few removal spells: a deck of bodies alone has no answer to the other side's best card
  for (const p of pool.filter((q) => q.def.type === 'Magic' && REMOVAL.test(q.def.text) && q.rating >= 3.5).slice(0, 4)) take(p)
  for (const p of pool) {
    if (picked.length >= want) break
    if (picked.includes(p)) continue
    if ((p.def.cost ?? 0) >= 6 && dear >= caps.dear) continue
    if (p.def.type !== 'Minion' && nonMinion >= caps.nonMinion) continue
    take(p)
  }
  for (const p of pool) { if (picked.length >= want) break; if (!picked.includes(p)) take(p) } // the caps left it short
  return picked
}

export interface SealedBuild { deck: DeckList; elements: SealedElement[]; notes: string[] }

/** Build a Sealed deck from a pool. Always returns a legal deck (the supplied Spellslinger and basic
 *  sites fill any gap). */
export function buildSealedDeck(pool: Record<string, number>, name = 'Sealed deck'): SealedBuild {
  const all = spellsOf(pool)
  const want = SEALED_BOT_SPELLS

  // 2. which elements: every single element and every pair, judged by their best `want` spells
  const options: SealedElement[][] = []
  for (let i = 0; i < ELEMENTS.length; i++) {
    options.push([ELEMENTS[i]])
    for (let j = i + 1; j < ELEMENTS.length; j++) options.push([ELEMENTS[i], ELEMENTS[j]])
  }
  let best: { els: SealedElement[]; picks: Pick[]; score: number } | null = null
  for (const els of options) {
    const picks = choose(all, els, want)
    // a short list is topped up with filler later: count each missing card as a poor one
    const score = picks.reduce((n, p) => n + p.rating, 0) + (want - picks.length) * 0.5 + (els.length === 1 ? 1.5 : 0) // one element: steadier thresholds
    if (!best || score > best.score + 1e-9) best = { els, picks, score }
  }
  const els = best!.els
  let picks = best!.picks
  // still short (a thin pool): add the best off-element spells that need only one of a third element
  if (picks.length < want) {
    const rest = all.filter((p) => !picks.includes(p)).sort((a, b) => {
      const off = (p: Pick) => ELEMENTS.reduce((n, e) => n + (els.includes(e) ? 0 : th(p.def, e)), 0)
      return off(a) - off(b) || b.rating - a.rating
    })
    picks = picks.concat(rest.slice(0, want - picks.length))
  }

  const spellbook: Record<string, number> = {}
  for (const p of picks) spellbook[p.def.name] = (spellbook[p.def.name] ?? 0) + 1

  // 4. the atlas. How much of each element do the spells ask for?
  const demand: Record<SealedElement, number> = { air: 0, earth: 0, fire: 0, water: 0 }
  const peak: Record<SealedElement, number> = { air: 0, earth: 0, fire: 0, water: 0 }
  for (const p of picks) for (const e of ELEMENTS) { demand[e] += th(p.def, e); peak[e] = Math.max(peak[e], th(p.def, e)) }
  const used = ELEMENTS.filter((e) => demand[e] > 0)
  const mains = used.length ? used : els
  const atlas: Record<string, number> = {}
  const sources: Record<SealedElement, number> = { air: 0, earth: 0, fire: 0, water: 0 }
  let sites = 0
  const add = (site: string, def?: CardDef | null) => {
    atlas[site] = (atlas[site] ?? 0) + 1; sites++
    for (const e of ELEMENTS) if (def ? th(def, e) > 0 : BASIC_SITE[e] === site) sources[e]++
  }
  // sites from the pool that give one of our elements (they usually do something as well): up to half
  const poolSites = Object.keys(pool).sort()
    .map((n) => findCard(n)).filter((d): d is CardDef => !!d && d.type === 'Site' && cardSupport(d) !== 'unsupported')
    .map((d) => ({ d, fit: mains.reduce((n, e) => n + (th(d, e) > 0 ? 1 : 0), 0) }))
    .filter((x) => x.fit > 0)
    .sort((a, b) => b.fit - a.fit || a.d.name.localeCompare(b.d.name))
  for (const x of poolSites) for (let i = 0; i < (pool[x.d.name] ?? 0) && sites < Math.floor(SEALED_BOT_SITES / 2); i++) add(x.d.name, x.d)
  // the rest: supplied basic sites, always to the element furthest below its share
  const totalDemand = mains.reduce((n, e) => n + Math.max(1, demand[e]), 0)
  const share = (e: SealedElement) => (Math.max(1, demand[e]) / totalDemand) * SEALED_BOT_SITES
  while (sites < SEALED_BOT_SITES) {
    // an element some spell needs three of gets its sources first
    const e = [...mains].sort((a, b) => (sources[a] - Math.max(share(a), peak[a] + 2)) - (sources[b] - Math.max(share(b), peak[b] + 2)) || a.localeCompare(b))[0]
    add(BASIC_SITE[e])
  }

  const deck = autofillSealedDeck({ name, avatar: SEALED_SUPPLIED_AVATAR, spellbook, atlas }, pool)
  const minions = picks.filter((p) => p.def.type === 'Minion').length
  const cap = (e: string) => e[0].toUpperCase() + e.slice(1)
  const notes = [
    `${mains.map(cap).join(' and ')}: ${picks.length} spells (${minions} minions, ${picks.length - minions} other), ${sites} sites.`,
    `Sites by element: ${mains.map((e) => `${cap(e)} ${sources[e]}`).join(', ')}.`,
    `Curve: ${[[0, 2], [3, 4], [5, 99]].map(([lo, hi]) => `${picks.filter((p) => (p.def.cost ?? 0) >= lo && (p.def.cost ?? 0) <= hi).length} at cost ${hi === 99 ? `${lo}+` : `${lo}-${hi}`}`).join(', ')}.`,
  ]
  return { deck, elements: mains, notes }
}
