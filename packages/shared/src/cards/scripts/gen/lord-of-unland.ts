import { registerScript } from '../registry'
import { adjacentSquaresW, occupies } from '../../../engine/grid'
import { terrainAt } from '../../../engine/statics'

/** contiguous (orthogonal) group of water sites containing (x,y); empty if not water */
function bodyOfWater(state: any, x: number, y: number): { x: number; y: number }[] {
  if (terrainAt(state, x, y) !== 'water') return []
  const seen = new Set<string>([`${x},${y}`])
  const out: { x: number; y: number }[] = []
  const stack = [{ x, y }]
  while (stack.length) {
    const cur = stack.pop()!
    out.push(cur)
    for (const sq of adjacentSquaresW(state, cur.x, cur.y)) {
      const k = `${sq.x},${sq.y}`
      if (seen.has(k)) continue
      if (terrainAt(state, sq.x, sq.y) === 'water') {
        seen.add(k)
        stack.push(sq)
      }
    }
  }
  return out
}

// "Submerge / Other allies occupying Lord of Unland's body of water have +1 power."
registerScript('Lord of Unland', {
  grantsPower: (state, self, other) => {
    if (other.id === self.id || other.controller !== self.controller) return 0
    return bodyOfWater(state, self.x, self.y).some((sq) => occupies(other, sq.x, sq.y)) ? 1 : 0
  },
})
