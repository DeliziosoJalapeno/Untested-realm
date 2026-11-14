// Tutorial boards: a small declarative builder that sets up a mid-game position for a lesson
// (sites, minions, hands, mana, life) on top of a real engine game, so every lesson runs on the
// real rules. Everything placed here uses engine-valid ids, so it is clickable and targetable.
import { createGame, applyAction, newId, getCard, type DeckList, type GameState, type PlayerId, type Region, type UnitState, type ArtifactState } from '@sorcery/shared'

export interface Tut { g: GameState; ids: Record<string, string> }

export interface SceneUnit { key: string; p: PlayerId; name: string; x: number; y: number; region?: Region; tapped?: boolean; sick?: boolean; damage?: number; stealth?: boolean }
export interface Scene {
  /** [your avatar, the coach's avatar] */
  avatars?: [string, string]
  /** spellbook / atlas contents (name → copies) for [you, coach]; draws come from these */
  books?: [Record<string, number>, Record<string, number>]
  atlases?: [Record<string, number>, Record<string, number>]
  collection?: Record<string, number>
  /** avatar squares; default: the middle of each bottom row */
  at?: [[number, number] | null, [number, number] | null]
  sites: [PlayerId, string, number, number][]
  units?: SceneUnit[]
  /** artifacts lying on the ground: [key, name, x, y] */
  loose?: [string, string, number, number][]
  /** cards in your hand / the coach's hand, by name */
  hand?: string[]
  foeHand?: string[]
  /** your mana this turn (default: one per site you control) */
  mana?: number
  life?: [number, number]
  /** cards put on top of your spellbook / atlas, first = top */
  topSpells?: string[]
  topSites?: string[]
  seed?: number
}

const filler = (n: Record<string, number> | undefined, fallback: Record<string, number>) => (n && Object.keys(n).length ? n : fallback)

export function scene(s: Scene): Tut {
  const deck = (i: 0 | 1): DeckList => ({
    name: i === 0 ? 'Lesson deck' : 'Coach deck',
    avatar: s.avatars?.[i] ?? (i === 0 ? 'Sparkmage' : 'Flamecaller'),
    spellbook: filler(s.books?.[i], { 'Foot Soldiers': 4, 'Raal Dromedary': 4, 'Snow Leopard': 4 }),
    atlas: filler(s.atlases?.[i], { Valley: 4, Spire: 4, Wasteland: 4, Stream: 4 }),
    collection: i === 0 ? s.collection : undefined,
  })
  const g = createGame([deck(0), deck(1)], ['You', 'Coach'], s.seed ?? 11, 0)
  // answer any avatar setup prompt, skip the forced first site, keep both hands → your turn 1, main phase
  for (let guard = 0; g.prompts.length && guard < 8; guard++) {
    const p: any = g.prompts[0]
    applyAction(g, p.player, { t: 'prompt', promptId: p.id, choice: p.data?.names?.[0] ?? p.data?.cards?.[0] ?? p.data?.candidates?.[0] ?? false })
  }
  for (const p of g.players) p.firstSiteDone = true
  applyAction(g, 0, { t: 'keepHand' }); applyAction(g, 1, { t: 'keepHand' })
  // opening hands go back under the decks; the lesson deals exactly the cards it teaches with
  for (const p of g.players) {
    for (const id of p.hand.splice(0)) (getCard(g.cards[id].name).type === 'Site' ? p.atlas : p.spellbook).push(id)
  }
  const ids: Record<string, string> = { me: g.players[0].avatarUnitId, foe: g.players[1].avatarUnitId }
  s.at?.forEach((xy, i) => { if (xy) { const a = g.units[g.players[i].avatarUnitId]; a.x = xy[0]; a.y = xy[1] } })
  for (const [p, name, x, y] of s.sites) {
    const cardId = card(g, p, name), id = newId(g, 's')
    g.sites[id] = { id, cardId, name, owner: p, controller: p, x, y, tapped: false, isRubble: false }
    ids[`site:${x},${y}`] = id
  }
  for (const u of s.units ?? []) {
    const cardId = card(g, u.p, u.name), id = newId(g, 'u')
    const unit: UnitState = {
      id, cardId, name: u.name, owner: u.p, controller: u.p, isAvatar: false, x: u.x, y: u.y, region: u.region ?? 'surface',
      tapped: !!u.tapped, damage: u.damage ?? 0, enteredTurn: u.sick ? g.turn : 0, modifiers: [], carrying: [], carryingUnits: [], usedThisTurn: {},
    }
    if (u.stealth) unit.stealth = true
    g.units[id] = unit
    ids[u.key] = id
  }
  for (const [key, name, x, y] of s.loose ?? []) {
    const cardId = card(g, 0, name), id = newId(g, 'a')
    g.artifacts[id] = { id, cardId, name, conjuredBy: 0, x, y, region: 'surface', carriedBy: null, tapped: false } as ArtifactState
    ids[key] = id
  }
  for (const name of s.hand ?? []) { const id = card(g, 0, name); g.players[0].hand.push(id); ids[`hand:${name}`] = id }
  for (const name of s.foeHand ?? []) g.players[1].hand.push(card(g, 1, name))
  for (const name of [...(s.topSpells ?? [])].reverse()) g.players[0].spellbook.unshift(card(g, 0, name))
  for (const name of [...(s.topSites ?? [])].reverse()) g.players[0].atlas.unshift(card(g, 0, name))
  g.players[0].mana = s.mana ?? Object.values(g.sites).filter((x) => x.controller === 0).length
  if (s.life) s.life.forEach((n, i) => { g.units[g.players[i].avatarUnitId].life = n })
  for (const p of g.players) p.established = true
  g.log = []
  return { g, ids }
}

function card(g: GameState, p: PlayerId, name: string): string {
  const id = newId(g, 'c')
  g.cards[id] = { id, name, owner: p }
  return id
}
// ---- small readers the lessons use ----
export const unit = (t: Tut, key: string): UnitState | undefined => t.g.units[t.ids[key]]
export const alive = (t: Tut, key: string): boolean => !!unit(t, key)
export const inHand = (t: Tut, name: string): string | undefined => t.g.players[0].hand.find((id) => t.g.cards[id]?.name === name)
export const siteOn = (t: Tut, x: number, y: number) => Object.values(t.g.sites).find((s) => s.x === x && s.y === y)
export const unitNamed = (t: Tut, name: string, p: PlayerId = 0): UnitState | undefined => Object.values(t.g.units).find((u) => u.name === name && u.controller === p)
export const life = (t: Tut, p: PlayerId): number => t.g.units[t.g.players[p].avatarUnitId]?.life ?? 0
