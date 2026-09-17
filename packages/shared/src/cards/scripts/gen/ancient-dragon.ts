import { registerScript } from '../registry'
import { chebyshev, unitsAt } from '../../../engine/grid'

// 'Airborne / Tap â†’ Deal 4 damage to each other unit at target location nearby.'
registerScript('Ancient Dragon', {
  abilities: [{
    key: 'breath',
    label: 'Tap â†’ 4 damage to each other unit at a nearby location',
    cost: { tap: true },
    targets: [{ what: 'square', count: 1, targeted: true, label: 'target location nearby' }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('square' in t)) return
      if (chebyshev(self, t.square) > 1) return ctx.log('Too far.')
      for (const u of unitsAt(ctx.state, t.square.x, t.square.y, t.square.region ?? self.region)) {
        if (u.id !== self.id) ctx.dealDamage({ unit: u.id }, 4)
      }
    },
  }],
})
