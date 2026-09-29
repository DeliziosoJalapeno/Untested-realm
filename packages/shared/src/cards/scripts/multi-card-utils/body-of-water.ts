import { getCard } from '../../db'
import { isWaterSite, siteAt } from '../../../engine/grid'
import { connected } from './connected'
import type { GameState } from '../../../engine/types'

/** contiguous body of water containing (x,y), as a set of "x,y" keys. Magellan-aware (wraps the seam)
 *  and uses the canonical isWaterSite so Drought / per-instance water choices are honoured. */
export function bodyOfWater(state: GameState, x: number, y: number): Set<string> {
  const isWater = (sx: number, sy: number) => { const s = siteAt(state, sx, sy); return !!s && isWaterSite(state, s, getCard) }
  return new Set(connected(state, x, y, isWater).map((s) => `${s.x},${s.y}`))
}
