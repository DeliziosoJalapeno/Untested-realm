import { inBounds } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'

/** the orthogonally-connected region of squares containing (x,y) whose members all pass `member` */
export function connected(state: GameState, x: number, y: number, member: (sx: number, sy: number) => boolean): { x: number; y: number }[] {
  if (!member(x, y)) return []
  const seen = new Set([`${x},${y}`])
  const queue = [{ x, y }]
  const out: { x: number; y: number }[] = []
  while (queue.length) {
    const cur = queue.shift()!
    out.push(cur)
    for (const n of [{ x: cur.x + 1, y: cur.y }, { x: cur.x - 1, y: cur.y }, { x: cur.x, y: cur.y + 1 }, { x: cur.x, y: cur.y - 1 }]) {
      const k = `${n.x},${n.y}`
      if (inBounds(n.x, n.y) && !seen.has(k) && member(n.x, n.y)) {
        seen.add(k)
        queue.push(n)
      }
    }
  }
  return out
}
