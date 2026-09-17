import { registerScript } from '../registry'
import { unitsAt, chebyshev } from '../../../engine/grid'
import { hasSubtype } from '../../../engine/statics'

// 'Kill all Mortal minions at target location up to two steps away.'
registerScript('Mortality', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location (≤2 steps)' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    const c = ctx.caster!
    if (chebyshev(c, t.square) > 2) return ctx.log('Too far away.')
    const region = t.square.region ?? c.region
    for (const u of unitsAt(ctx.state, t.square.x, t.square.y, region)) {
      if (!u.isAvatar && hasSubtype(ctx.state, u, 'Mortal')) ctx.kill(u.id)
    }
  },
})
