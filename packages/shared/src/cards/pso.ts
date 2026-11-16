// Card statistics from real games on Play Sorcery Online (https://playsorceryonline.com/), read from
// the saved snapshot psoStats.json — refreshed by scripts/pso_sync.ts, never fetched at play time.
// Data from Play Sorcery Online's public data API; any public page that shows it must credit PSO.
import raw from './psoStats.json'

export interface PsoCardStats {
  /** player-games behind the figures */
  n: number
  /** win rate in games where the card was drawn minus games where it stayed in the deck, in
   *  percentage points, shrunk toward 0 for small samples. The same decks and pilots are on both
   *  sides of the subtraction, so this measures the card, not the deck it is played in. */
  impact: number
  /** win rate with the card in the opening hand minus the deck's overall win rate (points, shrunk) */
  opening: number | null
  /** raw win rate of games in which the card was played (confounded by deck strength and game length) */
  played: number | null
  /** % of decks that run it */
  share: number
}
export interface PsoMetaRow { avatars: string[]; colors: string[] | null; share: number; winRate: number | null; games: number | null }

const data = raw as unknown as {
  source: string; format: string; releasedThrough: string; totalGames: number
  cards: Record<string, PsoCardStats>
  meta: { avatars: PsoMetaRow[]; combinations: PsoMetaRow[] }
  siteOpenings: { offsets: { forward: number; right: number }[]; share: number; winRate: number | null; games: number | null }[]
}

export const psoInfo = { source: data.source, format: data.format, releasedThrough: data.releasedThrough, totalGames: data.totalGames }
export const psoMeta = data.meta
export const psoSiteOpenings = data.siteOpenings

export const psoCard = (name: string): PsoCardStats | undefined => data.cards[name]
/** drawn-vs-not-drawn win-rate difference in percentage points; 0 when the card has no reliable data */
export const cardImpact = (name: string): number => data.cards[name]?.impact ?? 0
/** opening-hand win-rate difference in percentage points; 0 when unknown */
export const openingLift = (name: string): number => data.cards[name]?.opening ?? 0
