import { getCard } from '../../db'
import { inBounds, isWaterSite, siteAt } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'

/** contiguous body of water containing (x,y), as a set of "x,y" keys */
export function bodyOfWaterAt(state: GameState, x: number, y: number): Set<string> {
  const out = new Set<string>()
  const start = siteAt(state, x, y)
  if (!start || !isWaterSite(state, start, getCard)) return out
  const stack = [{ x, y }]
  while (stack.length) {
    const cur = stack.pop()!
    const key = `${cur.x},${cur.y}`
    if (out.has(key)) continue
    const site = siteAt(state, cur.x, cur.y)
    if (!site || !isWaterSite(state, site, getCard)) continue
    out.add(key)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (inBounds(cur.x + dx, cur.y + dy)) stack.push({ x: cur.x + dx, y: cur.y + dy })
    }
  }
  return out
}
