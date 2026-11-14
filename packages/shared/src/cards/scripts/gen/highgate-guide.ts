import { registerScript } from '../registry'
import { chebyshevW } from '../../../engine/grid'

// 'Nearby allies are Protected from sites.'
// Protected from X (Codex): no site ability may target, damage, destroy, banish, modify, move or impede
// them. The Guide leads others — he is not his own ally.
registerScript('Highgate Guide', {
  grantsProtection: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || unit.controller !== self.controller || unit.region !== self.region) return []
    return chebyshevW(state, self, unit) <= 1 ? ['sites'] : []
  },
})
