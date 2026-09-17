import { registerScript } from '../registry'
import { chebyshev, unitsAt } from '../../../engine/grid'
import { hasSubtype } from '../../../engine/statics'

// 'Deal 4 damage to each other unit at target location near the caster or an allied Dragon.'
registerScript('Incinerate', {
  targets: [{ what: 'square', count: 1, targeted: true, label: 'target location near you or an allied Dragon' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('square' in t)) return
    const caster = ctx.caster!
    const anchors = [caster, ...Object.values(ctx.state.units).filter((u) => u.controller === ctx.controller && hasSubtype(ctx.state, u, 'Dragon'))]
    if (!anchors.some((a) => chebyshev(a, t.square) <= 1)) return ctx.log('Not near the caster or an allied Dragon.')
    const region = t.square.region ?? caster.region
    for (const u of unitsAt(ctx.state, t.square.x, t.square.y, region)) {
      if (u.id !== caster.id) ctx.dealDamage({ unit: u.id }, 4)
    }
  },
})
