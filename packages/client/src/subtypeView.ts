// Subtype view (Z / 🏷 button): dims the board & hand and makes every unit, site,
// artifact and hand card of the CURRENTLY SELECTED subtype glow. A top-of-board
// dropdown (with ‹ › arrows) cycles between the subtypes actually present.
//
// Two "special" views are aggregates rather than printed subtypes:
//   - 'Spellcaster' — avatars + anything with the Spellcaster ability (the default)
//   - 'Evil'        — Demon/Undead/Monster or branded (isEvilUnit / isEvilCardName)
// Everything else is a real subtype string (Mortal, Beast, Undead, Relic, …) or a
// site landscape category derived from the site's NAME (Desert, River, Tower, …),
// since most landscape sites carry no printed subtype.
import {
  effSubtypes,
  effKeywords,
  isEvilUnit,
  isEvilCardNameFor,
  cardSubtypesFor,
  getKeywords,
  getCard,
  isCarriableArtifact,
  type GameState,
  type PlayerId,
  type UnitState,
  type PlayerView,
} from '@sorcery/shared'

// Landscape nouns that name a site's terrain — matched against the last word of the
// site's name. Grounded in the actual card pool (Desert/Tower/Village/River/City/…)
// plus common variants, so "Accursed Desert" (no printed subtype) still reads as a Desert.
const LANDSCAPE = new Set([
  'Desert', 'Tower', 'Village', 'River', 'City', 'Town', 'Valley', 'Hills', 'Hill',
  'Bridge', 'Gate', 'Pool', 'Pond', 'Well', 'Ruins', 'Forge', 'Grave', 'Den',
  'Forest', 'Mountain', 'Mountains', 'Lake', 'Sea', 'Swamp', 'Marsh', 'Cave', 'Cavern',
  'Wall', 'Keep', 'Castle', 'Crypt', 'Temple', 'Shrine', 'Oasis', 'Field', 'Fields',
  'Plains', 'Island', 'Grove', 'Glade', 'Meadow', 'Bog', 'Fen', 'Moor', 'Cliff', 'Peak',
  'Mine', 'Cove', 'Bay', 'Harbor', 'Reef', 'Delta', 'Spring', 'Falls', 'Garden', 'Tomb',
  'Barrow', 'Mound',
])

export function siteLandscape(name: string): string | null {
  const w = (name.trim().split(/\s+/).pop() || '')
  const key = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  return LANDSCAPE.has(key) ? key : null
}

// Preferred order for the cycle / dropdown. Present views not listed here are
// appended alphabetically. Default selection is the first entry ('Spellcaster').
export const VIEW_ORDER = [
  'Spellcaster', 'Evil',
  'Airborne', 'Ranged', 'Lethal', 'Voidwalk', 'Submerge', 'Burrowing',
  'Mortal', 'Undead', 'Demon', 'Monster', 'Beast', 'Angel', 'Faerie', 'Spirit',
  'Automaton', 'Giant', 'Troll', 'Dragon', 'Merfolk', 'Dwarf', 'Gnome', 'Goblin',
  'Ogre', 'Sphinx',
  'Relic', 'Weapon', 'Armor', 'Device', 'Document', 'Potion', 'Instruments', 'Carriable', 'Monument',
  'EarthSite', 'WaterSite', 'AirSite', 'FireSite',
  'Desert', 'River', 'Tower', 'Village', 'City', 'Town', 'Valley', 'Hills', 'Bridge',
  'Gate', 'Ruins',
]

const LABEL: Record<string, string> = {
  Spellcaster: 'Spellcasters',
  Evil: 'Evil',
  Faerie: 'Fey',
  Instruments: 'Instruments',
  Carriable: 'Carriable',
  Hills: 'Hills',
  Ruins: 'Ruins',
  Airborne: 'Airborne', Ranged: 'Ranged', Lethal: 'Lethal', Voidwalk: 'Voidwalk', Submerge: 'Submerge', Burrowing: 'Burrowing',
  EarthSite: 'Earth sites', WaterSite: 'Water sites', AirSite: 'Air sites', FireSite: 'Fire sites',
}

export function viewLabel(key: string): string {
  if (LABEL[key]) return LABEL[key]
  return key.endsWith('s') ? key : key + 's'
}

// ---- per-entity matching (also used to gather the "present" set) ----

