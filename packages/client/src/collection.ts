// Collection mode: booster packs, foils, curios, owned-card storage.
// Persisted in localStorage. Ripping Erik's Curiosa destroys that copy forever.

import { allCards, curioCardNames as curioNames, type CardDef } from '@sorcery/shared'
import * as auth from './auth'

export type Finish = 'std' | 'foil' | 'curio'

export interface Collection {
  /** name → owned copies per finish */
  cards: Record<string, { std: number; foil: number; curio: number }>
  packsOpened: number
  /** names of cards permanently destroyed (ripped Erik's Curiosa copies count down) */
  ripped: number
}

const KEY = 'sorcery-collection'

export function loadCollection(): Collection {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (c && c.cards) return c
  } catch { /* fresh */ }
  return { cards: {}, packsOpened: 0, ripped: 0 }
}

function writeLocal(c: Collection): void {
  localStorage.setItem(KEY, JSON.stringify(c))
}
export function saveCollection(c: Collection): void {
  writeLocal(c)
  // when signed in, mirror the collection to the account (best-effort)
  if (auth.isSignedIn()) void auth.pushCollection(c).catch(() => { /* offline / stale token */ })
}

function isEmptyCollection(c: Collection): boolean {
  return c.packsOpened === 0 && c.ripped === 0 && Object.keys(c.cards).length === 0
}
const EMPTY_COLLECTION: Collection = { cards: {}, packsOpened: 0, ripped: 0 }
// The local collection belongs to whoever the browser is currently "as": a username, or
// 'guest'. Tracking the owner lets us (a) NEVER show/leak one account's collection into
// another, and (b) still migrate a genuine GUEST collection up on first sign-in.
const OWNER_KEY = 'sorcery-collection-owner'
function collectionOwner(): string { return localStorage.getItem(OWNER_KEY) ?? 'guest' }
function setCollectionOwner(o: string): void { localStorage.setItem(OWNER_KEY, o) }

/** on sign-in, make the local collection reflect THIS account: the server is the source
 *  of truth. If the account has no server collection yet, migrate a GUEST browser's cards
 *  up (first sign-in) — but when switching FROM another account, start fresh instead of
 *  inheriting the previous account's collection. */
export async function syncCollectionOnSignIn(username: string): Promise<void> {
  const server = (await auth.fetchCollection()) as Collection | null
  if (server && server.cards && !isEmptyCollection(server)) {
    writeLocal(server) // server wins (don't echo it back)
    setCollectionOwner(username)
    return
  }
  const local = loadCollection()
  if (collectionOwner() === 'guest' && !isEmptyCollection(local)) {
    await auth.pushCollection(local) // genuine guest → account migration
  } else {
    writeLocal(EMPTY_COLLECTION) // new/other account: don't inherit the previous one
  }
  setCollectionOwner(username)
}

/** on logout, drop the account's collection from this browser (back to an empty guest). */
export function clearCollectionOnLogout(): void {
  writeLocal(EMPTY_COLLECTION)
  setCollectionOwner('guest')
}

export function ownedCopies(c: Collection, name: string): number {
  const e = c.cards[name]
  return e ? e.std + e.foil + e.curio : 0
}

function add(c: Collection, name: string, finish: Finish) {
  c.cards[name] = c.cards[name] ?? { std: 0, foil: 0, curio: 0 }
  c.cards[name][finish]++
}

/** permanently destroy one Erik's Curiosa (the rip) — foils burn first, why not */
export function ripEriksCuriosa(c: Collection): boolean {
  const e = c.cards["Erik's Curiosa"]
  if (!e) return false
  if (e.curio > 0) e.curio--
  else if (e.foil > 0) e.foil--
  else if (e.std > 0) e.std--
  else return false
  c.ripped++
  saveCollection(c)
  return true
}

export const SETS = ['Alpha', 'Beta', 'Arthurian Legends', 'Gothic', 'Dragonlord'] as const
export type SetName = (typeof SETS)[number]

const curioSet = new Set<string>(curioNames as string[])

