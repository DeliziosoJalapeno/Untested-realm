import { registerScript } from '../registry'
import { unitsAt, chebyshev } from '../../../engine/grid'

// 'Deal 3 damage to each unit at target location up to two steps away.'
registerScript('Minor Explosion', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location (≤2 steps)' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    const c = ctx.caster!
    if (chebyshev(c, t.square) > 2) return ctx.log('Too far away.')
    const region = t.square.region ?? c.region
    // Damage is simultaneous: the engine's open damage event defers every death until the whole spell
    // resolves, so an Ironclad avatar here with nearby Shield Maidens keeps the Maidens' −1 even when
    // the same 3 damage is lethal to the Maidens (no unit leaves the board mid-blast).
    for (const u of unitsAt(ctx.state, t.square.x, t.square.y, region)) {
      ctx.dealDamage({ unit: u.id }, 3)
    }
  },
})
