import { registerScript } from '../registry'
import { getCard } from '../../db'
import { siteAt } from '../../../engine/grid'
import { pushLog, checkStateBased } from '../../../engine/effects'

// bonus caster-filter cards unlocked by the same hook:
// 'May be cast by any ally. / Burrow target adjacent minion.'
registerScript('Buried Alive', {
  casterFilter: () => null,
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'adjacent', label: 'target adjacent minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    const site = siteAt(ctx.state, u.x, u.y)
    if (!site || getCard(site.name).thresholds.water > 0 || site.flooded) return ctx.log('No underground there.')
    u.region = 'underground'
    pushLog(ctx.state, ctx.controller, `${u.name} is buried alive!`)
    checkStateBased(ctx.state)
  },
})