// Avatars ARE in real boosters (at their edition, at their rarity — filled in at DB load),
// so the rare slot can be an Avatar of the set, like a real pack.
function pool(set: SetName, rarity: CardDef['rarity']): CardDef[] {
  return allCards.filter((c) => c.sets.includes(set) && c.rarity === rarity)
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export interface PackCard {
  name: string
  finish: Finish
}

/**
 * Open a 15-card booster: 11 Ordinary, 3 Exceptional, 1 Elite (75%) or
 * Unique (25%) in the rare slot. NB: this is a fan-sim tuning choice (owner
 * ruling: "1 unique every 4 packs"), a touch more generous than real Beta
 * slot odds (~20% Unique) so the collection minigame feels rewarding.
 *
 * FOILS (real Sorcery pull rates, therealisticcollector print-run data):
 * a foil appears in ~1 of every 4 packs (≈25%), NOT ~1 per pack. When a pack
 * has a foil it replaces one card, and its rarity follows the documented
 * distribution — of 17 foils: 7 Ordinary, 6 Exceptional, 3 Elite, 1 Unique
 * (per-pack ≈ Ord 1/9.7, Exc 1/11.3, Elite 1/22.7, Unique 1/68). The rare slot
 * still has a small CURIO chance (only for cards with a documented curio).
 */
export function openPack(set: SetName): PackCard[] {
  const out: PackCard[] = []
  const ordinaries = pool(set, 'Ordinary')
  const exceptionals = pool(set, 'Exceptional')
  const elites = pool(set, 'Elite')
  const uniques = pool(set, 'Unique')
  const nOrd = Math.min(11, ordinaries.length)
  for (let i = 0; i < nOrd; i++) out.push({ name: pick(ordinaries).name, finish: 'std' })
  const nExc = Math.min(3, exceptionals.length)
  for (let i = 0; i < nExc; i++) out.push({ name: pick(exceptionals).name, finish: 'std' })
  const rarePool = Math.random() < 0.25 && uniques.length ? uniques : elites.length ? elites : uniques
  const hasRare = rarePool.length > 0
  if (hasRare) out.push({ name: pick(rarePool).name, finish: 'std' })

  // one foil in ~1/4 packs, rarity-weighted 7:6:3:1 (Ordinary:Exceptional:Elite:Unique)
  if (Math.random() < 0.25) {
    const r = Math.random() * 17
    if (r < 7 && nOrd) foilInto(out, 0, nOrd, ordinaries) // Ordinary slot
    else if (r < 13 && nExc) foilInto(out, nOrd, nExc, exceptionals) // Exceptional slot
    else if (r < 16 && hasRare && elites.length) out[out.length - 1] = { name: pick(elites).name, finish: 'foil' } // Elite in the rare slot
    else if (hasRare && uniques.length) out[out.length - 1] = { name: pick(uniques).name, finish: 'foil' } // Unique in the rare slot
  }

  const rare = out[out.length - 1]
  if (rare && rare.finish === 'std' && curioSet.has(rare.name) && Math.random() < 1 / 50) rare.finish = 'curio'
  return out
}

/** turn one card in the slot range [start, start+count) into a fresh foil of that rarity */
function foilInto(out: PackCard[], start: number, count: number, poolArr: CardDef[]): void {
  if (!poolArr.length) return
  out[start + Math.floor(Math.random() * count)] = { name: pick(poolArr).name, finish: 'foil' }
}

export function addPackToCollection(c: Collection, cards: PackCard[]): void {
  for (const card of cards) add(c, card.name, card.finish)
  c.packsOpened++
  saveCollection(c)
}

// "Players keep all the cards they open!" — credit a Sealed pool (name → copies) to
// the collection, once per room. Guarded by a localStorage set of credited room ids
// so a reconnect/reload doesn't double-count the same pool.
const SEALED_CREDIT_KEY = 'sorcery-sealed-credited'
export function keepSealedPool(roomId: string, pool: Record<string, number>, packs: number): void {
  if (!roomId || !pool || Object.keys(pool).length === 0) return
  let credited: string[] = []
  try { credited = JSON.parse(localStorage.getItem(SEALED_CREDIT_KEY) ?? '[]') } catch { /* fresh */ }
  if (credited.includes(roomId)) return
  const c = loadCollection()
  for (const [name, n] of Object.entries(pool)) for (let i = 0; i < n; i++) add(c, name, 'std')
  c.packsOpened += packs
  saveCollection(c)
  credited.push(roomId)
  localStorage.setItem(SEALED_CREDIT_KEY, JSON.stringify(credited.slice(-200)))
}