function unitKeys(st: GameState, u: UnitState): string[] {
  const out: string[] = []
  try {
    const kw = effKeywords(st, u)
    if (u.isAvatar || kw.spellcaster) out.push('Spellcaster')
    if (kw.airborne) out.push('Airborne')
    if (kw.ranged) out.push('Ranged')
    if (kw.lethal) out.push('Lethal')
    if (kw.voidwalk) out.push('Voidwalk')
    if (kw.submerge) out.push('Submerge')
    if (kw.burrowing) out.push('Burrowing')
    if (isEvilUnit(st, u)) out.push('Evil')
    for (const s of effSubtypes(st, u)) out.push(s)
  } catch { /* token/probe defs */ }
  return out
}

// site element categories from its thresholds (Earth/Water/Air/Fire sites)
function siteElementKeys(name: string): string[] {
  const out: string[] = []
  try {
    const th = getCard(name).thresholds as any
    if (th?.earth > 0) out.push('EarthSite')
    if (th?.water > 0) out.push('WaterSite')
    if (th?.air > 0) out.push('AirSite')
    if (th?.fire > 0) out.push('FireSite')
  } catch { /* unknown */ }
  return out
}

function siteKeys(name: string): string[] {
  const out: string[] = []
  try {
    for (const s of getCard(name).subtypes) out.push(s)
  } catch { /* unknown */ }
  const land = siteLandscape(name)
  if (land) out.push(land)
  out.push(...siteElementKeys(name))
  return out
}

function artKeys(st: GameState, me: PlayerId, a: any): string[] {
  const out: string[] = []
  try {
    if (getKeywords(a.name).spellcaster) out.push('Spellcaster')
    if (isCarriableArtifact(a.name)) out.push('Carriable')
    for (const s of cardSubtypesFor(st, a.controller ?? me, a.name)) out.push(s)
  } catch { /* unknown */ }
  return out
}

function handKeys(st: GameState, me: PlayerId, name: string): string[] {
  const out: string[] = []
  try {
    const kw = getKeywords(name) as any
    if (kw.spellcaster) out.push('Spellcaster')
    if (kw.airborne) out.push('Airborne')
    if (kw.ranged) out.push('Ranged')
    if (kw.lethal) out.push('Lethal')
    if (kw.voidwalk) out.push('Voidwalk')
    if (kw.submerge) out.push('Submerge')
    if (kw.burrowing) out.push('Burrowing')
    if (isEvilCardNameFor(st, me, name)) out.push('Evil')
    for (const s of cardSubtypesFor(st, me, name)) out.push(s)
    if (getCard(name).type === 'Site') {
      const land = siteLandscape(name); if (land) out.push(land)
      out.push(...siteElementKeys(name))
    }
  } catch { /* unknown */ }
  return out
}

export function unitMatchesView(st: GameState, u: UnitState, key: string): boolean {
  return unitKeys(st, u).includes(key)
}
export function siteMatchesView(name: string, key: string): boolean {
  return siteKeys(name).includes(key)
}
export function artMatchesView(st: GameState, me: PlayerId, a: any, key: string): boolean {
  return artKeys(st, me, a).includes(key)
}
export function handMatchesView(st: GameState, me: PlayerId, name: string, key: string): boolean {
  return handKeys(st, me, name).includes(key)
}

// The subtypes currently present on the board + your hand, in display order, each
// with a match count. 'Spellcaster' is always present (avatars). Used for both the
// dropdown list and the ‹ › cycle (which only steps through present views).
export function presentViews(st: GameState, me: PlayerId, view: PlayerView): { key: string; count: number }[] {
  const counts = new Map<string, number>()
  const bump = (keys: string[]) => { for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1) }
  for (const u of Object.values(view.units) as UnitState[]) bump(unitKeys(st, u))
  for (const s of Object.values(view.sites) as any[]) { if (s.controller !== null) bump(siteKeys(s.name)) }
  for (const a of Object.values(view.artifacts) as any[]) bump(artKeys(st, me, a))
  for (const cid of view.players[me].hand) { const n = view.cards[cid]?.name; if (n) bump(handKeys(st, me, n)) }
  const present = [...counts.keys()]
  present.sort((a, b) => {
    const ia = VIEW_ORDER.indexOf(a); const ib = VIEW_ORDER.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
  return present.map((k) => ({ key: k, count: counts.get(k)! }))
}
