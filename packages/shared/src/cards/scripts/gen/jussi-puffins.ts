import { registerScript } from '../registry'
import { GRID_H, GRID_W, realmIsFlat } from '../../../engine/grid'
import { wrapStepsTo } from '../multi-card-utils/wrap-step'

// 'Airborne, Submerge / Can move as if the opposite edges of the realm were connected.'
// Both pairs of edges: top with bottom, and left with right. None while the realm is flat.
registerScript('Jussi Puffins', {
  extraSteps: (state, unit, from) => {
    if (realmIsFlat(state)) return []
    const out = []
    if (from.y === 0 || from.y === GRID_H - 1) out.push(...wrapStepsTo(state, unit, from, from.x, from.y === 0 ? GRID_H - 1 : 0))
    if (from.x === 0 || from.x === GRID_W - 1) out.push(...wrapStepsTo(state, unit, from, from.x === 0 ? GRID_W - 1 : 0, from.y))
    return out
  },
})
